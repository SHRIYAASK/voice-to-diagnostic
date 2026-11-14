/**
 * ApplianceCare AI – High-Pass Preprocessing Biquad Filter
 *
 * Implements a second-order Butterworth high-pass filter (Q = 0.7071)
 * to attenuate low-frequency acoustic rumble from AC compressors, fans,
 * and machinery before reaching VAD and ASR.
 *
 * Characteristics:
 * - Default cutoff: 80 Hz (configurable: 70, 80, 100, 120 Hz)
 * - Sample rate: 16,000 Hz
 * - Internal processing: Normalized Float32 [-1.0, 1.0]
 * - Output: Rounded and clamped Int16 [-32768, 32767]
 * - Persistent per-session state (x1, x2, y1, y2)
 */

export interface HighPassFilterOptions {
  cutoffHz?: number;
  sampleRate?: number;
  q?: number;
}

export class HighPassFilter {
  private readonly sampleRate: number;
  private cutoffHz: number;
  private readonly q: number;

  // Filter biquad coefficients: H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;

  // Persistent delay buffers per session
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(options: HighPassFilterOptions = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.cutoffHz = options.cutoffHz || 80;
    this.q = options.q || 0.7071067811865475; // Butterworth 1 / sqrt(2)
    this.calculateCoefficients();
  }

  /**
   * Calculates Robert Bristow-Johnson (RBJ) high-pass biquad coefficients
   */
  private calculateCoefficients(): void {
    const w0 = (2 * Math.PI * this.cutoffHz) / this.sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * this.q);

    const a0 = 1 + alpha;
    this.b0 = ((1 + cosw0) / 2) / a0;
    this.b1 = (-(1 + cosw0)) / a0;
    this.b2 = ((1 + cosw0) / 2) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  /**
   * Sets a new cutoff frequency and recalculates filter coefficients
   */
  public setCutoff(cutoffHz: number): void {
    if (cutoffHz <= 0 || cutoffHz >= this.sampleRate / 2) return;
    this.cutoffHz = cutoffHz;
    this.calculateCoefficients();
  }

  public getCutoff(): number {
    return this.cutoffHz;
  }

  /**
   * Processes a buffer of PCM16 samples in-place or returns a new Int16Array
   */
  public process(input: Int16Array): Int16Array {
    const len = input.length;
    const output = new Int16Array(len);

    for (let i = 0; i < len; i++) {
      // 1. Convert Int16 to normalized float [-1.0, 1.0]
      const x0 = input[i] / 32768.0;

      // 2. Direct Form I difference equation
      const y0 = this.b0 * x0 + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;

      // 3. Shift history
      this.x2 = this.x1;
      this.x1 = x0;
      this.y2 = this.y1;
      this.y1 = y0;

      // 4. Convert float back to Int16 with rounding and clamping
      const scaled = Math.round(y0 * 32768.0);
      output[i] = scaled > 32767 ? 32767 : scaled < -32768 ? -32768 : scaled;
    }

    return output;
  }

  /**
   * Processes raw Buffer of PCM16 bytes
   */
  public processBuffer(buffer: Buffer): Buffer {
    const int16Count = Math.floor(buffer.length / 2);
    const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, int16Count);
    const filtered = this.process(int16);
    return Buffer.from(filtered.buffer, filtered.byteOffset, filtered.byteLength);
  }

  /**
   * Resets delay history buffers for new session or on discontinuity
   */
  public reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

