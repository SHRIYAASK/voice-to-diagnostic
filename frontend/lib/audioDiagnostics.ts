/**
 * Development Audio Diagnostics Utility — ApplianceCare AI
 *
 * Verifies browser Web Audio API capabilities:
 * 1. AudioContext initialization and state
 * 2. 440 Hz test tone generation
 * 3. Synthetic WAV buffer playback
 * 4. Streaming PCM chunk simulation through AudioQueuePlayer
 * 5. Latency and sample rate verification
 */

import { AudioQueuePlayer } from './audioPlayer';

export interface DiagnosticTestResult {
  testName: string;
  success: boolean;
  durationMs: number;
  details: string;
  error?: string;
}

export interface AudioSystemReport {
  timestamp: string;
  audioContextState: string;
  sampleRate: number;
  tests: DiagnosticTestResult[];
}

export class AudioDiagnostics {
  /**
   * Test 1: Generates a short 440 Hz sine wave beep directly via Web Audio API oscillator
   */
  public static async testTone(durationSeconds = 0.5): Promise<DiagnosticTestResult> {
    const start = performance.now();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + durationSeconds);

      await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000 + 50));
      await ctx.close();

      return {
        testName: '440Hz Sine Tone Playback',
        success: true,
        durationMs: Math.round(performance.now() - start),
        details: `Played 440Hz tone for ${durationSeconds}s at sampleRate ${ctx.sampleRate}Hz`,
      };
    } catch (err: any) {
      return {
        testName: '440Hz Sine Tone Playback',
        success: false,
        durationMs: Math.round(performance.now() - start),
        details: 'Failed to generate test tone',
        error: err.message,
      };
    }
  }

  /**
   * Test 2: Generates a synthetic 24kHz 16-bit mono WAV buffer and verifies decode & playback
   */
  public static async testSyntheticWav(): Promise<DiagnosticTestResult> {
    const start = performance.now();
    try {
      const sampleRate = 24000;
      const numSamples = 2400; // 100ms
      const buffer = new ArrayBuffer(44 + numSamples * 2);
      const view = new DataView(buffer);

      // RIFF identifier
      view.setUint32(0, 0x52494646, false); // 'RIFF'
      view.setUint32(4, 36 + numSamples * 2, true);
      view.setUint32(8, 0x57415645, false); // 'WAVE'

      // fmt subchunk
      view.setUint32(12, 0x666d7420, false); // 'fmt '
      view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
      view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
      view.setUint16(22, 1, true); // NumChannels (1)
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true); // ByteRate
      view.setUint16(32, 2, true); // BlockAlign
      view.setUint16(34, 16, true); // BitsPerSample

      // data subchunk
      view.setUint32(36, 0x64617461, false); // 'data'
      view.setUint32(40, numSamples * 2, true);

      // Fill with 500 Hz tone
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const sample = Math.sin(2 * Math.PI * 500 * t) * 16000;
        view.setInt16(44 + i * 2, sample, true);
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      const decoded = await ctx.decodeAudioData(buffer);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.start(0);

      await new Promise((resolve) => setTimeout(resolve, 150));
      await ctx.close();

      return {
        testName: 'Synthetic 24kHz WAV Playback',
        success: true,
        durationMs: Math.round(performance.now() - start),
        details: `Decoded & played 100ms synthetic WAV with ${decoded.numberOfChannels} channel(s)`,
      };
    } catch (err: any) {
      return {
        testName: 'Synthetic 24kHz WAV Playback',
        success: false,
        durationMs: Math.round(performance.now() - start),
        details: 'Failed to decode synthetic WAV',
        error: err.message,
      };
    }
  }

  /**
   * Test 3: Tests streaming PCM chunks via AudioQueuePlayer
   */
  public static async testStreamingQueuePlayer(): Promise<DiagnosticTestResult> {
    const start = performance.now();
    try {
      let playbackStarted = false;
      let playbackEnded = false;

      const player = new AudioQueuePlayer((isPlaying) => {
        if (isPlaying) playbackStarted = true;
        if (!isPlaying && playbackStarted) playbackEnded = true;
      });

      await player.unlock();

      // Create 3 simulated 16-bit PCM chunks (50ms each at 24kHz)
      for (let chunkIdx = 0; chunkIdx < 3; chunkIdx++) {
        const numSamples = 1200; // 50ms at 24kHz
        const bytes = new Uint8Array(numSamples * 2);
        const view = new DataView(bytes.buffer);
        const freq = 300 + chunkIdx * 100;

        for (let i = 0; i < numSamples; i++) {
          const sample = Math.sin((2 * Math.PI * freq * i) / 24000) * 12000;
          view.setInt16(i * 2, sample, true);
        }

        // Convert to base64
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);

        await player.enqueueBase64(b64, 1);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
      const metrics = player.getMetrics();
      player.close();

      return {
        testName: 'AudioQueuePlayer Streaming Simulation',
        success: metrics.totalChunksEnqueued === 3 && metrics.totalChunksPlayed > 0,
        durationMs: Math.round(performance.now() - start),
        details: `Enqueued: ${metrics.totalChunksEnqueued}, Played: ${metrics.totalChunksPlayed}, Final queue: ${metrics.queueDepth}`,
      };
    } catch (err: any) {
      return {
        testName: 'AudioQueuePlayer Streaming Simulation',
        success: false,
        durationMs: Math.round(performance.now() - start),
        details: 'Streaming player simulation failed',
        error: err.message,
      };
    }
  }

  /**
   * Runs the complete diagnostic suite and returns a structured report
   */
  public static async runAllDiagnostics(): Promise<AudioSystemReport> {
    const toneResult = await this.testTone(0.3);
    const wavResult = await this.testSyntheticWav();
    const queueResult = await this.testStreamingQueuePlayer();

    const AudioCtx = typeof window !== 'undefined' ? window.AudioContext || (window as any).webkitAudioContext : null;
    let sampleRate = 0;
    let state = 'unknown';

    if (AudioCtx) {
      try {
        const temp = new AudioCtx();
        sampleRate = temp.sampleRate;
        state = temp.state;
        temp.close().catch(() => {});
      } catch {}
    }

    return {
      timestamp: new Date().toISOString(),
      audioContextState: state,
      sampleRate,
      tests: [toneResult, wavResult, queueResult],
    };
  }
}

