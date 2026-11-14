/**
 * Namespace Normalizer for ApplianceCare AI
 * Strictly separates:
 * 1. Internal Diagnostic IDs: AC01 - AC16 (e.g., AC_01, ac-01, AC 01)
 * 2. Displayed Appliance Error Codes: CH01 - CH97 (e.g., CH 05, CH zero five, C5)
 *
 * Guarantees:
 * - AC01 can NEVER be mistaken for CH01 or vice versa.
 * - Fuzzy matching is forbidden between the two namespaces.
 * - Ambiguous spoken or partial codes trigger an explicit user confirmation prompt.
 */

export interface ChNormalizationResult {
  code: string | null;
  isAmbiguous: boolean;
  confidence: number;
  candidateCodes: string[];
  rawInput: string;
  disambiguationPrompt?: string;
}

// Spoken word to digit map for voice recognition transcript handling
const SPOKEN_WORDS_TO_NUM: Record<string, string> = {
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
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  twenty: '20',
  twentyone: '21',
  twentytwo: '22',
  twentythree: '23',
  twentyfour: '24',
  twentysix: '26',
  twentyseven: '27',
  twentynine: '29',
  thirty: '30',
  thirtytwo: '32',
  thirtythree: '33',
  thirtyfive: '35',
  thirtyeight: '38',
  forty: '40',
  fortyone: '41',
  fortyfour: '44',
  fortyfive: '45',
  fortysix: '46',
  fiftythree: '53',
  sixty: '60',
  sixtyone: '61',
  sixtytwo: '62',
  sixtyfive: '65',
  sixtyseven: '67',
  ninetyseven: '97',
};

/**
 * Normalizes internal diagnostic issue IDs (AC01 - AC16)
 * Supports variations: AC01, AC_01, ac-01, ac 01, AC1
 * Returns canonical format 'AC01' - 'AC16', or null if not an AC issue ID.
 */
export function normalizeAcIssueId(input: string | undefined | null): string | null {
  if (!input) return null;
  const clean = input.trim().toUpperCase();

  // Explicit check: Never allow CH codes or other error codes to be treated as AC
  if (clean.startsWith('CH') || clean.startsWith('C') && /\d/.test(clean)) {
    return null;
  }

  // Regex strictly matching AC followed by optional separator and 1-2 digits
  const match = clean.match(/^AC[_\-\s]?(\d{1,2})$/i);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  if (isNaN(num) || num < 1 || num > 16) {
    return null;
  }

  return `AC${String(num).padStart(2, '0')}`;
}

/**
 * Normalizes displayed appliance error codes (CH01 - CH97)
 * Handles voice transcripts ("CH zero five", "c h 5", "CH 05")
 * Strictly flags ambiguous speech or partial matches.
 */
export function normalizeChErrorCode(raw: string | undefined | null): ChNormalizationResult {
  if (!raw) {
    return {
      code: null,
      isAmbiguous: false,
      confidence: 0,
      candidateCodes: [],
      rawInput: '',
    };
  }

  const rawInput = raw.trim();
  const lower = rawInput.toLowerCase();

  // STRICT RULE: If the input is explicitly an AC issue ID (e.g. AC01, AC_01), reject immediately!
  if (/^ac[_\-\s]?\d{1,2}$/i.test(rawInput)) {
    return {
      code: null,
      isAmbiguous: false,
      confidence: 0,
      candidateCodes: [],
      rawInput,
    };
  }

  // Check for ambiguous spoken mentions without digits (e.g. "ch code", "error ch", "ch something")
  if (/\b(ch|see aitch)\b/i.test(lower) && !/\d/.test(lower)) {
    // Check if spoken numbers are present in words
    const tokens = lower.split(/[^a-z0-9]+/);
    const spokenDigits = tokens
      .filter((t) => SPOKEN_WORDS_TO_NUM[t] !== undefined)
      .map((t) => SPOKEN_WORDS_TO_NUM[t]);

    if (spokenDigits.length === 0) {
      return {
        code: null,
        isAmbiguous: true,
        confidence: 0.3,
        candidateCodes: ['CH05', 'CH38', 'CH01', 'CH02', 'CH06', 'CH10', 'CH21'],
        rawInput,
        disambiguationPrompt:
          'You mentioned a "CH" error code, but the number was not clearly recognized. Could you please specify the exact code on your display (e.g., CH 05, CH 38, or CH 01)?',
      };
    }
  }

  // Pre-process spoken words into digits: e.g. "c-h-zero-one" -> "ch 01"
  let processed = lower.replace(/([a-z0-9])[-–—]+([a-z0-9])/gi, '$1 $2');
  // Replace phrases like "see aitch" or spaced "c h" with "ch"
  processed = processed.replace(/\bsee\s*aitch\b/gi, 'ch');
  processed = processed.replace(/\bc\s*h\b/gi, 'ch');

  // Handle multi-word spoken numbers: e.g. "zero five" -> "05", "three eight" -> "38"
  processed = processed.replace(/\bzero\s+([0-9]|one|two|three|four|five|six|seven|eight|nine)\b/g, (_m, p1) => {
    return `0${SPOKEN_WORDS_TO_NUM[p1] || p1}`;
  });

  for (const [word, val] of Object.entries(SPOKEN_WORDS_TO_NUM)) {
    const wordRegex = new RegExp(`\\b${word}\\b`, 'g');
    processed = processed.replace(wordRegex, val);
  }

  // Handle Correction Pattern: e.g. "didn't say CH 01. I said CH 10" or "not CH 01, it's CH 10"
  const correctionMatch = processed.match(/\b(?:didn'?t say|not|never said)\s+ch[_\-\s]?(\d{1,2})[\s\S]*?\b(?:said|actually|it'?s|meant|displaying)\s+ch[_\-\s]?(\d{1,2})\b/i);
  if (correctionMatch) {
    const correctedNum = parseInt(correctionMatch[2], 10);
    const canonical = `CH${String(correctedNum).padStart(2, '0')}`;
    return {
      code: canonical,
      isAmbiguous: false,
      confidence: 0.99,
      candidateCodes: [canonical],
      rawInput,
    };
  }

  // Match all CH occurrences to check for multi-code ambiguity
  const allMatches = Array.from(processed.matchAll(/\bch[_\-\s]?(\d{1,2})\b/gi));
  if (allMatches.length > 1) {
    const candidates = Array.from(new Set(allMatches.map((m) => `CH${String(parseInt(m[1], 10)).padStart(2, '0')}`)));
    if (candidates.length > 1) {
      return {
        code: null,
        isAmbiguous: true,
        confidence: 0.5,
        candidateCodes: candidates,
        rawInput,
        disambiguationPrompt: `Multiple error codes were detected (${candidates.join(', ')}). Which specific error code is shown on your AC display?`,
      };
    }
  }

  // 1. Single explicit match: "CH 05", "CH05", "CH-05", "CH_05"
  const explicitChMatch = processed.match(/\bch[_\-\s]?(\d{1,2})\b/i);
  if (explicitChMatch) {
    const num = parseInt(explicitChMatch[1], 10);
    const canonical = `CH${String(num).padStart(2, '0')}`;
    return {
      code: canonical,
      isAmbiguous: false,
      confidence: 0.99,
      candidateCodes: [canonical],
      rawInput,
    };
  }

  // 2. Short forms like "C 05" or "C5" where word "error", "code", or "display" is adjacent
  const cMatch = processed.match(/\b(?:error|code|display)?\s*c[_\-\s]?(\d{1,2})\b/i);
  if (cMatch && (processed.includes('error') || processed.includes('code') || processed.includes('display'))) {
    const num = parseInt(cMatch[1], 10);
    const canonical = `CH${String(num).padStart(2, '0')}`;
    return {
      code: canonical,
      isAmbiguous: false,
      confidence: 0.9,
      candidateCodes: [canonical],
      rawInput,
    };
  }

  return {
    code: null,
    isAmbiguous: false,
    confidence: 0,
    candidateCodes: [],
    rawInput,
  };
}
