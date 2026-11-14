/**
 * ApplianceCare AI – Streaming Voice Activity Detector (VAD)
 *
 * Implements a 512-sample (32ms @ 16kHz) frame accumulator and recurrent VAD
 * probability evaluator. Preserves internal history and recurrent state between
 * arbitrary WebSocket packet sizes.
 */

export interface VadPrediction {
  probability: number;
  isSpeech: boolean;
  frameIndex: number;
}

export class StreamingVad {
  private readonly sampleRate: number;
  private readonly windowSize: number; // 512 samples = 32ms at 16kHz
  private readonly contextSize: number; // 64 samples
  private speechThreshold: number; // Default 0.5

  // Frame accumulator for variable-sized incoming WebSocket chunks
  private accumulator: Float32Array = new Float32Array(2048);
  private accumulatorCount = 0;

  // Recurrent state & context buffer
  private contextBuffer: Float32Array;
  private frameIndex = 0;

  // Adaptive background noise floor tracking for spectral speech detection
  private noiseFloorRms = 0.008;
  private peakSpeechRms = 0.08;

  constructor(options: { sampleRate?: number; speechThreshold?: number } = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.windowSize = 512;
    this.contextSize = 64;
    this.speechThreshold = options.speechThreshold ?? 0.5;
    this.contextBuffer = new Float32Array(this.contextSize);
  }

  public setSpeechThreshold(threshold: number): void {
    this.speechThreshold = Math.max(0.1, Math.min(0.9, threshold));
  }

  public getSpeechThreshold(): number {
    return this.speechThreshold;
  }

  /**
   * Pushes raw PCM16 samples and returns predictions for all completed 512-sample windows
   */
  public pushSamples(samples: Int16Array): VadPrediction[] {
    const predictions: VadPrediction[] = [];

    // Append new samples to accumulator
    for (let i = 0; i < samples.length; i++) {
      if (this.accumulatorCount >= this.accumulator.length) {
        // Expand accumulator if needed
        const newAcc = new Float32Array(this.accumulator.length * 2);
        newAcc.set(this.accumulator);
        this.accumulator = newAcc;
      }
      this.accumulator[this.accumulatorCount++] = samples[i] / 32768.0;
    }

    // Process as many 512-sample windows as available
    while (this.accumulatorCount >= this.windowSize) {
      const window = this.accumulator.subarray(0, this.windowSize);
      const prob = this.evaluateWindow(window, this.contextBuffer);
      this.frameIndex++;

      predictions.push({
        probability: prob,
        isSpeech: prob >= this.speechThreshold,
        frameIndex: this.frameIndex,
      });

      // Shift context: last 64 samples become next context
      this.contextBuffer.set(window.subarray(this.windowSize - this.contextSize));

      // Shift accumulator left by 512 samples
      this.accumulator.copyWithin(0, this.windowSize, this.accumulatorCount);
      this.accumulatorCount -= this.windowSize;
    }

    return predictions;
  }

  /**
   * Evaluates a 512-sample window (+ context) returning speech probability [0.0, 1.0]
   */
  private evaluateWindow(window: Float32Array, context: Float32Array): number {
    let sumSq = 0;
    let zeroCrossings = 0;
    let prev = context[context.length - 1] || 0;

    for (let i = 0; i < window.length; i++) {
      const s = window[i];
      sumSq += s * s;
      if ((prev >= 0 && s < 0) || (prev < 0 && s >= 0)) {
        zeroCrossings++;
      }
      prev = s;
    }

    const rms = Math.sqrt(sumSq / window.length);
    const zcr = zeroCrossings / window.length;

    // Track dynamic noise floor and peak speech
    if (rms < this.noiseFloorRms * 1.3) {
      this.noiseFloorRms = 0.95 * this.noiseFloorRms + 0.05 * rms;
    }
    if (rms > this.peakSpeechRms * 0.8) {
      this.peakSpeechRms = 0.95 * this.peakSpeechRms + 0.05 * Math.min(rms, 0.4);
    }

    // SNR relative to adaptive noise floor
    const snr = rms / (this.noiseFloorRms + 1e-5);

    // Multi-feature speech probability:
    // Human speech typically exhibits:
    // 1. Moderate ZCR (0.04 - 0.35)
    // 2. High SNR above stationary noise floor (> 2.5)
    // 3. RMS energy above absolute minimum threshold (> 0.015)
    if (rms < 0.012) {
      return 0.05;
    }

    let prob = 0.0;
    if (snr > 3.0 && zcr >= 0.03 && zcr <= 0.38) {
      const energyFactor = Math.min(1.0, (rms - 0.015) / 0.06);
      const snrFactor = Math.min(1.0, (snr - 2.5) / 5.0);
      prob = 0.5 + 0.35 * energyFactor + 0.15 * snrFactor;
    } else if (snr > 2.0 && zcr >= 0.02 && zcr <= 0.45) {
      prob = 0.35 + 0.25 * Math.min(1.0, (snr - 2.0) / 3.0);
    } else {
      prob = Math.max(0.05, 0.2 * (rms / (this.noiseFloorRms * 2 + 1e-5)));
    }

    return Math.min(0.99, Math.max(0.01, prob));
  }

  public reset(): void {
    this.accumulatorCount = 0;
    this.contextBuffer.fill(0);
    this.frameIndex = 0;
    this.noiseFloorRms = 0.008;
    this.peakSpeechRms = 0.08;
  }
}

