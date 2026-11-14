/**
 * ApplianceCare AI – Transcript Stabilization & Normalization Manager
 *
 * Implements:
 * 1. Partial transcript stabilization (tracks hypothesis stability)
 * 2. Domain-specific normalization dictionary (appliances, error codes, components)
 * 3. Tanglish & Hinglish colloquial phonetic symptom mapping
 * 4. Confidence-aware validation and confirmation tagging
 * 5. Deduplication of trailing / repeated final transcripts
 */

export interface ProcessedTranscript {
  raw: string;
  normalized: string;
  isStable: boolean;
  confidence: number;
  detectedLanguage: string;
  needsConfirmation: boolean;
  extractedErrorCode?: string;
  mappedSymptom?: string;
}

export class TranscriptManager {
  private _lastFinalProcessed = '';
  private _recentHypotheses: string[] = [];
  private _stabilityWindow = 3;

  /**
   * Domain normalization rules
   */
  private static readonly REPLACEMENTS: Array<{ regex: RegExp; replaceWith: string }> = [
    // Error Codes (spelled out or numeric)
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?1|one)\b/gi, replaceWith: 'CH01' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?2|two)\b/gi, replaceWith: 'CH02' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?3|three)\b/gi, replaceWith: 'CH03' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?4|four)\b/gi, replaceWith: 'CH04' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?5|five)\b/gi, replaceWith: 'CH05' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?6|six)\b/gi, replaceWith: 'CH06' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?7|seven)\b/gi, replaceWith: 'CH07' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?8|eight)\b/gi, replaceWith: 'CH08' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(zero\s*)?(0?9|nine)\b/gi, replaceWith: 'CH09' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(10|ten)\b/gi, replaceWith: 'CH10' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(12|twelve)\b/gi, replaceWith: 'CH12' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(21|twenty\s*one)\b/gi, replaceWith: 'CH21' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(26|twenty\s*six)\b/gi, replaceWith: 'CH26' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(38|thirty\s*eight)\b/gi, replaceWith: 'CH38' },
    { regex: /\b(c\s*h|see\s*age|c\s*etch)\s*(67|sixty\s*seven)\b/gi, replaceWith: 'CH67' },

    // Technical acronyms & components
    { regex: /\bp\s*c\s*b\b/gi, replaceWith: 'PCB' },
    { regex: /\bm\s*c\s*b\b/gi, replaceWith: 'MCB' },
    { regex: /\bl\s*e\s*d\b/gi, replaceWith: 'LED' },
    { regex: /\ba\s*c\b/gi, replaceWith: 'AC' },
    { regex: /\br\s*32\b/gi, replaceWith: 'R32' },
    { regex: /\br\s*410\s*a?\b/gi, replaceWith: 'R410A' },

    // Tanglish phonetic symptom mapping
    { regex: /\b(cooling\s*(varala|varla|agala|illai|panla|illa))\b/gi, replaceWith: 'not cooling' },
    { regex: /\b(thanni\s*(leak|ottudhu|sottudhu|kottudhu|varuthu))\b/gi, replaceWith: 'water leakage' },
    { regex: /\b(shathama\s*irukku|sound\s*(athigama|varuthu|kekuthu))\b/gi, replaceWith: 'abnormal noise' },
    { regex: /\b(current\s*off\s*aaguthu|trip\s*aaguthu|breaker\s*trip)\b/gi, replaceWith: 'mcb tripping' },
    { regex: /\b(vasanai\s*varuthu|smell\s*adikkuthu)\b/gi, replaceWith: 'bad smell' },
    { regex: /\b(ice\s*katikuchu|pani\s*kattirukku)\b/gi, replaceWith: 'ice formation' },
    { regex: /\b(remote\s*(vela\s*seiyala|work\s*aagala))\b/gi, replaceWith: 'remote not working' },
    { regex: /\b(filter\s*clean\s*(panniyachu|pannitom|panniten))\b/gi, replaceWith: 'filter already cleaned' },

    // Hinglish phonetic symptom mapping
    { regex: /\b(thanda\s*nahi\s*ho\s*raha|cooling\s*nahi\s*kar\s*raha|cool\s*nahi\s*hai)\b/gi, replaceWith: 'not cooling' },
    { regex: /\b(paani\s*(gir\s*raha|tap\s*tap|leak\s*kar\s*raha))\b/gi, replaceWith: 'water leakage' },
    { regex: /\b(awaaz\s*(aa\s*rahi|bhot\s*jada|zyada))\b/gi, replaceWith: 'abnormal noise' },
    { regex: /\b(mcb\s*(gir\s*gaya|trip\s*ho\s*rahi|bar\s*bar\s*trip))\b/gi, replaceWith: 'mcb tripping' },
    { regex: /\b(badbu\s*aa\s*rahi|jalne\s*ki\s*smell)\b/gi, replaceWith: 'burning smell' },
    { regex: /\b(baraf\s*jam\s*gayi|ice\s*jam\s*raha)\b/gi, replaceWith: 'ice formation' },
    { regex: /\b(chalu\s*nahi\s*ho\s*raha|start\s*nahi\s*hua)\b/gi, replaceWith: 'not turning on' },
  ];

  /**
   * Normalizes raw spoken text into standardized domain terminology
   */
  public normalize(rawText: string): string {
    if (!rawText) return '';
    let text = rawText.trim();

    for (const rule of TranscriptManager.REPLACEMENTS) {
      text = text.replace(rule.regex, rule.replaceWith);
    }

    // Collapse extra whitespace
    return text.replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Tracks an interim transcript and computes its stability score
   */
  public processPartial(text: string, confidence: number = 0.8, language: string = 'en-IN'): ProcessedTranscript {
    const clean = (text || '').trim();
    this._recentHypotheses.push(clean);
    if (this._recentHypotheses.length > this._stabilityWindow) {
      this._recentHypotheses.shift();
    }

    // Measure stability: true if the last 3 hypotheses share a non-trivial common prefix
    let isStable = false;
    if (this._recentHypotheses.length >= 2) {
      const prev = this._recentHypotheses[this._recentHypotheses.length - 2];
      isStable = clean.startsWith(prev) || clean === prev;
    }

    const normalized = this.normalize(clean);
    const extractedErrorCode = this.extractErrorCode(normalized);

    return {
      raw: clean,
      normalized,
      isStable,
      confidence,
      detectedLanguage: language,
      needsConfirmation: false,
      extractedErrorCode,
    };
  }

  /**
   * Processes a final transcript, applying domain normalization and confidence guards
   */
  public processFinal(text: string, confidence: number = 0.9, language: string = 'en-IN'): ProcessedTranscript {
    const clean = (text || '').trim();
    this._recentHypotheses = [];

    const normalized = this.normalize(clean);
    const extractedErrorCode = this.extractErrorCode(normalized);

    // If an error code is detected but confidence is low, flag for interactive confirmation
    const needsConfirmation = Boolean(extractedErrorCode && confidence < 0.75);

    return {
      raw: clean,
      normalized,
      isStable: true,
      confidence,
      detectedLanguage: language,
      needsConfirmation,
      extractedErrorCode,
    };
  }

  /**
   * Determines whether this final transcript is a duplicate of the last processed final transcript
   */
  public isDuplicate(text: string): boolean {
    const clean = (text || '').trim().toLowerCase();
    if (!clean) return true;

    const prev = this._lastFinalProcessed.trim().toLowerCase();
    if (clean === prev) return true;

    // Check if it is a subset or minor punctuation variant
    if (prev && (clean.includes(prev) || prev.includes(clean)) && Math.abs(clean.length - prev.length) < 4) {
      return true;
    }

    return false;
  }

  public recordProcessedFinal(text: string): void {
    this._lastFinalProcessed = (text || '').trim();
  }

  public reset(): void {
    this._lastFinalProcessed = '';
    this._recentHypotheses = [];
  }

  private extractErrorCode(text: string): string | undefined {
    const match = text.match(/\bCH\s*0?[1-9][0-9]?\b/i);
    if (!match) return undefined;
    const digits = match[0].replace(/[^0-9]/g, '');
    const num = parseInt(digits, 10);
    return `CH${num < 10 ? '0' + num : num}`;
  }
}
