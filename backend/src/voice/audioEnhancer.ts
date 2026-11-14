/**
 * ApplianceCare AI – Audio Enhancement Interface & Dual-Path Modules
 *
 * Provides a standardized interface for noise suppression and enhancement.
 * Decouples the speech enhancement model (Browser NS, WebRTC APM, DeepFilterNet)
 * from Gnani ASR and diagnostic logic.
 */

export interface AudioEnhancer {
  initialize(sampleRate: number, channels: number): Promise<void>;
  process(input: Int16Array): Promise<Int16Array>;
  processBuffer(buffer: Buffer): Promise<Buffer>;
  reset(): void;
  dispose(): Promise<void>;
  getName(): string;
}

/**
 * Baseline Pass-Through Enhancer:
 * Relies on browser-side native WebRTC noiseSuppression: true
 * without applying destructive duplicate filtering on the server.
 */
export class PassThroughAudioEnhancer implements AudioEnhancer {
  public async initialize(_sampleRate: number, _channels: number): Promise<void> {}

  public async process(input: Int16Array): Promise<Int16Array> {
    return input;
  }

  public async processBuffer(buffer: Buffer): Promise<Buffer> {
    return buffer;
  }

  public reset(): void {}

  public async dispose(): Promise<void> {}

  public getName(): string {
    return 'passthrough_browser_ns';
  }
}

/**
 * WebRTC Spectral Noise Reduction Adapter:
 * Applies a lightweight spectral subtraction gate to suppress stationary
 * AC motor hum and HVAC blower air turbulence.
 */
export class WebRtcAudioEnhancer implements AudioEnhancer {
  private sampleRate = 16000;
  private noiseFloorEstimate = 0.005;
  private alpha = 0.98; // Noise floor tracking smoothing factor
  private beta = 1.25;  // Over-subtraction factor for aggressive hum suppression

  public async initialize(sampleRate: number = 16000, _channels: number = 1): Promise<void> {
    this.sampleRate = sampleRate;
    this.noiseFloorEstimate = 0.005;
  }

  public async process(input: Int16Array): Promise<Int16Array> {
    const len = input.length;
    const output = new Int16Array(len);

    // Compute short-term energy
    let energySum = 0;
    for (let i = 0; i < len; i++) {
      const s = input[i] / 32768.0;
      energySum += s * s;
    }
    const frameEnergy = Math.sqrt(energySum / len);

    // Update stationary noise floor estimate during quiet segments
    if (frameEnergy < this.noiseFloorEstimate * 1.5) {
      this.noiseFloorEstimate = this.alpha * this.noiseFloorEstimate + (1 - this.alpha) * frameEnergy;
    }

    // Soft spectral gain mask based on SNR
    const snr = frameEnergy / (this.noiseFloorEstimate + 1e-6);
    let gain = 1.0;
    if (snr < 1.5) {
      // Near noise floor: suppress heavily
      gain = Math.max(0.1, (snr - 1.0) / 0.5);
    } else if (snr < 3.0) {
      gain = 0.5 + 0.5 * ((snr - 1.5) / 1.5);
    }

    for (let i = 0; i < len; i++) {
      const val = Math.round(input[i] * gain);
      output[i] = val > 32767 ? 32767 : val < -32768 ? -32768 : val;
    }

    return output;
  }

  public async processBuffer(buffer: Buffer): Promise<Buffer> {
    const int16Count = Math.floor(buffer.length / 2);
    const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, int16Count);
    const enhanced = await this.process(int16);
    return Buffer.from(enhanced.buffer, enhanced.byteOffset, enhanced.byteLength);
  }

  public reset(): void {
    this.noiseFloorEstimate = 0.005;
  }

  public async dispose(): Promise<void> {}

  public getName(): string {
    return 'webrtc_apm_adapter';
  }
}

