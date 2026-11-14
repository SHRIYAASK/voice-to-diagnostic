/**
 * Entity Extractor — ApplianceCare AI
 *
 * Extracts structured appliance and customer-request information:
 * - Appliance type (air conditioner, refrigerator, washing machine, etc.)
 * - Brand (LG, Daikin, Samsung, etc.)
 * - Model number (UW-Q18WUZA, GL-N292RDSY, etc.)
 * - Appliance subtype (split, window, inverter, top load, etc.)
 * - Error codes (CH05, CH21, E1, etc.)
 * - Component / Location (indoor, outdoor, remote, display, compressor, etc.)
 * - Duration (since morning, 2 days, etc.)
 * - Previous repair indicators
 *
 * Requirements:
 * - Never invent missing information (returns undefined if absent).
 * - Preserves original input.
 * - Normalizes known aliases and spelling variations.
 */

import { normalizeChErrorCode } from './namespaceNormalizer';
import applianceRegistryData from '../data/applianceRegistry.json';

export interface ExtractedEntities {
  applianceType?: string;
  brand?: string;
  model?: string;
  subtype?: string;
  errorCodes: string[];
  location?: string;
  duration?: string;
  previousRepair?: boolean;
}

// ── Compiled registries from data/applianceRegistry.json ─────────────────────
const APPLIANCE_TYPE_PATTERNS: Array<{ type: string; pattern: RegExp }> =
  (applianceRegistryData.appliances || []).map((a: { type: string; patterns: string[] }) => ({
    type: a.type,
    pattern: new RegExp(a.patterns.join('|'), 'i'),
  }));

const BRAND_PATTERNS: Array<{ brand: string; pattern: RegExp }> =
  (applianceRegistryData.brands || []).map((b: { brand: string; patterns: string[] }) => ({
    brand: b.brand,
    pattern: new RegExp(b.patterns.join('|'), 'i'),
  }));

const SUBTYPE_PATTERNS: Array<{ subtype: string; pattern: RegExp }> =
  (applianceRegistryData.subtypes || []).map((s: { subtype: string; patterns: string[] }) => ({
    subtype: s.subtype,
    pattern: new RegExp(s.patterns.join('|'), 'i'),
  }));

const LOCATION_PATTERNS: Array<{ location: string; pattern: RegExp }> =
  (applianceRegistryData.locations || []).map((l: { location: string; patterns: string[] }) => ({
    location: l.location,
    pattern: new RegExp(l.patterns.join('|'), 'i'),
  }));

const DURATION_PATTERNS = [
  /\b((for|since|past|last)\s+(\d+|two|three|four|five|several|few)\s+(hours?|days?|weeks?|months?))\b/i,
  /\b(since\s+(yesterday|morning|last\s*night|today|this\s*morning))\b/i,
  /\b(from\s+(\d+|two|three)\s+days?\s+ago)\b/i,
  /\b(all\s+day|recently|just\s+now|suddenly)\b/i,
  /\b(\d+\s+din\s+se|\d+\s+ghante\s+se|subah\s+se|kal\s+se)\b/i, // Hindi
];

const PREVIOUS_REPAIR_PATTERNS = [
  /\b(already\s+repaired|repaired\s+(before|earlier|once|twice)|technician\s+came\s+(already|before|earlier|yesterday)|service\s+done\s+recently|already\s+serviced|gas\s+(refilled|charged)\s+recently)\b/i,
  /\b(pehle\s+bhi\s+theek\s+karwaya|repair\s+hua\s+tha|technician\s+aaya\s+tha)\b/i, // Hindi
];

// Specific known models pattern
const MODEL_NUMBER_PATTERN = /\b([A-Z]{1,4}[-_\s]?[A-Z0-9]{4,10}[A-Z0-9]?)\b/i;
// Common false positives for model pattern
const NON_MODELS = new Set(['TECH', 'ERROR', 'WIFI', 'DRAIN', 'WATER', 'POWER', 'SMART', 'INDOOR', 'OUTDOOR', 'FILTER', 'REMOTE', 'COOL']);

/**
 * Extracts entities from raw or normalized utterance.
 */
export function extractEntities(
  text: string,
  sessionContext?: {
    appliance?: string;
    model?: string;
  }
): ExtractedEntities {
  const result: ExtractedEntities = {
    errorCodes: [],
  };

  if (!text || !text.trim()) {
    if (sessionContext?.appliance) result.applianceType = sessionContext.appliance;
    if (sessionContext?.model) result.model = sessionContext.model;
    return result;
  }

  const raw = text.trim();

  // 1. Error codes (using namespace normalizer)
  const explicitCh = normalizeChErrorCode(raw);
  if (explicitCh && explicitCh.code) {
    result.errorCodes.push(explicitCh.code);
  }

  // 2. Appliance Type
  for (const item of APPLIANCE_TYPE_PATTERNS) {
    if (item.pattern.test(raw)) {
      result.applianceType = item.type;
      break;
    }
  }
  if (!result.applianceType && sessionContext?.appliance) {
    result.applianceType = sessionContext.appliance;
  }

  // 3. Brand
  for (const item of BRAND_PATTERNS) {
    if (item.pattern.test(raw)) {
      result.brand = item.brand;
      break;
    }
  }

  // 4. Subtype
  for (const item of SUBTYPE_PATTERNS) {
    if (item.pattern.test(raw)) {
      result.subtype = item.subtype;
      break;
    }
  }

  // 5. Location / Component
  for (const item of LOCATION_PATTERNS) {
    if (item.pattern.test(raw)) {
      result.location = item.location;
      break;
    }
  }

  // 6. Duration
  for (const p of DURATION_PATTERNS) {
    const match = raw.match(p);
    if (match) {
      result.duration = match[0].trim();
      break;
    }
  }

  // 7. Previous Repair
  for (const p of PREVIOUS_REPAIR_PATTERNS) {
    if (p.test(raw)) {
      result.previousRepair = true;
      break;
    }
  }

  // 8. Model Number
  const modelMatch = raw.match(MODEL_NUMBER_PATTERN);
  if (modelMatch && modelMatch[1]) {
    const candidate = modelMatch[1].toUpperCase().replace(/\s+/, '-');
    if (!NON_MODELS.has(candidate) && candidate.length >= 6 && /\d/.test(candidate)) {
      result.model = candidate;
    }
  }
  if (!result.model && sessionContext?.model) {
    result.model = sessionContext.model;
  }

  return result;
}

export const entityExtractor = {
  extract: extractEntities,
};
