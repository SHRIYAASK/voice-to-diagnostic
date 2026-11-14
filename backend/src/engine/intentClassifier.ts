/**
 * Intent Classifier — ApplianceCare AI
 *
 * Identifies WHAT the customer wants to accomplish (workflow intent).
 * This is distinct from layaClassifier.ts, which identifies WHICH AC symptom tree
 * to use (diagnostic sub-classification).
 *
 * Three-tier priority:
 * 1. Deterministic keyword/regex rules (< 1ms)
 * 2. Session context (active tree? → FOLLOW_UP)
 * 3. layaClassifier for DIAGNOSIS confirmation (< 25ms)
 *
 * Returns UNKNOWN when confidence is insufficient rather than forcing an intent.
 * Never executes actions.
 */

import { layaClassifier } from './layaClassifier';
import intentRegistryData from '../data/intentRegistry.json';

export type WorkflowIntent =
  | 'DIAGNOSIS'
  | 'BOOKING'
  | 'WARRANTY'
  | 'REPAIR_STATUS'
  | 'GENERAL_SUPPORT'
  | 'AUDIBILITY_CHECK'
  | 'LANGUAGE_COMMAND'
  | 'FOLLOW_UP'
  | 'UNKNOWN';

export type IntentSource = 'RULE' | 'CLASSIFIER' | 'CONTEXT' | 'UNKNOWN';

export interface IntentClassificationResult {
  primary: WorkflowIntent;
  secondary?: WorkflowIntent[];
  confidence: number;      // 0.0 – 1.0
  source: IntentSource;
  rationale?: string;
}

// ── Compiled signals from data/intentRegistry.json ────────────────────────────
const INTENT_PATTERNS: Map<string, RegExp[]> = new Map();
(intentRegistryData.intents || []).forEach((item: { id: string; patterns: string[] }) => {
  INTENT_PATTERNS.set(item.id, item.patterns.map((p) => new RegExp(p, 'i')));
});

const BOOKING_SIGNALS = INTENT_PATTERNS.get('BOOKING') || [];
const WARRANTY_SIGNALS = INTENT_PATTERNS.get('WARRANTY') || [];
const REPAIR_STATUS_SIGNALS = INTENT_PATTERNS.get('REPAIR_STATUS') || [];
const GENERAL_SUPPORT_SIGNALS = INTENT_PATTERNS.get('GENERAL_SUPPORT') || [];
const AUDIBILITY_SIGNALS = INTENT_PATTERNS.get('AUDIBILITY_CHECK') || [];
const LANGUAGE_COMMAND_SIGNALS = INTENT_PATTERNS.get('LANGUAGE_COMMAND') || [];

// ── Context-based FOLLOW_UP detection ──────────────────────────────────────────
// If the session has an active diagnostic tree, short answers are likely follow-ups.
const SHORT_ANSWER_PATTERN = /^(yes|no|yeah|yep|nope|correct|right|confirmed|not\s+sure|maybe|sometimes|always|never|ok|okay|sure|done|already|already\s+did|i\s+did|it\s+is|it\s+isn.?t|it\s+does|it\s+doesn.?t|\d+)$/i;

// ── Classifier confidence threshold ───────────────────────────────────────────
const CLASSIFIER_DIAGNOSIS_THRESHOLD = 0.5;

// ── Main classify function ─────────────────────────────────────────────────────

/**
 * Classifies the customer's workflow intent from their utterance.
 *
 * @param text              Normalized user text (after TranscriptManager.normalize())
 * @param sessionContext    Optional session context for FOLLOW_UP detection
 */
export function classifyIntent(
  text: string,
  sessionContext?: {
    hasActiveDiagnosticTree?: boolean;
    lastBotQuestionText?: string;
    language?: string;
  }
): IntentClassificationResult {
  const trimmed = (text || '').trim();

  if (!trimmed) {
    return {
      primary: 'UNKNOWN',
      confidence: 0,
      source: 'UNKNOWN',
      rationale: 'Empty input',
    };
  }

  // ── Tier 1: Deterministic BOOKING check (highest priority among workflow intents) ──
  for (const pattern of BOOKING_SIGNALS) {
    if (pattern.test(trimmed)) {
      return {
        primary: 'BOOKING',
        confidence: 0.97,
        source: 'RULE',
        rationale: `Matched booking signal pattern`,
      };
    }
  }

  // ── Tier 1: Deterministic REPAIR_STATUS check ──
  for (const pattern of REPAIR_STATUS_SIGNALS) {
    if (pattern.test(trimmed)) {
      return {
        primary: 'REPAIR_STATUS',
        confidence: 0.95,
        source: 'RULE',
        rationale: `Matched repair status signal pattern`,
      };
    }
  }

  // ── Tier 1: Deterministic WARRANTY check ──
  for (const pattern of WARRANTY_SIGNALS) {
    if (pattern.test(trimmed)) {
      return {
        primary: 'WARRANTY',
        confidence: 0.93,
        source: 'RULE',
        rationale: `Matched warranty signal pattern`,
      };
    }
  }

  // ── Tier 1: Deterministic LANGUAGE_COMMAND check ──
  for (const pattern of LANGUAGE_COMMAND_SIGNALS) {
    if (pattern.test(trimmed)) {
      return {
        primary: 'LANGUAGE_COMMAND',
        confidence: 0.98,
        source: 'RULE',
        rationale: 'Matched explicit language or style change command',
      };
    }
  }

  // ── Tier 1: Deterministic AUDIBILITY_CHECK check ──
  for (const pattern of AUDIBILITY_SIGNALS) {
    if (pattern.test(trimmed)) {
      return {
        primary: 'AUDIBILITY_CHECK',
        confidence: 0.98,
        source: 'RULE',
        rationale: 'Matched audibility / connection verification question',
      };
    }
  }

  // ── Tier 1: Deterministic GENERAL_SUPPORT check ──
  for (const pattern of GENERAL_SUPPORT_SIGNALS) {
    if (pattern.test(trimmed)) {
      return {
        primary: 'GENERAL_SUPPORT',
        confidence: 0.9,
        source: 'RULE',
        rationale: `Matched general support / greeting pattern`,
      };
    }
  }

  // ── Tier 2: Session CONTEXT — FOLLOW_UP detection ──
  if (sessionContext?.hasActiveDiagnosticTree) {
    // Short answers to an active diagnostic question are very likely follow-ups
    if (SHORT_ANSWER_PATTERN.test(trimmed)) {
      return {
        primary: 'FOLLOW_UP',
        confidence: 0.9,
        source: 'CONTEXT',
        rationale: 'Short answer pattern with active diagnostic session — interpreted as FOLLOW_UP',
      };
    }
    // Any answer when there's an active tree and no strong workflow intent
    // detected above is probably a follow-up observation
    if (trimmed.length < 80) {
      return {
        primary: 'FOLLOW_UP',
        confidence: 0.75,
        source: 'CONTEXT',
        rationale: 'Active diagnostic session present — treating moderate-length input as FOLLOW_UP',
      };
    }
  }

  // ── Tier 3: Classifier-based DIAGNOSIS confirmation ──
  // layaClassifier identifies which AC symptom tree fits best.
  // If it returns a tree with confidence >= 0.70 (not fallback triage), intent is DIAGNOSIS.
  try {
    const classResult = layaClassifier.classify(trimmed);
    if (
      classResult &&
      classResult.intent_type === 'SYMPTOM_TREE' &&
      classResult.confidence >= 0.70
    ) {
      return {
        primary: 'DIAGNOSIS',
        confidence: classResult.confidence,
        source: 'CLASSIFIER',
        rationale: `layaClassifier matched: ${classResult.intent_type} (confidence: ${classResult.confidence.toFixed(2)})`,
      };
    }
  } catch {
    // If layaClassifier throws, fall through to UNKNOWN
  }

  // ── Unknown: not enough signal ──
  return {
    primary: 'UNKNOWN',
    confidence: 0.3,
    source: 'UNKNOWN',
    rationale: 'No deterministic rule matched and classifier confidence was insufficient',
  };
}

/**
 * Convenience export — singleton-style object matching project conventions.
 */
export const intentClassifier = {
  classify: classifyIntent,
};

