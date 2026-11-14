/**
 * ApplianceCare AI – Universal Multilingual & Code-Switching Language Resolver
 *
 * Supports ANY language spoken by the customer:
 * - Native Unicode script analysis (Tamil, Devanagari/Hindi/Marathi, Telugu, Kannada, Malayalam, Bengali, Gujarati, Gurmukhi/Punjabi)
 * - Romanized code-switching detection (Tanglish, Hinglish, Tenglish, Kanglish, etc.)
 * - STT provider hints and user preferences
 * - Dynamic persona and TTS locale mapping
 */

export type ResolvedLanguage = string;

export interface LanguageResolutionResult {
  primaryLanguage: ResolvedLanguage;
  codeSwitchType: 'pure' | 'tanglish' | 'hinglish' | 'indic_code_switched' | 'standard_indic_english' | 'global_language';
  confidence: number;
  detectedScript: 'tamil' | 'devanagari' | 'telugu' | 'kannada' | 'malayalam' | 'bengali' | 'gujarati' | 'gurmukhi' | 'latin' | 'mixed';
  recommendedResponsePersona: string;
}

export class LanguageResolver {
  // Common Tanglish markers (Tamil words in Latin script)
  private static readonly TANGLISH_MARKERS = [
    /\b(varala|varla|irukku|iruku|panniyachu|panniten|pannitom|thanni|shathama|kekuthu|illai|kooda|paathen|therila)\b/i,
    /\b(aaguthu|aagala|suthala|odala|vekkala|ottudhu|sottudhu|kottudhu)\b/i,
    /\b(eppadi|enna|en|yenna|inga|anga|romba|konjam|ippo|appo)\b/i,
  ];

  // Common Hinglish markers (Hindi words in Latin script)
  private static readonly HINGLISH_MARKERS = [
    /\b(nahi|raha|rahi|hai|hain|karo|hona|chalu|bhi|kya|kyun|kyu|kaise|hota|hoti)\b/i,
    /\b(kar\s*raha|nahi\s*chal|gir\s*raha|batao|dekh|dekha|bahut|thoda)\b/i,
    /\b(aawaz|awaaz|paani|pani|badbu|jalne|chhut|khol|band|karein)\b/i,
  ];

  // Common Telugu romanized markers
  private static readonly TELUGU_MARKERS = [
    /\b(ravatledu|ravadam\s*ledu|pani\s*cheyadam|cheyatledu|aagipoindi|kavali|cheppandi|bagoledu|chala|enti|ela)\b/i,
  ];

  // Common Kannada romanized markers
  private static readonly KANNADA_MARKERS = [
    /\b(aagthilla|bartha\s*illa|kelsa\s*madtilla|nillisi|hege|enu|beku|thumba|swalpa|gotheilla)\b/i,
  ];

  // Common Malayalam romanized markers
  private static readonly MALAYALAM_MARKERS = [
    /\b(varunnilla|pani\s*cheyyunnilla|prashnam|engane|entha|kooduthal|enthanu|kuravu)\b/i,
  ];

  /**
   * Resolves language from user transcript, STT provider hint, and selected preference
   */
  public resolve(
    transcript: string,
    providerLanguageHint?: string,
    userSelectedPreference?: string
  ): LanguageResolutionResult {
    const text = (transcript || '').trim();
    if (!text) {
      const fallback = this.normalizeLocale(userSelectedPreference || 'en-IN');
      const persona = this.extractPersona(fallback);
      return {
        primaryLanguage: fallback,
        codeSwitchType: 'pure',
        confidence: 0.9,
        detectedScript: 'latin',
        recommendedResponsePersona: persona,
      };
    }

    // 1. Script Detection across Indic Scripts
    if (/[\u0B80-\u0BFF]/.test(text)) {
      return {
        primaryLanguage: 'ta-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'tamil',
        recommendedResponsePersona: 'ta',
      };
    }

    if (/[\u0C00-\u0C7F]/.test(text)) {
      return {
        primaryLanguage: 'te-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'telugu',
        recommendedResponsePersona: 'te',
      };
    }

    if (/[\u0C80-\u0CFF]/.test(text)) {
      return {
        primaryLanguage: 'kn-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'kannada',
        recommendedResponsePersona: 'kn',
      };
    }

    if (/[\u0D00-\u0D7F]/.test(text)) {
      return {
        primaryLanguage: 'ml-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'malayalam',
        recommendedResponsePersona: 'ml',
      };
    }

    if (/[\u0980-\u09FF]/.test(text)) {
      return {
        primaryLanguage: 'bn-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'bengali',
        recommendedResponsePersona: 'bn',
      };
    }

    if (/[\u0A80-\u0AFF]/.test(text)) {
      return {
        primaryLanguage: 'gu-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'gujarati',
        recommendedResponsePersona: 'gu',
      };
    }

    if (/[\u0A00-\u0A7F]/.test(text)) {
      return {
        primaryLanguage: 'pa-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'gurmukhi',
        recommendedResponsePersona: 'pa',
      };
    }

    if (/[\u0900-\u097F]/.test(text)) {
      return {
        primaryLanguage: 'hi-IN',
        codeSwitchType: 'pure',
        confidence: 0.98,
        detectedScript: 'devanagari',
        recommendedResponsePersona: 'hi',
      };
    }

    // 2. Latin Script Code-Switching Detection (Telugu, Kannada, Malayalam, Tanglish, Hinglish)
    if (LanguageResolver.TELUGU_MARKERS.some((re) => re.test(text))) {
      return {
        primaryLanguage: 'te-IN',
        codeSwitchType: 'indic_code_switched',
        confidence: 0.90,
        detectedScript: 'latin',
        recommendedResponsePersona: 'te',
      };
    }

    if (LanguageResolver.KANNADA_MARKERS.some((re) => re.test(text))) {
      return {
        primaryLanguage: 'kn-IN',
        codeSwitchType: 'indic_code_switched',
        confidence: 0.90,
        detectedScript: 'latin',
        recommendedResponsePersona: 'kn',
      };
    }

    if (LanguageResolver.MALAYALAM_MARKERS.some((re) => re.test(text))) {
      return {
        primaryLanguage: 'ml-IN',
        codeSwitchType: 'indic_code_switched',
        confidence: 0.90,
        detectedScript: 'latin',
        recommendedResponsePersona: 'ml',
      };
    }

    if (LanguageResolver.TANGLISH_MARKERS.some((re) => re.test(text))) {
      return {
        primaryLanguage: 'ta-IN',
        codeSwitchType: 'tanglish',
        confidence: 0.92,
        detectedScript: 'latin',
        recommendedResponsePersona: 'ta',
      };
    }

    if (LanguageResolver.HINGLISH_MARKERS.some((re) => re.test(text))) {
      return {
        primaryLanguage: 'hi-IN',
        codeSwitchType: 'hinglish',
        confidence: 0.92,
        detectedScript: 'latin',
        recommendedResponsePersona: 'hi',
      };
    }

    // 3. Check Provider Hint
    if (providerLanguageHint) {
      const normHint = this.normalizeLocale(providerLanguageHint);
      if (normHint !== 'en-IN') {
        const persona = this.extractPersona(normHint);
        return {
          primaryLanguage: normHint,
          codeSwitchType: 'pure',
          confidence: 0.85,
          detectedScript: 'latin',
          recommendedResponsePersona: persona,
        };
      }
    }

    // 4. Default to User Selected Preference or Indian English
    const fallback = this.normalizeLocale(userSelectedPreference || 'en-IN');
    const persona = this.extractPersona(fallback);
    return {
      primaryLanguage: fallback,
      codeSwitchType: fallback === 'en-IN' ? 'standard_indic_english' : 'pure',
      confidence: 0.95,
      detectedScript: 'latin',
      recommendedResponsePersona: persona,
    };
  }

  public normalizeLocale(locale: string): ResolvedLanguage {
    const l = (locale || '').trim().toLowerCase();
    if (!l) return 'en-IN';
    if (l.startsWith('ta')) return 'ta-IN';
    if (l.startsWith('hi')) return 'hi-IN';
    if (l.startsWith('te')) return 'te-IN';
    if (l.startsWith('kn')) return 'kn-IN';
    if (l.startsWith('ml')) return 'ml-IN';
    if (l.startsWith('bn')) return 'bn-IN';
    if (l.startsWith('mr')) return 'mr-IN';
    if (l.startsWith('gu')) return 'gu-IN';
    if (l.startsWith('pa')) return 'pa-IN';
    if (l.startsWith('en')) return 'en-IN';
    if (l.includes('-')) return l;
    return `${l}-IN`;
  }

  private extractPersona(locale: string): string {
    const prefix = (locale || '').toLowerCase().split(/[-_]/)[0];
    return prefix || 'en';
  }
}

