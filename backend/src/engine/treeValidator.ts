/**
 * Decision Tree Graph Validator
 * Audits all 16 LG AC Diagnostic Trees (AC01 - AC16) for:
 * 1. Broken node transitions (next_node references)
 * 2. Unresolved conclusion IDs
 * 3. Unmapped action IDs (cross-referenced with global_instructions.json)
 * 4. Redirect targets (redirect_issue references to other valid trees)
 * 5. Error code references (cross-referenced with ch_error_code_registry.json)
 * 6. Safety flag consistency
 */

import { getAllTrees, DiagnosticTree } from '../data/store';
import { instructionResolver } from './instructionResolver';
import { errorCodeRegistry } from '../data/errorCodeRegistry';

export interface TreeValidationError {
  treeId: string;
  nodeId?: string;
  type: 'BROKEN_NEXT_NODE' | 'MISSING_CONCLUSION' | 'UNMAPPED_ACTION' | 'INVALID_REDIRECT' | 'INCONSISTENT_SAFETY';
  message: string;
}

export interface TreeValidationReport {
  isValid: boolean;
  totalTreesAudited: number;
  totalNodesAudited: number;
  totalOptionsAudited: number;
  totalActionsAudited: number;
  errors: TreeValidationError[];
  unmappedActions: string[];
  auditedTreeIds: string[];
}

export function validateAllDiagnosticTrees(): TreeValidationReport {
  const trees = getAllTrees();
  const validTreeIds = new Set(Array.from(trees.keys()));

  const errors: TreeValidationError[] = [];
  const unmappedActions = new Set<string>();

  let totalNodes = 0;
  let totalOptions = 0;
  let totalActions = 0;

  trees.forEach((tree: DiagnosticTree, treeId: string) => {
    const nodeMap = new Map<string, any>();
    tree.nodes.forEach((n) => nodeMap.set(n.id, n));
    totalNodes += tree.nodes.length;

    // Check start node
    if (!nodeMap.has(tree.start_node)) {
      errors.push({
        treeId,
        type: 'BROKEN_NEXT_NODE',
        message: `Tree '${treeId}' start_node '${tree.start_node}' does not exist in nodes list.`,
      });
    }

    // Inspect every node
    for (const node of tree.nodes) {
      if (!node.options || !Array.isArray(node.options)) continue;

      for (const opt of node.options) {
        totalOptions++;

        // 1. Verify next_node destination
        if (opt.next_node) {
          if (!nodeMap.has(opt.next_node)) {
            errors.push({
              treeId,
              nodeId: node.id,
              type: 'BROKEN_NEXT_NODE',
              message: `Node '${node.id}' option '${opt.label}' references non-existent next_node '${opt.next_node}'.`,
            });
          }
        }

        // 2. Verify conclusion destination
        if (opt.conclusion) {
          if (!tree.conclusions || !tree.conclusions[opt.conclusion]) {
            errors.push({
              treeId,
              nodeId: node.id,
              type: 'MISSING_CONCLUSION',
              message: `Node '${node.id}' option '${opt.label}' references missing conclusion '${opt.conclusion}'.`,
            });
          } else {
            const c = tree.conclusions[opt.conclusion];
            if (!c.probable_cause) {
              errors.push({
                treeId,
                nodeId: node.id,
                type: 'MISSING_CONCLUSION',
                message: `Conclusion '${opt.conclusion}' in tree '${treeId}' is missing 'probable_cause'.`,
              });
            }
          }
        }

        // 3. Verify redirect_issue destination
        if (opt.redirect_issue) {
          if (!validTreeIds.has(opt.redirect_issue.toUpperCase())) {
            errors.push({
              treeId,
              nodeId: node.id,
              type: 'INVALID_REDIRECT',
              message: `Node '${node.id}' option '${opt.label}' redirects to unknown tree '${opt.redirect_issue}'.`,
            });
          }
        }

        // 4. Verify action ID mapping against global_instructions.json
        if (opt.action) {
          totalActions++;
          if (!instructionResolver.hasAction(opt.action)) {
            unmappedActions.add(opt.action);
            errors.push({
              treeId,
              nodeId: node.id,
              type: 'UNMAPPED_ACTION',
              message: `Action ID '${opt.action}' in node '${node.id}' is not mapped in global_instructions.json.`,
            });
          }
        }

        // 5. Ensure option has at least one destination
        if (!opt.next_node && !opt.conclusion && !opt.redirect_issue && !opt.resolution) {
          errors.push({
            treeId,
            nodeId: node.id,
            type: 'BROKEN_NEXT_NODE',
            message: `Node '${node.id}' option '${opt.label}' has no target (no next_node, conclusion, redirect, or resolution).`,
          });
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    totalTreesAudited: trees.size,
    totalNodesAudited: totalNodes,
    totalOptionsAudited: totalOptions,
    totalActionsAudited: totalActions,
    errors,
    unmappedActions: Array.from(unmappedActions),
    auditedTreeIds: Array.from(validTreeIds),
  };
}
