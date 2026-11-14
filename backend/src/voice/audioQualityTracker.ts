/**
 * ApplianceCare AI – Decoupled Audio Quality & Noise Tracker
 *
 * Implements linear-power noise-floor tracking and decoupled quality telemetry:
 * - Separates acoustic SNR, VAD confidence, ASR confidence, and Entity confidence
 * - Dynamically estimates background noise floor using exponential moving average of linear power
 * - Classifies noise tiers ('unknown' | 'moderate' | 'high' | 'extreme') without assuming 30dB initial SNR
 */

export type NoiseTier = 'unknown' | 'moderate' | 'high' | 'extreme';

export interface AudioQuality {
  estimatedSnrDb: number | null;
  vadConfidence: number;
  asrConfidence: number | null;
  entityConfidence: number | null;
  noiseTier: NoiseTier;
}

export class AudioQualityTracker {
  // Linear power smoothing factor (tau ~ 2.0s)
  private readonly alpha = 0.96;
  
  // Dynamic noise floor in linear power (squared amplitude)
  private noiseFloorPower: number | null = null;
  private speechPeakPower: number | null = null;
  private samplesProcessed = 0;

  // Recent running metrics
  private lastVadConfidence = 0.5;
  private lastAsrConfidence: number | null = null;
  private lastEntityConfidence: number | null = null;

  constructor() {}

  /**
   * Ingests a frame of Int16 PCM samples and updates linear power estimates
   */
  public processFrame(samples: Int16Array, vadProbability: number): AudioQuality {
    const len = samples.length;
    if (len === 0) {
      return this.getQuality();
    }

    this.lastVadConfidence = vadProbability;
    this.samplesProcessed += len;

    // 1. Calculate linear power: sum(s^2) / len where s in [-1.0, 1.0]
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const s = samples[i] / 32768.0;
      sumSq += s * s;
    }
    const framePower = sumSq / len;

    // 2. Initialize floor on first frame
    if (this.noiseFloorPower === null) {
      this.noiseFloorPower = Math.max(1e-7, framePower);
    }

    // 3. Update noise floor during low-probability speech (< 0.35)
    if (vadProbability < 0.35) {
      // Slow adaptation upwards, faster adaptation downwards
      const factor = framePower < this.noiseFloorPower ? 0.85 : this.alpha;
      this.noiseFloorPower = factor * this.noiseFloorPower + (1 - factor) * framePower;
    } else if (vadProbability >= 0.5) {
      // Track speech peaks
      if (this.speechPeakPower === null) {
        this.speechPeakPower = framePower;
      } else {
        this.speechPeakPower = 0.9 * this.speechPeakPower + 0.1 * framePower;
      }
    }

    return this.getQuality();
  }

  /**
   * Updates ASR confidence from Gnani recognition result
   */
  public recordAsrConfidence(confidence: number | null): void {
    this.lastAsrConfidence = confidence;
  }

  /**
   * Updates entity extraction confidence from diagnosis parsing
   */
  public recordEntityConfidence(confidence: number | null): void {
    this.lastEntityConfidence = confidence;
  }

  /**
   * Computes the current decoupled AudioQuality structure
   */
  public getQuality(): AudioQuality {
    // If fewer than 16,000 samples (1s) have been processed, noise tier is unknown
    if (this.samplesProcessed < 16000 || this.noiseFloorPower === null) {
      return {
        estimatedSnrDb: null,
        vadConfidence: this.lastVadConfidence,
        asrConfidence: this.lastAsrConfidence,
        entityConfidence: this.lastEntityConfidence,
        noiseTier: 'unknown',
      };
    }

    // Estimate SNR in dB = 10 * log10(speechPeakPower / noiseFloorPower)
    let snrDb: number | null = null;
    if (this.speechPeakPower && this.noiseFloorPower > 1e-9) {
      const ratio = this.speechPeakPower / this.noiseFloorPower;
      snrDb = Math.round(10 * Math.log10(Math.max(1.0, ratio)) * 10) / 10;
    }

    // Classify noise tier strictly from acoustic noise floor power:
    // noiseFloorPower in linear terms:
    // -60 dB ~ 1e-6
    // -45 dB ~ 3.16e-5
    // -30 dB ~ 1e-3
    const noiseDb = 10 * Math.log10(Math.max(1e-9, this.noiseFloorPower));
    let noiseTier: NoiseTier = 'moderate';

    if (noiseDb > -32 || (snrDb !== null && snrDb < 6)) {
      noiseTier = 'extreme';
    } else if (noiseDb > -44 || (snrDb !== null && snrDb < 14)) {
      noiseTier = 'high';
    } else {
      noiseTier = 'moderate';
    }

    return {
      estimatedSnrDb: snrDb,
      vadConfidence: this.lastVadConfidence,
      asrConfidence: this.lastAsrConfidence,
      entityConfidence: this.lastEntityConfidence,
      noiseTier,
    };
  }

  public reset(): void {
    this.noiseFloorPower = null;
    this.speechPeakPower = null;
    this.samplesProcessed = 0;
    this.lastVadConfidence = 0.5;
    this.lastAsrConfidence = null;
    this.lastEntityConfidence = null;
  }
}

