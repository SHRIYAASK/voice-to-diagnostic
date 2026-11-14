/**
 * ApplianceCare AI – Audio Observability Monitor & Customer Guidance
 *
 * Implements:
 * 1. Turn-by-turn structured quality telemetry logging
 * 2. Safe conversational recovery guidance prompts
 */

import { NoiseTier } from './audioQualityTracker';

export interface TurnObservabilityLog {
  turnId: number;
  language: string;
  noise_tier: NoiseTier;
  enhancement: string;
  estimated_snr_db: number | null;
  asr_confidence: number | null;
  entities: {
    brand?: string | null;
    error_code?: string | null;
    model_number?: string | null;
  };
  entity_confirmed: {
    error_code: boolean;
    model_number: boolean;
  };
  diagnostic_route?: string | null;
  barge_in: {
    triggered: boolean;
    stop_latency_ms?: number;
  };
}

export class AudioObservabilityMonitor {
  private logs: TurnObservabilityLog[] = [];

  /**
   * Logs a turn's telemetry to structured audit stream
   */
  public logTurn(entry: TurnObservabilityLog): void {
    this.logs.push(entry);
    console.log(`[AudioObservability] Turn ${entry.turnId} Log:`, JSON.stringify(entry));
  }

  public getRecentLogs(): TurnObservabilityLog[] {
    return this.logs.slice(-20);
  }

  /**
   * Safe conversational recovery prompts
   */
  public getGuidancePrompt(situation: 'high_noise' | 'unclear_error_code' | 'unclear_model' | 'multiple_speakers'): string {
    switch (situation) {
      case 'high_noise':
        return 'Could you move a little away from the outdoor unit or background noise so I can hear you clearly?';
      case 'unclear_error_code':
        return 'Could you read the letters and numbers showing on your AC display?';
      case 'unclear_model':
        return 'Could you check the model number on the indoor unit barcode label?';
      case 'multiple_speakers':
        return 'Could one person tell me the appliance details so I don\'t miss anything?';
      default:
        return 'Could you please repeat that?';
    }
  }
}

export const audioObservability = new AudioObservabilityMonitor();

