/**
 * Conversation Understanding Coordinator — ApplianceCare AI
 *
 * Primary integration hub for natural language and voice utterance comprehension.
 * Coordinates:
 * 1. Transcript normalization (via transcriptNormalizer)
 * 2. Independent safety enforcement (via safetyEngine)
 * 3. Intent classification (via intentClassifier)
 * 4. Entity extraction (via entityExtractor)
 * 5. Symptom extraction (via symptomExtractor)
 * 6. Missing information & clarification evaluation
 */

import { transcriptNormalizer } from './transcriptNormalizer';
import { safetyEngine, SafetyCheckResult } from '../engine/safetyEngine';
import { intentClassifier, IntentClassificationResult, WorkflowIntent, IntentSource } from '../engine/intentClassifier';
import { entityExtractor, ExtractedEntities } from '../engine/entityExtractor';
import { symptomExtractor, ExtractedSymptoms } from '../engine/symptomExtractor';
import { clarificationManager, ClarificationQuestion } from '../engine/clarificationManager';

export interface ConversationUnderstanding {
  rawTranscript: string;
  normalizedTranscript: string;
  intent: {
    primary: WorkflowIntent;
    secondary?: WorkflowIntent[];
    confidence: number;
    source: IntentSource;
    rationale?: string;
  };
  appliance: {
    type?: string;
    brand?: string;
    model?: string;
    subtype?: string;
  };
  symptoms: {
    primary?: string;
    secondary?: string[];
    affectedArea?: string;
    duration?: string;
    observations: string[];
    confidence: number;
  };
  errorCodes: string[];
  missingInformation: string[];
  language: 'en' | 'hi' | 'ta';
  requiresClarification: boolean;
  clarificationQuestion?: ClarificationQuestion;
  safety: {
    detected: boolean;
    level: string | null;
    responseText?: string;
    shouldOverrideRouting: boolean;
    hazardType?: string;
  };
}

export const conversationUnderstanding = {
  /**
   * Understands a user utterance by running safety, intent, entity, and symptom pipelines.
   */
  understand(
    rawText: string,
    sessionContext?: {
      sessionId?: string;
      appliance?: string;
      model?: string;
      language?: 'en' | 'hi' | 'ta';
      hasActiveDiagnosticTree?: boolean;
      lastBotQuestionText?: string;
    }
  ): ConversationUnderstanding {
    const raw = (rawText || '').trim();
    const normalized = transcriptNormalizer.normalize(raw);
    const lang = sessionContext?.language || 'en';

    // ── STAGE 1: Independent Safety Detection ──────────────────────────────
    const safetyRes: SafetyCheckResult = safetyEngine.check(normalized, { language: lang });

    // ── STAGE 2: Intent Classification ─────────────────────────────────────
    const intentRes: IntentClassificationResult = intentClassifier.classify(normalized, {
      hasActiveDiagnosticTree: sessionContext?.hasActiveDiagnosticTree,
      lastBotQuestionText: sessionContext?.lastBotQuestionText,
      language: lang,
    });

    // ── STAGE 3: Entity Extraction ─────────────────────────────────────────
    const entities: ExtractedEntities = entityExtractor.extract(normalized, {
      appliance: sessionContext?.appliance,
      model: sessionContext?.model,
    });

    // ── STAGE 4: Symptom Extraction ────────────────────────────────────────
    const symptoms: ExtractedSymptoms = symptomExtractor.extract(normalized);

    // ── STAGE 5: Missing Information & Clarification Evaluation ────────────
    const missingInformation: string[] = [];
    let requiresClarification = false;
    let clarificationQuestion: ClarificationQuestion | undefined;

    // Safety critical events override everything and do not require clarification
    if (safetyRes.detected && safetyRes.shouldOverrideRouting) {
      requiresClarification = false;
    } else if (
      intentRes.primary === 'BOOKING' ||
      intentRes.primary === 'REPAIR_STATUS' ||
      intentRes.primary === 'WARRANTY' ||
      intentRes.primary === 'AUDIBILITY_CHECK' ||
      intentRes.primary === 'LANGUAGE_COMMAND' ||
      intentRes.primary === 'GENERAL_SUPPORT'
    ) {
      // Direct workflow/conversational routing - no preliminary diagnostic clarification required
      requiresClarification = false;
    } else if (
      intentRes.primary === 'DIAGNOSIS' &&
      !symptoms.primary &&
      entities.errorCodes.length === 0 &&
      intentRes.confidence < 0.74           // only clarify when classifier is also uncertain
    ) {
      missingInformation.push('symptom');
      requiresClarification = true;
      clarificationQuestion = clarificationManager.getQuestion('symptom', lang);
    } else if (intentRes.primary === 'UNKNOWN') {
      // If a valid symptom or error code was already extracted, promote to DIAGNOSIS and do NOT clarify!
      if (symptoms.primary || entities.errorCodes.length > 0) {
        intentRes.primary = 'DIAGNOSIS';
        intentRes.confidence = Math.max(intentRes.confidence, symptoms.extractionConfidence || 0.85);
        intentRes.source = 'RULE';
        intentRes.rationale = `Promoted to DIAGNOSIS based on extracted symptom: "${symptoms.primary || entities.errorCodes[0]}"`;
        requiresClarification = false;
      } else {
        requiresClarification = true;
        clarificationQuestion = clarificationManager.getQuestion('symptom', lang);
      }
    }

    return {
      rawTranscript: raw,
      normalizedTranscript: normalized,
      intent: {
        primary: intentRes.primary,
        secondary: intentRes.secondary,
        confidence: intentRes.confidence,
        source: intentRes.source,
        rationale: intentRes.rationale,
      },
      appliance: {
        type: entities.applianceType,
        brand: entities.brand,
        model: entities.model,
        subtype: entities.subtype,
      },
      symptoms: {
        primary: symptoms.primary,
        secondary: symptoms.secondary,
        affectedArea: symptoms.affectedArea || entities.location,
        duration: symptoms.duration || entities.duration,
        observations: symptoms.observations,
        confidence: symptoms.extractionConfidence,
      },
      errorCodes: entities.errorCodes,
      missingInformation,
      language: lang,
      requiresClarification,
      clarificationQuestion,
      safety: {
        detected: safetyRes.detected,
        level: safetyRes.level,
        responseText: safetyRes.responseText,
        shouldOverrideRouting: safetyRes.shouldOverrideRouting,
        hazardType: safetyRes.hazardType,
      },
    };
  },
};

