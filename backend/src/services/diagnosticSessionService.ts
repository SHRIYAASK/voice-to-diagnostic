/**
 * Diagnostic Session Service — ApplianceCare AI
 *
 * Dedicated service layer managing chat and diagnostic session orchestration.
 * Wraps tree initialization, node progression, and session persistence.
 */

import { chatService, ChatSession, ChatMessage } from '../engine/chatService';
import { startSession, nextStep, backStep, getSessionHistory, Session } from '../engine/diagnostic';
import { ConversationUnderstanding } from './conversationUnderstanding';

export interface ProcessTurnInput {
  text?: string;
  optionIndex?: number;
  issueId?: string;
  specialAction?: string;
  language?: string;
  understanding?: ConversationUnderstanding;
}

export const diagnosticSessionService = {
  /**
   * Initializes or fetches an existing chat session.
   */
  getOrCreateSession(sessionId?: string, model?: string, appliance?: string, language?: 'en' | 'hi' | 'ta'): ChatSession {
    return chatService.getOrCreateSession(sessionId, model, appliance, language);
  },

  /**
   * Starts a diagnostic tree flow within an existing session.
   */
  startTree(sessionId: string, issueId: string) {
    return chatService.startTreeInChat(sessionId, issueId);
  },

  /**
   * Processes a turn (text or selection) through chat & diagnostic engine.
   */
  async processTurn(
    sessionId: string,
    input: ProcessTurnInput
  ): Promise<{ session: ChatSession; botMessages: ChatMessage[] }> {
    return chatService.processMessage(sessionId, input);
  },

  /**
   * Resets a diagnostic chat session.
   */
  resetSession(sessionId: string): ChatSession {
    return chatService.resetSession(sessionId);
  },

  /**
   * Direct diagnostic tree session start (pure decision tree graph).
   */
  startDiagnosticTree(issueId: string, startNodeId?: string) {
    return startSession(issueId, startNodeId);
  },

  /**
   * Advances the pure decision tree session.
   */
  advanceDiagnosticStep(diagnosticSessionId: string, optionIndex: number) {
    return nextStep(diagnosticSessionId, optionIndex);
  },

  /**
   * Reverts to the previous step in pure decision tree session.
   */
  revertDiagnosticStep(diagnosticSessionId: string) {
    return backStep(diagnosticSessionId);
  },

  /**
   * Gets session history.
   */
  getDiagnosticHistory(diagnosticSessionId: string): { issueId: string; history: any[]; currentNodeId: string } | null {
    return getSessionHistory(diagnosticSessionId);
  },
};
