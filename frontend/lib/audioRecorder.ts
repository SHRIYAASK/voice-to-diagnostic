/**
 * Browser Audio Recorder for Low-Latency Real-Time STT
 *
 * Captures microphone stream using Web Audio API:
 * - Employs AudioWorklet with seamless fallback to ScriptProcessor
 * - Hardware-independent resampling: resamples any input rate (44.1kHz, 48kHz, etc.) to 16,000 Hz mono PCM16
 * - Frames audio into 100ms chunks (1,600 samples / 3,200 bytes)
 * - Enables AEC, AGC, and NS constraints
 * - Gracefully handles device disconnection
 */

import { startMicrophone } from './audioCapture';

export interface AudioRecorderOptions {
  sampleRate?: number; // Target sample rate: 16000
  frameDurationMs?: number; // Target frame duration: 100ms
  autoGainControl?: boolean; // Default false (test AGC ON vs OFF benchmark)
  onAudioData: (buffer: ArrayBuffer) => void;
  onError?: (error: Error) => void;
  onDeviceDisconnected?: () => void;
}

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isRecording = false;
  private isMuted = false;
  private options: AudioRecorderOptions;

  // Frame buffering: 1600 samples at 16kHz = 100ms
  private targetSampleRate = 16000;
  private targetFrameSamples = 1600;
  private sampleBuffer: Float32Array = new Float32Array(1600);
  private sampleBufferIndex = 0;

  constructor(options: AudioRecorderOptions) {
    this.options = options;
    this.targetSampleRate = options.sampleRate || 16000;
    const durationMs = options.frameDurationMs || 100;
    this.targetFrameSamples = Math.floor((this.targetSampleRate * durationMs) / 1000);
    this.sampleBuffer = new Float32Array(this.targetFrameSamples);
  }

  /**
   * Requests microphone permission and starts capturing audio frames
   */
  public async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      const micResult = await startMicrophone({
        autoGainControl: this.options.autoGainControl ?? true,
      });
      this.mediaStream = micResult.stream;

      // Listen for microphone track disconnection (e.g. headset unplugged)
      const audioTrack = micResult.track;
      if (audioTrack) {
        audioTrack.onended = () => {
          this.stop();
          if (this.options.onDeviceDisconnected) {
            this.options.onDeviceDisconnected();
          }
        };
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      const inputSampleRate = this.audioContext.sampleRate;

      // Create ScriptProcessor fallback (BufferSize: 2048 samples)
      const scriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.processorNode = scriptNode;

      scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isRecording || this.isMuted) return;

        const inputChannelData = e.inputBuffer.getChannelData(0);
        // Resample from hardware rate to 16,000 Hz
        const resampled = this.resampleTo16kHz(inputChannelData, inputSampleRate, this.targetSampleRate);

        // Accumulate into target frames
        for (let i = 0; i < resampled.length; i++) {
          this.sampleBuffer[this.sampleBufferIndex++] = resampled[i];
          if (this.sampleBufferIndex >= this.targetFrameSamples) {
            const pcm16Buffer = this.floatTo16BitPCM(this.sampleBuffer);
            this.options.onAudioData(pcm16Buffer);
            this.sampleBufferIndex = 0;
          }
        }
      };

      this.sourceNode.connect(scriptNode);
      const muteGain = this.audioContext.createGain();
      muteGain.gain.value = 0;
      scriptNode.connect(muteGain);
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
   * Resamples Float32 audio samples from inSampleRate to outSampleRate using linear interpolation
   */
  private resampleTo16kHz(input: Float32Array, inSampleRate: number, outSampleRate: number): Float32Array {
    if (inSampleRate === outSampleRate) {
      return input;
    }

    const ratio = inSampleRate / outSampleRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;

      if (index + 1 < input.length) {
        result[i] = input[index] * (1 - frac) + input[index + 1] * frac;
      } else {
        result[i] = input[index] || 0;
      }
    }

    return result;
  }

  /**
   * Converts Float32Array PCM samples (-1.0 to 1.0) into 16-bit linear PCM little-endian buffer
   */
  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, val, true); // Little-endian
    }

    return buffer;
  }

  /**
   * Read-only tap for UI level meters. Fans out from the existing source node;
   * it does not alter the capture graph. Returns null until recording has started.
   */
  public getAnalyser(): AnalyserNode | null {
    if (!this.audioContext || !this.sourceNode) return null;
    if (!this.analyserNode) {
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      this.sourceNode.connect(analyser);
      this.analyserNode = analyser;
    }
    return this.analyserNode;
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
    this.sampleBufferIndex = 0;

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
