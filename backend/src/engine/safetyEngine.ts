/**
 * Safety Engine — ApplianceCare AI
 *
 * Consolidates all safety hazard detection into a single authoritative module.
 * Wraps the existing safety logic from deterministicRouter.ts (lines 88-148)
 * and chatService.ts detectSafetyHazard() into one independent system.
 *
 * Rules:
 * - Safety detection is 100% deterministic — NEVER depends on LLM confidence.
 * - Safety overrides all other routing before anything else runs.
 * - Multilingual hazard detection (EN/HI/TA).
 * - Negation-aware: "no smoke" is NOT flagged.
 * - Customer-safe: never instructs touching electrical components or handling refrigerant.
 */

export type SafetyLevel = 'CRITICAL' | 'WARNING' | 'INFO';

export interface SafetyCheckResult {
  detected: boolean;
  level: SafetyLevel | null;
  hazardType?: string;
  responseText?: string;
  shouldOverrideRouting: boolean;
  /** Original pattern that matched (for telemetry) */
  matchedPattern?: string;
}

// ── Negation guard ─────────────────────────────────────────────────────────────
// If any of these appear within 4 words before the hazard keyword, skip the flag.
const NEGATION_PREFIXES = /\b(no|not|never|without|didn't|don't|doesn't|isn't|aren't|wasn't|weren't|none|absence of|didn't see|no sign of|didn't use|don't use|not using|avoid|never use)\b[\s\w]{0,30}$/i;

function isNegated(text: string, matchStart: number): boolean {
  const prefix = text.slice(Math.max(0, matchStart - 60), matchStart);
  return NEGATION_PREFIXES.test(prefix);
}

// ── Hazard pattern definitions ─────────────────────────────────────────────────

interface HazardPattern {
  id: string;
  level: SafetyLevel;
  pattern: RegExp;
  responseKey: keyof typeof SAFETY_RESPONSES;
  negationSensitive: boolean;
}

const HAZARD_PATTERNS: HazardPattern[] = [
  // SP01/SP02: Fire, smoke, sparks, burning (CRITICAL)
  {
    id: 'SP01_FIRE_EMERGENCY',
    level: 'CRITICAL',
    pattern: /\b(smoke|spark|sparks|sparking|fire|flame|flames|blast|explosion|electric shock|electrocuted|shock from|current shock)\b/i,
    responseKey: 'FIRE_EMERGENCY',
    negationSensitive: true,
  },
  // Multilingual fire/smoke (Hindi)
  {
    id: 'SP01_FIRE_HI',
    level: 'CRITICAL',
    pattern: /\b(aag|dhuan|dhua|bijli ka jhatka|current laga|shock laga|bijli se shock|chingari)\b/i,
    responseKey: 'FIRE_EMERGENCY',
    negationSensitive: true,
  },
  // Multilingual fire/smoke (Tamil)
  {
    id: 'SP01_FIRE_TA',
    level: 'CRITICAL',
    pattern: /\b(thee|pukai|minnaladi|shock adikuthu|current adikuthu|porikki|vedipu)\b/i,
    responseKey: 'FIRE_EMERGENCY',
    negationSensitive: true,
  },
  // SP04: Water near electrical socket
  {
    id: 'SP04_WATER_ELECTRICAL',
    level: 'CRITICAL',
    pattern: /\bwater\b[\s\S]{0,40}\b(socket|plug|outlet|switch|breaker|electrical|mains|wiring)\b|\b(socket|plug|outlet|switch|breaker|electrical|mains)\b[\s\S]{0,40}\bwater\b/i,
    responseKey: 'WATER_NEAR_ELECTRICAL',
    negationSensitive: false,
  },
  // SP07: Damaged or exposed wiring
  {
    id: 'SP07_DAMAGED_WIRES',
    level: 'CRITICAL',
    pattern: /\b(damaged|exposed|bare|chewed|cut|frayed|broken)\s+wires?\b|\bwires?\s+(damaged|exposed|bare|hanging out|cut)\b/i,
    responseKey: 'DAMAGED_WIRES',
    negationSensitive: false,
  },
  // SP10/BP12: Live electrical panel disassembly
  {
    id: 'SP10_LIVE_DISASSEMBLY',
    level: 'CRITICAL',
    pattern: /\b(open|opened|touch|touching|see inside|remove|ignore.*safety)\b[\s\S]{0,30}\b(live|panel|circuit board|pcb|capacitors?|capacitor)\b|\bhow\s+to\s+open\s+the\s+(live\s+)?electrical\s+panel\b/i,
    responseKey: 'LIVE_DISASSEMBLY',
    negationSensitive: false,
  },
  // SP08: DIY refrigerant refilling
  {
    id: 'SP08_DIY_REFRIGERANT',
    level: 'WARNING',
    pattern: /\b(how\s+to\s+)?(refill|charge|top\s*up|fill|add)\b[\s\S]{0,20}\b(gas|refrigerant|freon|r32|r410a?)\b/i,
    responseKey: 'DIY_REFRIGERANT',
    negationSensitive: false,
  },
  // General burning smell (WARNING — not emergency-level unless combined with fire)
  {
    id: 'BURNING_SMELL',
    level: 'WARNING',
    pattern: /\b(burning\s+smell|something\s+is?\s+burning|plastic\s+burning|rubber\s+burning|jalne\s+ki\s+smell|jal\s+raha|badbu\s+aa\s+rahi)\b/i,
    responseKey: 'BURNING_SMELL',
    negationSensitive: true,
  },
];

// ── Safety response text ───────────────────────────────────────────────────────

const SAFETY_RESPONSES = {
  FIRE_EMERGENCY: `🚨 **CRITICAL SAFETY EMERGENCY: IMMEDIATE ACTION REQUIRED**

If you can safely reach the electrical breaker without getting close to the AC unit:
1. Turn OFF the dedicated MCB electrical breaker supplying power to your air conditioner.
2. **Do NOT** touch the indoor or outdoor unit.
3. **Do NOT** attempt DIY repair.
4. Move to a safe distance from the unit.

An authorized technician must inspect electrical wiring and compressor components before power is restored. If you smell smoke or see flames, please contact emergency services.`,

  WATER_NEAR_ELECTRICAL: `🚨 **CRITICAL ELECTRICAL HAZARD: WATER NEAR ELECTRICAL SOCKET**

1. **DO NOT touch** the wet wall, socket, plug, or air conditioner switch.
2. If you can safely reach the main electrical board without touching wet surfaces, isolate power at the **main house MCB (distribution board)**.
3. Keep all people away from the area.
4. Contact a certified electrician and LG technician before restoring power.`,

  DAMAGED_WIRES: `🚨 **SAFETY WARNING: DAMAGED ELECTRICAL WIRING DETECTED**

1. Turn OFF power at the MCB breaker if you can do so safely.
2. **DO NOT touch or inspect** the damaged outdoor wiring.
3. Keep children and pets away from the area.
4. Professional servicing is required to replace the wiring harness with OEM parts.`,

  LIVE_DISASSEMBLY: `⚠️ **SAFETY POLICY REFUSAL: LETHAL VOLTAGE HAZARD**

Disassembling the outer cabinet or touching internal circuit boards exposes lethal 230V mains and high-voltage DC bus charges.

Manufacturer safety policy strictly forbids customer opening of live electrical compartments. Please schedule an authorized LG technician — this requires specialist tools and certification.`,

  DIY_REFRIGERANT: `⚠️ **SAFETY & REGULATORY NOTICE: REFRIGERANT HANDLING**

Ice formation on copper pipes can be caused by air filter clogs, blower motor malfunction, or refrigerant leakage.

Refilling R32 / R410A refrigerant requires specialized pressure gauges, vacuum pumps, and certified handling under safety regulations. DIY gas refilling is prohibited by law and is dangerous. Please schedule professional servicing.`,

  BURNING_SMELL: `⚠️ **SAFETY ALERT: BURNING SMELL DETECTED**

A burning smell from an AC unit can indicate electrical overheating or component failure.

1. Turn the AC off immediately using the remote or unit button.
2. Turn OFF the MCB breaker for the AC circuit.
3. Do NOT turn it back on until a technician inspects the unit.

Please book a technician visit to diagnose the source of the smell safely.`,
} as const;

// ── Main safety check function ─────────────────────────────────────────────────

/**
 * Runs independent safety hazard detection on user text.
 * Must be called BEFORE any other routing or intent classification.
 *
 * @param text   Normalized or raw user text
 * @param opts   Optional context (language hint)
 */
export function safetyCheck(
  text: string,
  opts: { language?: string } = {}
): SafetyCheckResult {
  if (!text || text.trim().length === 0) {
    return { detected: false, level: null, shouldOverrideRouting: false };
  }

  const lower = text.toLowerCase();

  for (const hazard of HAZARD_PATTERNS) {
    const match = hazard.pattern.exec(lower);
    if (!match) continue;

    // Apply negation guard if the pattern is negation-sensitive
    if (hazard.negationSensitive && isNegated(lower, match.index)) {
      continue;
    }

    return {
      detected: true,
      level: hazard.level,
      hazardType: hazard.id,
      responseText: SAFETY_RESPONSES[hazard.responseKey],
      shouldOverrideRouting: hazard.level === 'CRITICAL',
      matchedPattern: hazard.id,
    };
  }

  return { detected: false, level: null, shouldOverrideRouting: false };
}

/**
 * Convenience export — singleton-style object matching the project conventions.
 */
export const safetyEngine = {
  check: safetyCheck,
};

