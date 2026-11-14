/**
 * ApplianceCare AI – Three-Stage Error Code Extraction & Customer Confirmation
 *
 * Implements:
 * Stage 1: Candidate Extraction (Contiguous & Spoken variants without word-boundary failure)
 * Stage 2: Registry Validation (Checks verified LG database without silent numerical neighbor mutation)
 * Stage 3: Customer Read-Back & Confirmation (Distinguishes valid vs confirmed)
 */

import { errorCodeRegistry, ChRegistryEntry } from '../data/errorCodeRegistry';

export interface ErrorCodeExtractionResult {
  candidate: string | null;
  canonicalCode: string | null;
  registryValid: boolean;
  asrConfidence: number;
  customerConfirmed: boolean;
  needsConfirmation: boolean;
  confirmationPrompt?: string;
  entry?: ChRegistryEntry | null;
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  twenty: '20',
  twentyone: '21',
  twentysix: '26',
  thirtyeight: '38',
  sixtyseven: '67',
};

export class ErrorCodeExtractor {
  /**
   * Stage 1: Candidate Extraction
   * Extracts raw error code candidates handling contiguous ('CH05'), spaced ('CH 05'),
   * and spoken ('see age five', 'c h zero five', 'c etch 21') utterances.
   */
  public extractCandidate(text: string): string | null {
    if (!text || typeof text !== 'string') return null;

    // 1. Contiguous pattern: CH01, CH05, ch10, CH21 (handles letters immediately followed by digits)
    const contiguousMatch = text.match(/(?:^|[^\w])(?:CH|ch)([0-9]{1,2})\b/i);
    if (contiguousMatch) {
      const num = parseInt(contiguousMatch[1], 10);
      return `CH${num < 10 ? '0' + num : num}`;
    }

    // 2. Spaced with digits: "C H 05", "CH 5", "c-h-10"
    const spacedDigitsMatch = text.match(/\b(?:c\s*h|see\s*(?:h|age)|sea\s*(?:h|age)|c\s*etch)\s*([0-9]{1,2})\b/i);
    if (spacedDigitsMatch) {
      const num = parseInt(spacedDigitsMatch[1], 10);
      return `CH${num < 10 ? '0' + num : num}`;
    }

    // 3. Spoken number words: "see age zero five", "c h five", "ch twenty one"
    const spokenWordsMatch = text.match(
      /\b(?:c\s*h|see\s*(?:h|age)|sea\s*(?:h|age)|c\s*etch)\s*(zero\s*)?([a-zA-Z\s]+)\b/i
    );
    if (spokenWordsMatch) {
      const words = spokenWordsMatch[2].toLowerCase().replace(/\s+/g, '');
      if (NUMBER_WORDS[words]) {
        const num = parseInt(NUMBER_WORDS[words], 10);
        return `CH${num < 10 ? '0' + num : num}`;
      }
    }

    return null;
  }

  /**
   * Stage 2 & Stage 3: Validates candidate against registry and determines
   * if read-back confirmation is required.
   */
  public evaluate(
    text: string,
    asrConfidence: number = 0.9,
    isExplicitlyConfirmed: boolean = false
  ): ErrorCodeExtractionResult {
    const candidate = this.extractCandidate(text);
    if (!candidate) {
      return {
        candidate: null,
        canonicalCode: null,
        registryValid: false,
        asrConfidence,
        customerConfirmed: false,
        needsConfirmation: false,
      };
    }

    // Stage 2: Registry Validation
    const entry = errorCodeRegistry.getEntry(candidate);
    const registryValid = Boolean(entry && entry.lookup_record_available);

    // Stage 3: Confirmation Decision
    // Never silently mutate CH05 to CH06!
    // If not verified or if ASR confidence is below 0.85 or safety level is High/Critical, request confirmation
    const isHighConsequence = entry?.safety_level === 'High' || entry?.safety_level === 'Critical';
    const needsConfirmation = !isExplicitlyConfirmed && (asrConfidence < 0.85 || isHighConsequence || !registryValid);

    let confirmationPrompt: string | undefined;
    if (needsConfirmation) {
      if (registryValid) {
        confirmationPrompt = `You mentioned error code **${candidate}** (${entry?.display || candidate}). Could you confirm if this exact code appears on your AC indoor display?`;
      } else {
        confirmationPrompt = `I heard error code **${candidate}**, but it is not listed in the verified LG Dual Inverter database. Could you double-check the letters and numbers showing on your display?`;
      }
    }

    return {
      candidate,
      canonicalCode: candidate,
      registryValid,
      asrConfidence,
      customerConfirmed: isExplicitlyConfirmed,
      needsConfirmation,
      confirmationPrompt,
      entry,
    };
  }
}

export const errorCodeExtractor = new ErrorCodeExtractor();

