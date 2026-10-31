/**
 * Low-Latency Web Audio API Chunk Player
 *
 * Plays streaming audio chunks (base64 WAV or binary) sequentially:
 * - Manages an in-order queue to prevent overlapping speech
 * - Provides immediate stop/cancellation for barge-in
 * - Tracks playing state and volume
 */

export class AudioQueuePlayer {
  private audioContext: AudioContext | null = null;
  private queue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onStateChange?: (isPlaying: boolean) => void;
  private totalChunksEnqueued = 0;
  private totalChunksPlayed = 0;

  constructor(onStateChange?: (isPlaying: boolean) => void) {
    this.onStateChange = onStateChange;
  }

  public getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
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
      source.connect(ctx.destination);
      source.start(0);
      console.log(`[AudioQueuePlayer] AudioContext unlocked successfully (state: ${ctx.state})`);
      return ctx.state === 'running';
    } catch (err: any) {
      console.warn('[AudioQueuePlayer] Failed to unlock AudioContext:', err.message);
      return false;
    }
  }

  /**
   * Enqueues a base64 encoded audio chunk (WAV or raw PCM) and plays it in sequence
   */
  public async enqueueBase64(base64Data: string): Promise<void> {
    try {
      if (!base64Data) return;
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

      // Check for RIFF header
      const isRiff =
        bytes.length >= 4 &&
        bytes[0] === 0x52 && // 'R'
        bytes[1] === 0x49 && // 'I'
        bytes[2] === 0x46 && // 'F'
        bytes[3] === 0x46;   // 'F'

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
        try {
          audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
        } catch {
          // If native decode fails on streaming chunk, strip 44-byte header and parse as raw PCM
          const pcmBytes = bytes.subarray(44);
          audioBuffer = this.createBufferFromPCM(ctx, pcmBytes, sampleRate);
        }
      } else {
        // Raw linear PCM chunk from streaming SSE
        audioBuffer = this.createBufferFromPCM(ctx, bytes, sampleRate);
      }

      if (audioBuffer) {
        this.totalChunksEnqueued++;
        this.queue.push(audioBuffer);
        if (!this.isPlaying) {
          this.playNext();
        }
      }
    } catch (err: any) {
      console.warn('[AudioQueuePlayer] Failed to process audio chunk:', err.message);
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
      return null;
    }
  }

  /**
   * Plays the next AudioBuffer in queue
   */
  private playNext(): void {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentSource = null;
      if (this.onStateChange) this.onStateChange(false);
      return;
    }

    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this.playNext()).catch(() => {});
      return;
    }

    this.isPlaying = true;
    if (this.onStateChange) this.onStateChange(true);

    const buffer = this.queue.shift();
    if (!buffer) return;

    this.totalChunksPlayed++;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    this.currentSource = source;

    source.onended = () => {
      this.playNext();
    };

    source.start(0);
  }

  /**
   * Immediately stops any active audio playback and clears the queue (Barge-In)
   */
  public stop(): void {
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
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
  }
}
