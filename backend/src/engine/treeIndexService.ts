/**
 * ApplianceCare AI – Data-Driven Tree Index Service
 *
 * Dynamically indexes diagnostic trees and declarative symptom definitions.
 * Eliminates all hardcoded symptom regex arrays, bespoke topic checks,
 * and static catalog definitions from TypeScript source code.
 */

import { getAllTrees, getTree } from '../data/store';
import symptomRegistryData from '../data/symptomRegistry.json';

export interface DiagnosticTargetMatch {
  targetId: string; // e.g. "AC02.q6_mcb_retrip_check" or "AC04"
  canonicalIssueId: string; // e.g. "AC02" or "AC04"
  targetNodeId?: string; // e.g. "q6_mcb_retrip_check"
  displayTopic: string; // e.g. "MCB Tripping" or "Indoor Water Leakage"
  confidence: number;
  safetyAlert: boolean;
  rationale: string;
}

export interface TreeCatalogItem {
  id: string;
  title: string;
}

interface CompiledSymptomTrigger {
  id: string;
  targetTreeId: string;
  displayTopic: string;
  pattern: RegExp;
  negationPattern?: RegExp;
  safetyAlert: boolean;
}

class TreeIndexService {
  private compiledTriggers: CompiledSymptomTrigger[] = [];
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (this.isInitialized) return;

    const symptoms = (symptomRegistryData as any).symptoms || [];
    this.compiledTriggers = symptoms.map((s: any) => ({
      id: s.id,
      targetTreeId: s.targetTreeId,
      displayTopic: s.displayTopic || s.canonicalName,
      pattern: new RegExp(s.pattern, 'i'),
      negationPattern: s.negationPattern ? new RegExp(s.negationPattern, 'i') : undefined,
      safetyAlert: Boolean(s.safetyAlert),
    }));

    this.isInitialized = true;
  }

  /**
   * Matches natural language user symptoms against the declarative index.
   */
  public findTargetForSymptom(text: string, _appliance?: string): DiagnosticTargetMatch | null {
    if (!text || !text.trim()) return null;
    const raw = text.trim();

    for (const trigger of this.compiledTriggers) {
      if (trigger.pattern.test(raw)) {
        // Evaluate negation guard if present (e.g. "not making noise", "no leak")
        if (trigger.negationPattern && trigger.negationPattern.test(raw)) {
          continue;
        }

        const [canonicalIssueId, targetNodeId] = trigger.targetTreeId.includes('.')
          ? trigger.targetTreeId.split('.')
          : [trigger.targetTreeId, undefined];

        return {
          targetId: trigger.targetTreeId,
          canonicalIssueId,
          targetNodeId,
          displayTopic: trigger.displayTopic,
          confidence: 0.88,
          safetyAlert: trigger.safetyAlert,
          rationale: `Natural language symptoms matched to ${trigger.displayTopic} (${trigger.targetTreeId}).`,
        };
      }
    }

    return null;
  }

  /**
   * Resolves the human-readable topic name dynamically for any target ID.
   * Completely replaces bespoke conditionals like `isMcb`.
   */
  public getTopicTitle(targetId: string, _language?: string): string {
    if (!targetId) return '';

    // 1. Direct match in declarative symptom registry
    const matchedSymptom = this.compiledTriggers.find((t) => t.targetTreeId === targetId);
    if (matchedSymptom) {
      return matchedSymptom.displayTopic;
    }

    // 2. Dotted node resolution (e.g. AC02.q6_mcb_retrip_check)
    if (targetId.includes('.')) {
      const [issueId, nodeId] = targetId.split('.');
      const tree = getTree(issueId);
      if (tree) {
        const node = tree.nodes.find((n) => n.id === nodeId);
        if (node) {
          return node.text_en || tree.title;
        }
        return tree.title;
      }
    }

    // 3. Tree title resolution
    const tree = getTree(targetId);
    if (tree && tree.title) {
      return tree.title;
    }

    return targetId;
  }

  /**
   * Dynamically retrieves the catalog of loaded trees for LLM tool definitions.
   */
  public getCatalog(_appliance?: string): TreeCatalogItem[] {
    const trees = getAllTrees();
    const catalog: TreeCatalogItem[] = [];

    trees.forEach((tree) => {
      catalog.push({
        id: tree.issue_id,
        title: tree.title,
      });
    });

    return catalog;
  }

  /**
   * Verifies if a given issue ID exists in the loaded diagnostic trees.
   */
  public hasTree(issueId: string): boolean {
    if (!issueId) return false;
    return Boolean(getTree(issueId));
  }
}

export const treeIndexService = new TreeIndexService();

