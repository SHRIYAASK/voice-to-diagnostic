/**
 * CH Error Code Coverage Registry Service
 * Manages official lookup records, AC03 decision-tree compatibility,
 * and unresolved conflicts across model documentation.
 */

import fs from 'fs';
import path from 'path';

export interface ConflictDetails {
  conflict: boolean;
  lookup_definition?: string;
  diagnostic_tree_definition?: string;
  resolution_requirement?: string;
}

export interface ChRegistryEntry {
  code: string;
  display: string;
  lookup_record_available: boolean;
  compatible_diagnostic_flow: string | null;
  definition_source: string;
  model_applicability: string[];
  verification_status: 'verified' | 'unresolved_conflict' | 'unverified_in_tree_only' | 'unverified_in_lookup_only';
  safety_level: 'Low' | 'Medium' | 'High' | 'Critical';
  permitted_customer_action: string;
  technician_action?: string | null;
  likely_parts?: string[];
  conflict_details: ConflictDetails | null;
  requires_manual_verification: boolean;
  note?: string;
}

let _registryCache: Map<string, ChRegistryEntry> | null = null;

function loadRegistry(): Map<string, ChRegistryEntry> {
  if (_registryCache) return _registryCache;

  const registryPath = path.resolve(__dirname, 'ch_error_code_registry.json');
  const raw = fs.readFileSync(registryPath, 'utf-8');
  const list = JSON.parse(raw) as ChRegistryEntry[];

  _registryCache = new Map<string, ChRegistryEntry>();
  for (const item of list) {
    const norm = item.code.toUpperCase().replace(/\s+/g, '');
    _registryCache.set(norm, item);
  }
  return _registryCache;
}

export const errorCodeRegistry = {
  /**
   * Retrieves a registered CH error code by canonical or spoken code (e.g. 'CH05', 'CH 05')
   */
  getEntry: (code: string): ChRegistryEntry | null => {
    const reg = loadRegistry();
    const clean = code.toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '');
    return reg.get(clean) || null;
  },

  /**
   * Returns all registered CH codes
   */
  getAllEntries: (): ChRegistryEntry[] => {
    return Array.from(loadRegistry().values());
  },

  /**
   * Checks if an error code is marked with an unresolved conflict between sources
   */
  isConflict: (code: string): boolean => {
    const entry = errorCodeRegistry.getEntry(code);
    return entry?.verification_status === 'unresolved_conflict';
  },

  /**
   * Formats a customer-safe, factually compliant response adhering to verification status
   */
  formatResponse: (
    entry: ChRegistryEntry
  ): {
    title: string;
    description: string;
    permittedCustomerAction: string;
    safetyAlert: boolean;
    hasConflict: boolean;
    conflictNotice?: string;
    canStartInteractiveFlow: boolean;
    compatibleFlowId?: string | null;
  } => {
    const isSafety = entry.safety_level === 'High' || entry.safety_level === 'Critical';

    // 1. Conflict Case (e.g. CH 06 or CH 10)
    if (entry.verification_status === 'unresolved_conflict' && entry.conflict_details) {
      const cd = entry.conflict_details;
      const conflictNotice =
        `⚠️ **Documentation Conflict Detected:**\n` +
        `• Lookup Reference: *"${cd.lookup_definition}"*\n` +
        `• Diagnostic Tree Reference: *"${cd.diagnostic_tree_definition}"*\n\n` +
        `*Mandatory Verification Required:* ${cd.resolution_requirement} Confirmation from your model-specific user manual or qualified LG service personnel is required before proceeding.`;

      return {
        title: `Error Code ${entry.display} (Verification Required)`,
        description: `This error code has multiple conflicting definitions across available technical documentation.`,
        permittedCustomerAction: entry.permitted_customer_action,
        safetyAlert: true,
        hasConflict: true,
        conflictNotice,
        canStartInteractiveFlow: false,
        compatibleFlowId: null,
      };
    }

    // 2. Verified Lookup Only (No interactive AC03 tree flow)
    if (entry.verification_status === 'unverified_in_lookup_only' || !entry.compatible_diagnostic_flow) {
      return {
        title: `Error Code ${entry.display}`,
        description: `Official error code record found. This code does not require complex interactive symptom branching.`,
        permittedCustomerAction: entry.permitted_customer_action,
        safetyAlert: isSafety,
        hasConflict: false,
        canStartInteractiveFlow: false,
        compatibleFlowId: null,
      };
    }

    // 3. Tree Only (Absent from lookup)
    if (entry.verification_status === 'unverified_in_tree_only') {
      return {
        title: `Error Code ${entry.display} (Diagnostic Tree Finding)`,
        description: `This code is mapped within the guided troubleshooting system, but awaits independent validation against the official spare parts lookup table.`,
        permittedCustomerAction: entry.permitted_customer_action,
        safetyAlert: isSafety,
        hasConflict: false,
        canStartInteractiveFlow: true,
        compatibleFlowId: entry.compatible_diagnostic_flow,
      };
    }

    // 4. Fully Verified Code with Diagnostic Flow
    return {
      title: `Error Code ${entry.display}`,
      description: `Verified diagnostic record for ${entry.display}.`,
      permittedCustomerAction: entry.permitted_customer_action,
      safetyAlert: isSafety,
      hasConflict: false,
      canStartInteractiveFlow: true,
      compatibleFlowId: entry.compatible_diagnostic_flow,
    };
  },
};
