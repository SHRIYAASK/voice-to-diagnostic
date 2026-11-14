/**
 * ApplianceCare AI – Domain & Transcript Normalizer Service
 *
 * Provides domain-specific audio and text normalization for:
 * 1. Display error codes (e.g. "c h zero five" -> "CH05")
 * 2. Technical acronyms (PCB, MCB, LED, AC, R32, R410A)
 * 3. Tanglish colloquial symptom expressions
 * 4. Hinglish colloquial symptom expressions
 */

export interface NormalizationRule {
  regex: RegExp;
  replaceWith: string;
}

export const DOMAIN_REPLACEMENTS: NormalizationRule[] = [
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

  // Audibility checks & transliterated Tamil phonetics
  { regex: /\b(naa\s*paisa\s*cake\s*tha|naan\s*pesa\s*ke[a-z]*|pesa\s*ke[a-z]*|pesurathu\s*ke[a-z]*)\b/gi, replaceWith: 'can you hear me' },

  // Tanglish phonetic symptom mapping
  { regex: /\b(koole|kool|cool)\s*(aa\s*gaya|aagala|agala|varala|varla)\b/gi, replaceWith: 'not cooling' },
  { regex: /\bwarm\s*air\s*(tarah|ki\s*tarah|pol|mari|varuthu)\b/gi, replaceWith: 'warm air' },
  { regex: /\b(cool\s*ah\s*varala|cool\s*varala|cooling\s*aagala)\b/gi, replaceWith: 'not cooling' },
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

export const transcriptNormalizer = {
  /**
   * Normalizes raw spoken or typed text into standardized domain terminology
   */
  normalize(rawText: string): string {
    if (!rawText) return '';
    let text = rawText.trim();

    for (const rule of DOMAIN_REPLACEMENTS) {
      text = text.replace(rule.regex, rule.replaceWith);
    }

    return text.replace(/\s{2,}/g, ' ').trim();
  },
};

