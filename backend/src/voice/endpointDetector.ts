/**
 * ApplianceCare AI – Endpoint Detector & Energy-Based VAD
 *
 * Implements real-time Root Mean Square (RMS) energy calculation,
 * speech start detection, trailing silence endpointing, and turn completion triggers.
 */

export interface EndpointDetectorOptions {
  sampleRate?: number;          // Target: 16000
  frameDurationMs?: number;     // e.g. 100ms or 20ms
  silenceThresholdMs?: number;  // Default 650ms
  energyThreshold?: number;     // RMS threshold for speech (default 0.015)
  maxSpeechDurationMs?: number; // 15000ms safety cap
  onSpeechStarted?: () => void;
  onSpeechEnded?: (durationMs: number) => void;
}

export class EndpointDetector {
  private sampleRate: number;
  private silenceThresholdMs: number;
  private energyThreshold: number;
  private maxSpeechDurationMs: number;

  private isSpeaking = false;
  private speechStartTime = 0;
  private lastVoicedTime = 0;
  private consecutiveVoicedFrames = 0;
  private consecutiveSilentFrames = 0;

  private onSpeechStarted?: () => void;
  private onSpeechEnded?: (durationMs: number) => void;

  constructor(options: EndpointDetectorOptions = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.silenceThresholdMs = options.silenceThresholdMs || 650;
    this.energyThreshold = options.energyThreshold || 0.015;
    this.maxSpeechDurationMs = options.maxSpeechDurationMs || 15000;
    this.onSpeechStarted = options.onSpeechStarted;
    this.onSpeechEnded = options.onSpeechEnded;
  }

  /**
   * Calculates RMS energy of a 16-bit linear PCM buffer (-1.0 to 1.0)
   */
  public calculateRms(pcmBuffer: Buffer): number {
    const numSamples = Math.floor(pcmBuffer.length / 2);
    if (numSamples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < numSamples; i++) {
      const sample = pcmBuffer.readInt16LE(i * 2) / 32768.0;
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / numSamples);
  }

  /**
   * Evaluates an incoming audio frame against energy thresholds and silence windows
   */
  public processFrame(pcmBuffer: Buffer): {
    energy: number;
    isVoiced: boolean;
    speechStarted: boolean;
    speechEnded: boolean;
  } {
    const energy = this.calculateRms(pcmBuffer);
    const isVoiced = energy >= this.energyThreshold;
    const now = Date.now();

    let speechStarted = false;
    let speechEnded = false;

    if (isVoiced) {
      this.consecutiveVoicedFrames++;
      this.consecutiveSilentFrames = 0;
      this.lastVoicedTime = now;

      // Confirm speech start after 2 consecutive voiced frames to reject clicks/pops
      if (!this.isSpeaking && this.consecutiveVoicedFrames >= 2) {
        this.isSpeaking = true;
        this.speechStartTime = now;
        speechStarted = true;
        if (this.onSpeechStarted) {
          this.onSpeechStarted();
        }
      }
    } else {
      this.consecutiveVoicedFrames = 0;
      if (this.isSpeaking) {
        this.consecutiveSilentFrames++;
        const silenceDuration = now - this.lastVoicedTime;
        const totalDuration = now - this.speechStartTime;

        // Check if trailing silence exceeded threshold OR safety cap reached
        if (silenceDuration >= this.silenceThresholdMs || totalDuration >= this.maxSpeechDurationMs) {
          this.isSpeaking = false;
          speechEnded = true;
          const speechDuration = this.lastVoicedTime - this.speechStartTime;
          if (this.onSpeechEnded) {
            this.onSpeechEnded(Math.max(100, speechDuration));
          }
        }
      }
    }

    return {
      energy,
      isVoiced,
      speechStarted,
      speechEnded,
    };
  }

  public getSpeakingState(): boolean {
    return this.isSpeaking;
  }

  public reset(): void {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastVoicedTime = 0;
    this.consecutiveVoicedFrames = 0;
    this.consecutiveSilentFrames = 0;
  }
}

