/**
 * Evidence Provenance Data Model for ApplianceCare AI
 *
 * Captures source-of-truth metadata, verification status, and safety constraints
 * across all 6 routing categories. This object travels with the response to ensure
 * no claims are made without verified backing documentation.
 */

export type RouteIntent =
  | 'EXPLICIT_ERROR_CODE'
  | 'SYMPTOM_TROUBLESHOOTING'
  | 'INSTRUCTION_REQUEST'
  | 'TECHNICAL_SPECIFICATION'
  | 'WARRANTY_POLICY'
  | 'GENERAL_APPLIANCE'
  // Extended intents added by conversationUnderstanding layer
  | 'BOOKING'
  | 'REPAIR_STATUS'
  | 'FOLLOW_UP'
  | 'UNKNOWN';

export type VerificationStatus =
  | 'verified'
  | 'unresolved_conflict'
  | 'unverified_in_tree_only'
  | 'unverified_in_lookup_only'
  | 'unverified_warning'
  | 'policy_pending'
  | 'derived'
  | 'unverified';

export interface EvidenceItem {
  sourceId: string; // e.g. 'lg_ac_error_codes.json', 'diagnostic_tree_ac03.json', 'chunk_014'
  section?: string;
  documentType: string; // e.g. 'error_code_registry', 'decision_tree', 'maintenance', 'warranty', 'electrical_specs'
  verificationStatus: VerificationStatus;
  contentSnippet: string;
}

export interface StructuredEvidence {
  intent: RouteIntent;
  appliance: string;
  model: string;
  audience: 'customer' | 'technician';
  selectedPath: string;
  activeNodeId?: string;
  conclusionId?: string;
  evidenceItems: EvidenceItem[];
  safetyConstraints: {
    safetyAlert: boolean;
    lethalHazardBlocked: boolean;
    escalationRequired: boolean;
  };
  conflicts: string[];
}

export function createEmptyEvidence(
  intent: RouteIntent,
  options: {
    appliance?: string;
    model?: string;
    audience?: 'customer' | 'technician';
    selectedPath?: string;
  } = {}
): StructuredEvidence {
  return {
    intent,
    appliance: options.appliance || 'air-conditioner',
    model: options.model || 'UW-Q18WUZA',
    audience: options.audience || 'customer',
    selectedPath: options.selectedPath || 'default',
    evidenceItems: [],
    safetyConstraints: {
      safetyAlert: false,
      lethalHazardBlocked: false,
      escalationRequired: false,
    },
    conflicts: [],
  };
}
