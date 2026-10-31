/**
 * Browser Audio Recorder for Low-Latency Real-Time STT
 *
 * Captures microphone stream using Web Audio API:
 * - Downsamples / records at 16,000 Hz, 1 channel (mono)
 * - Converts Float32Array PCM samples to 16-bit linear PCM little-endian ArrayBuffers
 * - Emits audio frame buffers for WebSocket transmission
 */

export interface AudioRecorderOptions {
  sampleRate?: number; // Target sample rate: 16000
  onAudioData: (buffer: ArrayBuffer) => void;
  onError?: (error: Error) => void;
}

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRecording = false;
  private isMuted = false;
  private options: AudioRecorderOptions;

  constructor(options: AudioRecorderOptions) {
    this.options = options;
  }

  /**
   * Requests microphone permission and starts capturing audio frames
   */
  public async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.options.sampleRate || 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: this.options.sampleRate || 16000 });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      // Buffer size: 2048 samples = ~128ms per frame at 16kHz
      this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isRecording || this.isMuted) return;

        const inputChannelData = e.inputBuffer.getChannelData(0);
        const pcm16Buffer = this.floatTo16BitPCM(inputChannelData);
        this.options.onAudioData(pcm16Buffer);
      };

      this.sourceNode.connect(this.processorNode);
      // Route through a zero-gain node to keep the processor active without playing mic audio through speakers
      const muteGain = this.audioContext.createGain();
      muteGain.gain.value = 0;
      this.processorNode.connect(muteGain);
      muteGain.connect(this.audioContext.destination);

      this.isRecording = true;
    } catch (err: any) {
      this.stop();
      if (this.options.onError) {
        this.options.onError(err);
      } else {
        throw err;
      }
    }
  }

  /**
   * Converts Float32Array PCM samples (-1.0 to 1.0) into 16-bit linear PCM little-endian buffer
   */
  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]));
      // Convert to 16-bit signed integer (-32768 to 32767)
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, val, true); // Little-endian
    }

    return buffer;
  }

  /**
   * Mutes microphone capture temporarily
   */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  /**
   * Stops microphone recording and releases audio hardware resources
   */
  public stop(): void {
    this.isRecording = false;

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch {}
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  public get recording(): boolean {
    return this.isRecording;
  }
}
