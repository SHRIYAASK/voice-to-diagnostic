/**
 * Diagnostic Engine
 * Traverses the decision-tree graph using server-validated state.
 * Clients supply a sessionId + selected option index; the server
 * maintains the full path and resolves the next step.
 */

import { v4 as uuid } from 'uuid';
import { getTree, DiagnosticTree, DiagnosticNode, ConclusionRecord } from '../data/store';

// ── Types ────────────────────────────────────────────────────────────────────

export type StepKind = 'question' | 'instruction' | 'conclusion' | 'resolution' | 'redirect';

export interface DiagnosticStep {
  nodeId: string;
  kind: StepKind;
  questionTextEn?: string;
  questionTextHi?: string;
  options?: Array<{ label: string; index: number }>;
  instruction?: string;
  conclusion?: ConclusionRecord;
  resolutionId?: string;
  redirectIssue?: string;
  safetyFlag?: boolean;
  conclusionId?: string;
}

export interface HistoryEntry {
  nodeId: string;
  optionIndex: number;
  optionLabel: string;
}

export interface Session {
  id: string;
  issueId: string;
  currentNodeId: string;
  history: HistoryEntry[];
  createdAt: string;
  tree: DiagnosticTree;
}

// In-memory session store (use Redis/DB for production)
const sessions = new Map<string, Session>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildStep(tree: DiagnosticTree, node: DiagnosticNode): DiagnosticStep {
  return {
    nodeId: node.id,
    kind: 'question',
    questionTextEn: node.text_en,
    questionTextHi: node.text_hi,
    options: node.options.map((opt, i) => ({ label: opt.label, index: i })),
  };
}

function resolveConclusion(tree: DiagnosticTree, conclusionId: string): DiagnosticStep {
  const c = tree.conclusions[conclusionId];
  return {
    nodeId: conclusionId,
    kind: 'conclusion',
    safetyFlag: c?.safety_flag ?? false,
    conclusionId,
    conclusion: c,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function startSession(issueId: string, startNodeId?: string): { sessionId: string; step: DiagnosticStep } | { error: string } {
  const tree = getTree(issueId);
  if (!tree) return { error: `No diagnostic tree found for issue "${issueId}"` };

  const targetNodeId = startNodeId && tree.nodes.some(n => n.id === startNodeId) ? startNodeId : tree.start_node;
  const startNode = tree.nodes.find(n => n.id === targetNodeId);
  if (!startNode) return { error: `Start node "${targetNodeId}" not found in tree` };

  const session: Session = {
    id: uuid(),
    issueId,
    currentNodeId: targetNodeId,
    history: [],
    createdAt: new Date().toISOString(),
    tree,
  };
  sessions.set(session.id, session);

  return { sessionId: session.id, step: buildStep(tree, startNode) };
}

export function nextStep(
  sessionId: string,
  optionIndex: number
): DiagnosticStep | { error: string } {
  const session = sessions.get(sessionId);
  if (!session) return { error: 'Session not found. Please restart the diagnostic.' };

  const { tree } = session;
  const node = tree.nodes.find(n => n.id === session.currentNodeId);
  if (!node) return { error: `Current node "${session.currentNodeId}" not found.` };

  const option = node.options[optionIndex];
  if (!option) return { error: `Option index ${optionIndex} out of range.` };

  session.history.push({
    nodeId: node.id,
    optionIndex,
    optionLabel: option.label,
  });

  // Redirect to another tree
  if (option.redirect_issue) {
    return {
      nodeId: option.redirect_issue,
      kind: 'redirect',
      redirectIssue: option.redirect_issue,
    };
  }

  // Resolution (self-fix)
  if (option.resolution) {
    return {
      nodeId: option.resolution,
      kind: 'resolution',
      resolutionId: option.resolution,
    };
  }

  // Terminal conclusion
  if (option.conclusion) {
    return resolveConclusion(tree, option.conclusion);
  }

  // Action + continue to next node
  if (option.next_node) {
    const nextNode = tree.nodes.find(n => n.id === option.next_node);
    if (!nextNode) {
      return { error: `Next node "${option.next_node}" not found. Please restart.` };
    }
    session.currentNodeId = nextNode.id;

    // If option also has an action, prepend instruction step
    if (option.action) {
      return {
        nodeId: nextNode.id,
        kind: 'instruction',
        instruction: option.action,
        questionTextEn: nextNode.text_en,
        questionTextHi: nextNode.text_hi,
        options: nextNode.options.map((o, i) => ({ label: o.label, index: i })),
      };
    }

    return buildStep(tree, nextNode);
  }

  return { error: 'This option has no valid destination. Please restart.' };
}

export function backStep(sessionId: string): DiagnosticStep | { error: string } {
  const session = sessions.get(sessionId);
  if (!session) return { error: 'Session not found.' };

  if (session.history.length === 0) return { error: 'Already at the first question.' };

  const { tree } = session;
  session.history.pop();

  const prevNodeId = session.history.length > 0
    ? session.history[session.history.length - 1].nodeId
    : tree.start_node;

  const prevNode = tree.nodes.find(n => n.id === prevNodeId) ||
    tree.nodes.find(n => n.id === tree.start_node);

  if (!prevNode) return { error: 'Cannot navigate back.' };
  session.currentNodeId = prevNode.id;
  return buildStep(tree, prevNode);
}

export function getSessionHistory(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return {
    issueId: session.issueId,
    history: session.history,
    currentNodeId: session.currentNodeId,
  };
}
