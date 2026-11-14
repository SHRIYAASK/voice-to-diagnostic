/**
 * Low-Latency Web Audio API Chunk Player
 *
 * Plays streaming audio chunks (base64 WAV or binary) sequentially:
 * - Manages an in-order queue to prevent overlapping speech
 * - Provides immediate stop/cancellation for barge-in
 * - Decodes streaming PCM chunks synchronously without async reordering
 * - Uses dedicated GainNode connected to AudioContext destination
 * - Tracks playing state, volume, and comprehensive diagnostics
 */

export interface AudioPlayerMetrics {
  audioContextState: AudioContextState | 'closed' | 'uninitialized';
  queueDepth: number;
  totalChunksEnqueued: number;
  totalChunksPlayed: number;
  isPlaying: boolean;
  activeTurnId: number;
  sampleRate: number;
}

// Head start given to the first chunk of an utterance so the chunks that follow it have time to arrive
const PLAYBACK_START_LEAD_SECONDS = 0.06;

export class AudioQueuePlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private queue: AudioBuffer[] = [];
  private isPlaying = false;
  // Chunks already scheduled on the audio clock (in play order) that have not finished playing yet
  private scheduledSources: AudioBufferSourceNode[] = [];
  // AudioContext time at which the next chunk has to start so it butts up against the previous one
  private nextStartTime = 0;
  private onStateChange?: (isPlaying: boolean) => void;
  private onError?: (error: Error, stage: string) => void;
  private totalChunksEnqueued = 0;
  private totalChunksPlayed = 0;
  private activeTurnId = 1;

  constructor(
    onStateChange?: (isPlaying: boolean) => void,
    onError?: (error: Error, stage: string) => void
  ) {
    this.onStateChange = onStateChange;
    this.onError = onError;
  }

  public setActiveTurnId(turnId: number): void {
    if (turnId > this.activeTurnId) {
      this.activeTurnId = turnId;
      // Drop any queued chunks from older turn
      this.stop();
    }
  }

  public getQueueDepth(): number {
    return this.queue.length + this.scheduledSources.length;
  }

  public getMetrics(): AudioPlayerMetrics {
    return {
      audioContextState: this.audioContext ? this.audioContext.state : 'uninitialized',
      queueDepth: this.queue.length + this.scheduledSources.length,
      totalChunksEnqueued: this.totalChunksEnqueued,
      totalChunksPlayed: this.totalChunksPlayed,
      isPlaying: this.isPlaying,
      activeTurnId: this.activeTurnId,
      sampleRate: this.audioContext ? this.audioContext.sampleRate : 0,
    };
  }

  public getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);
      this.gainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  /**
   * Read-only tap for UI level meters. Taps the master gain node; playback routing is unchanged.
   */
  public getAnalyser(): AnalyserNode | null {
    const ctx = this.audioContext;
    if (!ctx || ctx.state === 'closed' || !this.gainNode) return null;
    if (!this.analyserNode || this.analyserNode.context !== ctx) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      this.gainNode.connect(analyser);
      this.analyserNode = analyser;
    }
    return this.analyserNode;
  }

  /**
   * Smoothly adjusts the playback volume using the master GainNode.
   * Used for fast ducking (e.g. 0.2x volume) and smooth volume restoration (1.0x).
   */
  public setVolume(volume: number, rampMs: number = 60): void {
    const ctx = this.getContext();
    if (!this.gainNode || !ctx) return;
    try {
      const now = ctx.currentTime;
      const target = Math.max(0, Math.min(1.0, volume));
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(target, now + rampMs / 1000.0);
    } catch (err: any) {
      console.warn('[AudioQueuePlayer] setVolume error:', err.message);
    }
  }

  /**
   * Explicitly unlocks and resumes the AudioContext within a synchronous user gesture.
   * Plays a 1-sample silent buffer to satisfy browser Autoplay Policy and activate audio hardware.
   */
  public async unlock(): Promise<boolean> {
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const buffer = ctx.createBuffer(1, 1, 24000);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode || ctx.destination);
      source.start(0);
      console.log(`[AudioQueuePlayer] AudioContext unlocked successfully (state: ${ctx.state}, sampleRate: ${ctx.sampleRate}Hz)`);
      return ctx.state === 'running';
    } catch (err: any) {
      console.warn('[AudioQueuePlayer] Failed to unlock AudioContext:', err.message);
      if (this.onError) this.onError(err, 'UNLOCK');
      return false;
    }
  }

  /**
   * Enqueues a base64 encoded audio chunk (WAV or raw PCM) and plays it in sequence.
   * Drops chunk if it belongs to an outdated turn.
   */
  public async enqueueBase64(base64Data: string, turnId?: number): Promise<void> {
    try {
      if (!base64Data) return;
      if (typeof turnId === 'number' && turnId < this.activeTurnId) {
        // Discard stale audio chunk from older turn
        return;
      }
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      if (len === 0) return;

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Check for RIFF/WAVE header
      const isRiff =
        bytes.length >= 12 &&
        bytes[0] === 0x52 && // 'R'
        bytes[1] === 0x49 && // 'I'
        bytes[2] === 0x46 && // 'F'
        bytes[3] === 0x46 && // 'F'
        bytes[8] === 0x57 && // 'W'
        bytes[9] === 0x41 && // 'A'
        bytes[10] === 0x56 && // 'V'
        bytes[11] === 0x45; // 'E'

      // Extract sample rate from WAV header if present (bytes 24-27)
      let sampleRate = 24000;
      if (isRiff && bytes.length >= 28) {
        const headerRate = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24);
        if (headerRate >= 8000 && headerRate <= 48000) {
          sampleRate = headerRate;
        }
      }

      let audioBuffer: AudioBuffer | null = null;

      if (isRiff) {
        // Find 'data' subchunk offset and size
        let dataOffset = 36;
        for (let i = 12; i < Math.min(bytes.length - 8, 128); i++) {
          if (
            bytes[i] === 0x64 &&     // 'd'
            bytes[i + 1] === 0x61 && // 'a'
            bytes[i + 2] === 0x74 && // 't'
            bytes[i + 3] === 0x61    // 'a'
          ) {
            dataOffset = i;
            break;
          }
        }

        const dataSize =
          bytes.length >= dataOffset + 8
            ? bytes[dataOffset + 4] |
              (bytes[dataOffset + 5] << 8) |
              (bytes[dataOffset + 6] << 16) |
              (bytes[dataOffset + 7] << 24)
            : 0;

        const isStreamingChunk = dataSize === -1 || (dataSize >>> 0) === 0xffffffff || bytes.length < dataOffset + 8 + dataSize;

        if (isStreamingChunk) {
          // Streaming chunk with 44-byte header: strip header and decode PCM directly to prevent async reordering
          const pcmPayload = bytes.subarray(dataOffset + 8);
          audioBuffer = this.createBufferFromPCM(ctx, pcmPayload, sampleRate);
        } else {
          // Complete self-contained WAV file (e.g. REST fallback)
          try {
            audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
          } catch {
            const pcmPayload = bytes.subarray(dataOffset + 8);
            audioBuffer = this.createBufferFromPCM(ctx, pcmPayload, sampleRate);
          }
        }
      } else {
        // Pure raw linear PCM chunk from streaming SSE
        audioBuffer = this.createBufferFromPCM(ctx, bytes, sampleRate);
      }

      if (audioBuffer) {
        this.totalChunksEnqueued++;
        this.queue.push(audioBuffer);
        // Schedule every chunk as soon as it arrives (not only when idle) so playback stays gapless
        this.playNext();
      }
    } catch (err: any) {
      console.warn('[AudioQueuePlayer] Failed to process audio chunk:', err.message);
      if (this.onError) this.onError(err, 'ENQUEUE');
    }
  }

  /**
   * Direct PCM to AudioBuffer conversion (zero async overhead, safe against odd-byte bounds)
   */
  private createBufferFromPCM(ctx: AudioContext, pcmBytes: Uint8Array, sampleRate: number): AudioBuffer | null {
    const numSamples = Math.floor(pcmBytes.byteLength / 2);
    if (numSamples <= 0) return null;

    try {
      const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, numSamples * 2);

      for (let i = 0; i < numSamples; i++) {
        channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
      }

      return audioBuffer;
    } catch (err: any) {
      console.warn('[AudioQueuePlayer] createBufferFromPCM error:', err.message);
      if (this.onError) this.onError(err, 'PCM_DECODE');
      return null;
    }
  }

  /**
   * Schedules every queued AudioBuffer on the AudioContext clock, each starting exactly where the
   * previous one ends. Starting chunks from `onended` leaves a gap of a few ms between ~10-85 ms
   * chunks, and each gap is a hard cut in the waveform, heard as crackling.
   */
  private playNext(): void {
    if (this.queue.length === 0) return;

    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this.playNext()).catch(() => {});
      return;
    }

    while (this.queue.length > 0) {
      const buffer = this.queue.shift();
      if (!buffer) break;

      const lead = this.scheduledSources.length === 0 ? PLAYBACK_START_LEAD_SECONDS : 0;
      const startAt = Math.max(this.nextStartTime, ctx.currentTime + lead);
      this.nextStartTime = startAt + buffer.duration;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode || ctx.destination);

      source.onended = () => {
        const index = this.scheduledSources.indexOf(source);
        if (index !== -1) this.scheduledSources.splice(index, 1);
        this.totalChunksPlayed++;
        if (this.scheduledSources.length > 0) {
          if (this.onStateChange) this.onStateChange(true);
        } else {
          this.isPlaying = false;
          if (this.onStateChange) this.onStateChange(false);
        }
      };

      this.scheduledSources.push(source);
      source.start(startAt);

      if (!this.isPlaying) {
        this.isPlaying = true;
        if (this.onStateChange) this.onStateChange(true);
      }
    }
  }

  /**
   * Immediately stops any active audio playback and clears the queue (Barge-In)
   */
  public stop(): void {
    this.queue = [];
    // Chunks are scheduled ahead of time, so cancel every one of them; detach onended first
    // so stale callbacks can't fire after the stop.
    const scheduled = this.scheduledSources;
    this.scheduledSources = [];
    for (const source of scheduled) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.nextStartTime = 0;
    if (this.gainNode && this.audioContext && this.audioContext.state !== 'closed') {
      try {
        const now = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(1.0, now);
      } catch {}
    }
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange(false);
  }

  public get playing(): boolean {
    return this.isPlaying;
  }

  public close(): void {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.gainNode = null;
  }
}
