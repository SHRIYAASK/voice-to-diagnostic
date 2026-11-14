/**
 * ApplianceCare AI – TTS Pronunciation Service
 *
 * Expands technical acronyms, appliance model identifiers, error codes,
 * currency, and abbreviations into natural, phonetically clean spoken language.
 */

import dictionaryData from '../data/ttsPronunciationDictionary.json';

export class TTSPronunciationService {
  private static dictionary = dictionaryData;

  /**
   * Applies phonetic and pronunciation expansions to text for TTS synthesis.
   */
  public static expandForSpeech(text: string, language: string = 'en'): string {
    if (!text) return '';

    let expanded = text;

    // 1. Currency expansions (e.g. ₹500 -> 500 rupees)
    expanded = expanded.replace(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/g, '$1 rupees');
    expanded = expanded.replace(/\bINR\s*(\d+(?:,\d+)*(?:\.\d+)?)/gi, '$1 rupees');

    // 2. Error code expansions (CH05 -> C H zero five, CH 05 -> C H zero five)
    const specialCodes = this.dictionary.errorCodeRules.specialCases as Record<string, string>;
    expanded = expanded.replace(/\bCH\s*0?([1-9][0-9]?)\b/gi, (_match, num) => {
      const codeKey = `CH${num.padStart(2, '0')}`.toUpperCase();
      if (specialCodes[codeKey]) {
        return specialCodes[codeKey];
      }
      return `C H ${num}`;
    });

    // 3. Technical terms (PCB, MCB, R32, etc.)
    const techTerms = this.dictionary.technicalTerms as Record<string, string>;
    for (const [term, spoken] of Object.entries(techTerms)) {
      const regex = new RegExp(`\\b${term}\\b`, 'g');
      expanded = expanded.replace(regex, spoken);
    }

    // 4. Model identifiers (UW-Q18WUZA -> your air conditioner)
    const models = this.dictionary.applianceModels as Record<string, string>;
    for (const [model, spoken] of Object.entries(models)) {
      const regex = new RegExp(`\\b${model}\\b`, 'gi');
      expanded = expanded.replace(regex, spoken);
    }

    // 5. Conversational abbreviations (e.g., approx., min.)
    const abbrs = this.dictionary.abbreviations as Record<string, string>;
    for (const [abbr, spoken] of Object.entries(abbrs)) {
      const escaped = abbr.replace('.', '\\.');
      const regex = new RegExp(`\\b${escaped}`, 'gi');
      expanded = expanded.replace(regex, spoken);
    }

    // 6. Language specific replacements if target is Hindi or Tamil
    const langKey = language.startsWith('ta') ? 'ta' : language.startsWith('hi') ? 'hi' : 'en';
    if (langKey !== 'en') {
      const langDict = (this.dictionary.multilingual as any)[langKey];
      if (langDict) {
        for (const [term, spoken] of Object.entries(langDict)) {
          const regex = new RegExp(`\\b${term}\\b`, 'gi');
          expanded = expanded.replace(regex, spoken as string);
        }
      }
    }

    // Clean multiple spaces
    return expanded.replace(/\s{2,}/g, ' ').trim();
  }
}

export const ttsPronunciationService = TTSPronunciationService;
