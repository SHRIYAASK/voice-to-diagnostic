/**
 * Deterministic Routing Engine for ApplianceCare AI
 *
 * Classifies every user request into 1 of 6 deterministic categories:
 * 1. EXPLICIT_ERROR_CODE: Local lookup in errorCodeRegistry first
 * 2. SYMPTOM_TROUBLESHOOTING: Drives progression through AC01-AC16 decision trees
 * 3. INSTRUCTION_REQUEST: Resolves exact action ID from global_instructions.json
 * 4. TECHNICAL_SPECIFICATION: Metadata-filtered retrieval gated behind technician auth
 * 5. WARRANTY_POLICY: Metadata-filtered retrieval from warranty_policy_rules.txt
 * 6. GENERAL_APPLIANCE: General operational questions with verified fallback
 *
 * Strict Rules:
 * - Decision tree controls diagnostic progression; RAG cannot override tree branches or safety rules.
 * - AC issue IDs (AC01-AC16) and displayed CH fault codes (CH01-CH97) are strictly separated.
 * - Customer requests NEVER receive dangerous electrical/disassembly procedures.
 * - Preserves structured evidence provenance (source IDs, verification status, safety constraints).
 */

import { normalizeAcIssueId, normalizeChErrorCode } from './namespaceNormalizer';
import { errorCodeRegistry, ChRegistryEntry } from '../data/errorCodeRegistry';
import { instructionResolver, InstructionResolutionResult } from './instructionResolver';
import { retrievalService, RetrievalTelemetry } from './retrievalService';
import { StructuredEvidence, EvidenceItem, createEmptyEvidence } from './evidence';
import { safetyEngine, SafetyCheckResult } from './safetyEngine';
import { ConversationUnderstanding } from './conversationUnderstanding';
import { treeIndexService } from './treeIndexService';

export type DeterministicRouteType =
  | 'EXPLICIT_ERROR_CODE'
  | 'SYMPTOM_TROUBLESHOOTING'
  | 'INSTRUCTION_REQUEST'
  | 'TECHNICAL_SPECIFICATION'
  | 'WARRANTY_POLICY'
  | 'GENERAL_APPLIANCE'
  | 'BOOKING'
  | 'REPAIR_STATUS'
  | 'FOLLOW_UP'
  | 'UNKNOWN';

export interface RouteResolution {
  route: DeterministicRouteType;
  confidence: number;
  rationale: string;
  targetId?: string; // e.g. 'CH05', 'AC01', 'instruct_clean_dry_filter'
  chResult?: {
    entry: ChRegistryEntry | null;
    isAmbiguous: boolean;
    disambiguationPrompt?: string;
    formatted: ReturnType<typeof errorCodeRegistry.formatResponse> | null;
  };
  instructionResult?: InstructionResolutionResult;
  retrievalTelemetry?: RetrievalTelemetry;
  safetyAlert: boolean;
  responseText: string;
  evidence: StructuredEvidence;
}

export const deterministicRouter = {
  /**
   * Deterministically routes user input into one of the 6 categories
   */
  route: (
    input: string,
    options: {
      model?: string;
      audience?: 'customer' | 'technician';
      appliance_type?: string;
      language?: string;
    } = {},
    understanding?: ConversationUnderstanding
  ): RouteResolution => {
    const raw = (input || '').trim();
    const audience = options.audience || 'customer';
    const model = options.model || 'UW-Q18WUZA';
    const appliance = options.appliance_type || 'air-conditioner';

    // ── GATING 0: Independent Safety Engine Check ─────────────────────────────
    const safetyResult: SafetyCheckResult = safetyEngine.check(raw);
    if (safetyResult.detected) {
      const isCritical = safetyResult.level === 'CRITICAL';
      const evidence = createEmptyEvidence('SYMPTOM_TROUBLESHOOTING', { appliance, model, audience, selectedPath: 'AC16_EMERGENCY' });
      evidence.safetyConstraints = {
        safetyAlert: true,
        lethalHazardBlocked: isCritical,
        escalationRequired: true,
      };

      return {
        route: 'SYMPTOM_TROUBLESHOOTING',
        confidence: 1.0,
        rationale: `Safety hazard detected: ${safetyResult.hazardType || 'hazard'}`,
        targetId: 'AC16',
        safetyAlert: true,
        responseText: safetyResult.responseText || 'Emergency safety hazard detected.',
        evidence,
      };
    }

    // ── GATING 0.2: Direct Understanding Injected Routes (if passed) ───────────
    if (understanding) {
      if (understanding.intent.primary === 'BOOKING') {
        const evidence = createEmptyEvidence('BOOKING', { appliance, model, audience, selectedPath: 'BOOKING_WORKFLOW' });
        return {
          route: 'BOOKING',
          confidence: understanding.intent.confidence,
          rationale: 'Customer requested technician booking workflow.',
          safetyAlert: false,
          responseText: 'Opening Service Booking form with your diagnostic findings attached. You can pick an LG certified technician and time slot.',
          evidence,
        };
      }

      if (understanding.intent.primary === 'REPAIR_STATUS') {
        const evidence = createEmptyEvidence('REPAIR_STATUS', { appliance, model, audience, selectedPath: 'REPAIR_STATUS_LOOKUP' });
        return {
          route: 'REPAIR_STATUS',
          confidence: understanding.intent.confidence,
          rationale: 'Customer requested repair ticket status lookup.',
          safetyAlert: false,
          responseText: 'To check your existing service ticket status, please provide your service request number or phone number registered with the booking.',
          evidence,
        };
      }
    }

    // ── GATING 0.5: Wrong Appliance Detection (BP05) ───────────────────────────
    if (appliance === 'air-conditioner') {
      const wrongApplianceMatch = raw.match(/\b(fridge|refrigerator|washing machine|dryer|microwave|dishwasher|oven|geyser|tv|television)\b/i);
      if (wrongApplianceMatch && !/\b(ac|air conditioner|dual inverter)\b/i.test(raw)) {
        const detected = wrongApplianceMatch[1].toLowerCase();
        const evidence = createEmptyEvidence('GENERAL_APPLIANCE', { appliance, model, audience, selectedPath: 'WRONG_APPLIANCE' });
        evidence.conflicts.push(`Query intended for ${detected}, not air conditioner`);

        return {
          route: 'GENERAL_APPLIANCE',
          confidence: 0.95,
          rationale: `Detected query for ${detected} on air conditioner diagnostic agent.`,
          safetyAlert: false,
          responseText:
            `You mentioned a **${detected}**. This diagnostic assistant is currently set up for your **LG Dual Inverter Air Conditioner (${model})**.\n\n` +
            `Please select the appropriate appliance from the top navigation bar or ask a question regarding your air conditioner.`,
          evidence,
        };
      }
    }

    // ── ROUTE 1: Explicit Error Code Check ─────────────────────────────────────
    // Use strict normalizeChErrorCode - guarantees AC01 can never match CH01!
    const chNorm = normalizeChErrorCode(raw);

    if (chNorm.isAmbiguous) {
      const evidence = createEmptyEvidence('EXPLICIT_ERROR_CODE', { appliance, model, audience, selectedPath: 'CH_AMBIGUOUS_CONFIRM' });
      evidence.conflicts.push('Ambiguous error code transcript requiring confirmation');

      return {
        route: 'EXPLICIT_ERROR_CODE',
        confidence: chNorm.confidence,
        rationale: 'Ambiguous speech/input detected for displayed error code.',
        chResult: {
          entry: null,
          isAmbiguous: true,
          disambiguationPrompt: chNorm.disambiguationPrompt,
          formatted: null,
        },
        safetyAlert: false,
        responseText: chNorm.disambiguationPrompt || 'Please confirm the exact error code shown on your AC display.',
        evidence,
      };
    }

    if (chNorm.code) {
      const entry = errorCodeRegistry.getEntry(chNorm.code);
      const evidence = createEmptyEvidence('EXPLICIT_ERROR_CODE', { appliance, model, audience, selectedPath: `EXACT_REGISTRY_${chNorm.code}` });

      if (entry) {
        const formatted = errorCodeRegistry.formatResponse(entry);
        let resp = `📟 **${formatted.title}**\n\n${formatted.description}\n\n**Recommended User Action:**\n${formatted.permittedCustomerAction}`;
        if (formatted.conflictNotice) {
          resp += `\n\n${formatted.conflictNotice}`;
          evidence.conflicts.push(formatted.conflictNotice);
        }

        const isHazard = entry.safety_level === 'High' || entry.safety_level === 'Critical';
        evidence.safetyConstraints = {
          safetyAlert: formatted.safetyAlert,
          lethalHazardBlocked: isHazard && audience === 'customer',
          escalationRequired: isHazard || formatted.hasConflict,
        };

        evidence.evidenceItems.push({
          sourceId: entry.definition_source,
          documentType: 'error_code_registry',
          verificationStatus: entry.verification_status,
          contentSnippet: `${entry.display}: ${entry.permitted_customer_action}`,
        });

        return {
          route: 'EXPLICIT_ERROR_CODE',
          confidence: 0.99,
          rationale: `Exact local lookup match for verified error code ${chNorm.code} in errorCodeRegistry.`,
          targetId: chNorm.code,
          chResult: {
            entry,
            isAmbiguous: false,
            formatted,
          },
          safetyAlert: formatted.safetyAlert,
          responseText: resp,
          evidence,
        };
      } else {
        // Code recognized syntactically as CHxx but unknown in official registry
        evidence.conflicts.push(`Error code ${chNorm.code} not found in verified registry.`);
        return {
          route: 'EXPLICIT_ERROR_CODE',
          confidence: 0.7,
          rationale: `Code ${chNorm.code} not found in official LG error code registry.`,
          targetId: chNorm.code,
          safetyAlert: false,
          responseText:
            `Error code **${chNorm.code}** is not listed in the verified LG Dual Inverter database.\n\n` +
            `Please check whether the display shows a different code (such as CH 05, CH 38, or status code Po/Lo), or refer to your product user manual.`,
          evidence,
        };
      }
    }

    // ── ROUTE 2: Direct Issue ID Check (e.g. AC01) ─────────────────────────────
    const acIssueId = normalizeAcIssueId(raw);
    if (acIssueId && treeIndexService.hasTree(acIssueId)) {
      const topicTitle = treeIndexService.getTopicTitle(acIssueId);
      const isSafetyAlert = acIssueId === 'AC16' || acIssueId === 'AC03';
      const evidence = createEmptyEvidence('SYMPTOM_TROUBLESHOOTING', { appliance, model, audience, selectedPath: `TREE_${acIssueId}` });
      evidence.activeNodeId = acIssueId;
      evidence.safetyConstraints.safetyAlert = isSafetyAlert;
      evidence.evidenceItems.push({
        sourceId: 'lg_ac_diagnostic_trees_combined.json',
        documentType: 'decision_tree',
        verificationStatus: 'verified',
        contentSnippet: `Diagnostic Flow ${acIssueId}: ${topicTitle}`,
      });

      return {
        route: 'SYMPTOM_TROUBLESHOOTING',
        confidence: 1.0,
        rationale: `Direct internal diagnostic issue ID matched: ${acIssueId}.`,
        targetId: acIssueId,
        safetyAlert: isSafetyAlert,
        responseText: `Let's troubleshoot your **${topicTitle}**. Here are a few quick checks:`,
        evidence,
      };
    }

    // ── ROUTE 3: Instruction Action ID or Direct Maintenance Instruction ───────
    if (raw.startsWith('instruct_') || instructionResolver.hasAction(raw)) {
      const resolution = instructionResolver.resolve(raw, model, audience);
      const evidence = createEmptyEvidence('INSTRUCTION_REQUEST', { appliance, model, audience, selectedPath: `INSTRUCTION_${raw}` });

      if (resolution.found && resolution.instruction) {
        evidence.evidenceItems.push({
          sourceId: resolution.instruction.source,
          documentType: 'global_instructions',
          verificationStatus: resolution.instruction.verification_status,
          contentSnippet: resolution.instruction.text,
        });
        evidence.safetyConstraints.safetyAlert = resolution.instruction.safety_flag;

        return {
          route: 'INSTRUCTION_REQUEST',
          confidence: 1.0,
          rationale: `Exact action ID resolved from global instruction registry: ${raw}.`,
          targetId: raw,
          instructionResult: resolution,
          safetyAlert: resolution.instruction.safety_flag,
          responseText: `📋 **Procedure: ${resolution.instruction.id}**\n\n${resolution.instruction.text}`,
          evidence,
        };
      } else if (resolution.safetyBlocked) {
        evidence.safetyConstraints = {
          safetyAlert: true,
          lethalHazardBlocked: true,
          escalationRequired: true,
        };
        evidence.conflicts.push('Technician-only procedure blocked for customer audience.');

        return {
          route: 'INSTRUCTION_REQUEST',
          confidence: 0.95,
          rationale: 'Technician-only procedure blocked for customer audience.',
          safetyAlert: true,
          responseText: '⚠️ **Safety Restriction:** This procedure involves internal electrical or mechanical components and must be performed by an authorized service technician.',
          evidence,
        };
      }
    }

    // Check for conversational maintenance commands (e.g., "how to clean filter", "how to reset mcb")
    if (/\b(how to clean filter|filter cleaning steps|clean the filter)\b/i.test(raw)) {
      const filterInst = instructionResolver.resolve('instruct_clean_dry_filter', model, audience);
      if (filterInst.found && filterInst.instruction) {
        const evidence = createEmptyEvidence('INSTRUCTION_REQUEST', { appliance, model, audience, selectedPath: 'instruct_clean_dry_filter' });
        evidence.evidenceItems.push({
          sourceId: filterInst.instruction.source,
          documentType: 'global_instructions',
          verificationStatus: filterInst.instruction.verification_status,
          contentSnippet: filterInst.instruction.text,
        });

        return {
          route: 'INSTRUCTION_REQUEST',
          confidence: 0.95,
          rationale: 'Conversational match for filter cleaning instruction.',
          targetId: 'instruct_clean_dry_filter',
          instructionResult: filterInst,
          safetyAlert: false,
          responseText: `📋 **Air Filter Cleaning Procedure**\n\n${filterInst.instruction.text}`,
          evidence,
        };
      }
    }

    // ── ROUTE 4: Technical Specification Questions ─────────────────────────────
    if (/\b(multimeter|resistance|ohm|voltage|fuse rating|compressor winding|dc link|capacitor|pcb voltage|probe)\b/i.test(raw)) {
      const evidence = createEmptyEvidence('TECHNICAL_SPECIFICATION', { appliance, model, audience, selectedPath: 'ELECTRICAL_SPECS_RAG' });

      if (audience === 'customer') {
        evidence.safetyConstraints = {
          safetyAlert: true,
          lethalHazardBlocked: true,
          escalationRequired: true,
        };
        evidence.evidenceItems.push({
          sourceId: 'manual_electrical_specs.txt',
          documentType: 'electrical_specs',
          verificationStatus: 'verified',
          contentSnippet: 'Manufacturer safety policy strictly forbids customer disassembly or electrical probing.',
        });

        return {
          route: 'TECHNICAL_SPECIFICATION',
          confidence: 0.95,
          rationale: 'Customer audience attempting to access hazardous electrical specs.',
          safetyAlert: true,
          responseText:
            '⚠️ **Safety Warning — Lethal Voltage Hazard:**\n\n' +
            'Measuring internal terminal resistance, PCB voltage, or inspecting capacitors exposes lethal 230V mains and DC bus charges. ' +
            'Manufacturer safety policy strictly forbids customer disassembly or electrical probing. Please schedule an authorized service technician.',
          evidence,
        };
      }

      // Technician access: Retrieve with unverified disclaimer
      const specTelemetry = retrievalService.retrieve(raw, {
        appliance_type: appliance,
        model,
        audience: 'technician',
        document_type: 'electrical_specs',
        topK: 2,
        fusionStrategy: 'rrf',
      });

      specTelemetry.results.forEach((r) => evidence.evidenceItems.push(r.evidence));
      const topChunk = specTelemetry.results[0]?.chunk;
      const resp = topChunk
        ? `⚠️ **Technician Reference (Unverified Benchmark Notice):**\n*Values must be verified against model nameplate and official wiring diagram.*\n\n${topChunk.content.slice(0, 500)}...`
        : 'Technical specification benchmark not found in local service reference.';

      return {
        route: 'TECHNICAL_SPECIFICATION',
        confidence: 0.9,
        rationale: 'Technician technical specification retrieved with unverified disclaimer.',
        retrievalTelemetry: specTelemetry,
        safetyAlert: true,
        responseText: resp,
        evidence,
      };
    }

    // ── ROUTE 5: Warranty & Policy Questions ───────────────────────────────────
    if (/\b(warranty|guarantee|compressor coverage|pcb warranty|amc|invoice|registration period)\b/i.test(raw)) {
      const evidence = createEmptyEvidence('WARRANTY_POLICY', { appliance, model, audience, selectedPath: 'WARRANTY_RAG' });
      const warrantyTelemetry = retrievalService.retrieve(raw, {
        appliance_type: appliance,
        model,
        audience,
        document_type: 'warranty',
        topK: 2,
        fusionStrategy: 'rrf',
      });

      warrantyTelemetry.results.forEach((r) => evidence.evidenceItems.push(r.evidence));
      const topChunk = warrantyTelemetry.results[0]?.chunk;
      const resp = topChunk
        ? `📜 **LG AC Warranty Information (${model}):**\n\n${topChunk.content.slice(0, 600)}...\n\n*Notice: Warranty coverage is indicative and subject to physical verification of purchase invoice and unit serial number by authorized LG personnel.*`
        : 'Warranty policy record not found in local documentation.';

      return {
        route: 'WARRANTY_POLICY',
        confidence: 0.9,
        rationale: 'Warranty policy question routed to metadata-filtered warranty knowledge.',
        retrievalTelemetry: warrantyTelemetry,
        safetyAlert: false,
        responseText: resp,
        evidence,
      };
    }

    // ── ROUTE 6: Symptom-Based Diagnostic Tree Match ───────────────────────────
    // Check for Resolution Report (HP08)
    if (/\b(cleaned.*filter.*normal|cooling.*normal|cooling.*restored|working fine now|issue.*resolved)\b/i.test(raw)) {
      const evidence = createEmptyEvidence('SYMPTOM_TROUBLESHOOTING', { appliance, model, audience, selectedPath: 'RESOLVED_FILTER' });
      return {
        route: 'SYMPTOM_TROUBLESHOOTING',
        confidence: 0.98,
        rationale: 'User reported successful resolution following filter cleaning.',
        targetId: 'resolved_filter_cleaning',
        safetyAlert: false,
        responseText: '🎉 **Great news!** Normal cooling performance has been restored. No technician visit is required.\n\n*Tip:* Clean air filters every 15 days to maintain optimal airflow.',
        evidence,
      };
    }

    // ── ROUTE 3: Declarative Dynamic Symptom Match ────────────────────────────
    const symptomMatch = treeIndexService.findTargetForSymptom(raw, appliance);
    if (symptomMatch) {
      const evidence = createEmptyEvidence('SYMPTOM_TROUBLESHOOTING', { appliance, model, audience, selectedPath: `SYMPTOM_${symptomMatch.canonicalIssueId}` });
      evidence.activeNodeId = symptomMatch.targetId;
      evidence.safetyConstraints.safetyAlert = symptomMatch.safetyAlert;
      evidence.evidenceItems.push({
        sourceId: 'lg_ac_diagnostic_trees_combined.json',
        documentType: 'decision_tree',
        verificationStatus: 'verified',
        contentSnippet: `Matched symptom pattern: ${symptomMatch.displayTopic}`,
      });

      return {
        route: 'SYMPTOM_TROUBLESHOOTING',
        confidence: symptomMatch.confidence,
        rationale: symptomMatch.rationale,
        targetId: symptomMatch.targetId,
        safetyAlert: symptomMatch.safetyAlert,
        responseText: `It sounds like you're experiencing a **${symptomMatch.displayTopic.toLowerCase()}** with your air conditioner. Let's check a few quick things step by step:`,
        evidence,
      };
    }

    // ── ROUTE 7: General Appliance Question Fallback (RAG) ─────────────────────
    // Diagnostic / Symptom Leakage Guard:
    // If the input describes operational behavior (e.g. "fan running", "outside not working", "stops"),
    // do NOT dump raw manual pages like Timer notes! Prompt for symptom clarification instead.
    const isSymptomLike = /\b(running|stopped?|working|outside|outdoor|indoor|compressor|fan|cooling|cools|noise|sound|smell|dripping|leak|won'?t)\b/i.test(raw);

    const evidence = createEmptyEvidence('GENERAL_APPLIANCE', { appliance, model, audience, selectedPath: 'GENERAL_RAG_FALLBACK' });

    if (!isSymptomLike) {
      const generalTelemetry = retrievalService.retrieve(raw, {
        appliance_type: appliance,
        model,
        audience,
        topK: 2,
        similarityThreshold: 0.15,
        fusionStrategy: 'rrf',
      });

      if (generalTelemetry.results.length > 0) {
        generalTelemetry.results.forEach((r) => evidence.evidenceItems.push(r.evidence));
        const chunk = generalTelemetry.results[0].chunk;
        return {
          route: 'GENERAL_APPLIANCE',
          confidence: 0.75,
          rationale: 'General appliance question resolved using metadata-filtered knowledge chunks.',
          retrievalTelemetry: generalTelemetry,
          safetyAlert: false,
          responseText: `${chunk.content.slice(0, 500)}...`,
          evidence,
        };
      }
    }

    // Fallback: Default to triage guidance without inventing diagnosis
    evidence.conflicts.push('Unrecognized query falling back to safe triage choices.');
    const lang = (options as any)?.language || understanding?.language || 'en';
    let fallbackText = 'Could you please describe what is happening with your air conditioner?';
    if (lang === 'ta') {
      fallbackText = 'உங்க AC-ல என்ன பிரச்சனை-ன்னு சொல்லுங்க?';
    } else if (lang === 'hi') {
      fallbackText = 'Aapke AC mein kya problem ho rahi hai bataiye?';
    }

    return {
      route: 'GENERAL_APPLIANCE',
      confidence: 0.4,
      rationale: 'Unrecognized query falling back to safe triage choices.',
      safetyAlert: false,
      responseText: fallbackText,
      evidence,
    };
  },
};
