/**
 * Symptom Extractor — ApplianceCare AI
 *
 * Extracts structured descriptions of what the customer observes:
 * - Primary symptom (not cooling, water dripping, strange noise, etc.)
 * - Secondary symptoms (outdoor fan off, remote unresponsive, etc.)
 * - Affected area / component
 * - Duration
 * - Customer observations
 *
 * CRITICAL RULE:
 * Do NOT diagnose the cause!
 * E.g., customer says: "My AC is running continuously but not cooling."
 * - Primary symptom: "not cooling"
 * - Observations: ["running continuously", "warm air blowing"]
 * - Fault: Must NOT say "compressor failure" or "gas leak" — that is the diagnostic engine's job.
 */

import symptomRegistryData from '../data/symptomRegistry.json';

export interface ExtractedSymptoms {
  primary?: string;
  secondary?: string[];
  affectedArea?: string;
  duration?: string;
  observations: string[];
  extractionConfidence: number;
}

interface SymptomRule {
  id: string;
  canonicalName: string;
  pattern: RegExp;
  defaultArea?: string;
}

const SYMPTOM_RULES: SymptomRule[] = (symptomRegistryData.symptoms || []).map(
  (s: { id: string; canonicalName: string; pattern: string; defaultArea?: string }) => ({
    id: s.id,
    canonicalName: s.canonicalName,
    pattern: new RegExp(s.pattern, 'i'),
    defaultArea: s.defaultArea,
  })
);

export function extractSymptoms(text: string): ExtractedSymptoms {
  const result: ExtractedSymptoms = {
    observations: [],
    extractionConfidence: 0,
  };

  if (!text || !text.trim()) {
    return result;
  }

  const raw = text.trim();
  const matchedSymptoms: Array<{ name: string; area?: string }> = [];

  for (const rule of SYMPTOM_RULES) {
    if (rule.pattern.test(raw)) {
      matchedSymptoms.push({
        name: rule.canonicalName,
        area: rule.defaultArea,
      });
      result.observations.push(rule.canonicalName);
    }
  }

  if (matchedSymptoms.length > 0) {
    result.primary = matchedSymptoms[0].name;
    result.affectedArea = matchedSymptoms[0].area;
    result.extractionConfidence = 0.9;

    if (matchedSymptoms.length > 1) {
      result.secondary = matchedSymptoms.slice(1).map((s) => s.name);
    }
  } else {
    // If no specific dictionary rule matched, see if user stated an observation
    result.observations.push(raw);
    result.extractionConfidence = 0.3;
  }

  return result;
}

export const symptomExtractor = {
  extract: extractSymptoms,
};
