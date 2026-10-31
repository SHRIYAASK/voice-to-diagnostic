/**
 * Conversational Chat Diagnostic Service
 * Handles multi-turn chat sessions with Deterministic Routing,
 * Exact Error Code Registry, Global Instruction Resolver,
 * and Authoritative Decision Tree Navigation.
 * (English Only)
 */

import { v4 as uuid } from 'uuid';
import { getTree, getAllTrees, DiagnosticTree, DiagnosticNode, ConclusionRecord } from '../data/store';
import { startSession, nextStep, backStep, DiagnosticStep } from './diagnostic';
import { deterministicRouter, RouteResolution } from './deterministicRouter';
import { errorCodeRegistry } from '../data/errorCodeRegistry';
import { instructionResolver } from './instructionResolver';
import { normalizeAcIssueId, normalizeChErrorCode } from './namespaceNormalizer';
import { StructuredEvidence, createEmptyEvidence } from './evidence';
import { groqService } from './groqService';
import { diagnosticAgent } from './diagnosticAgent';

export interface BookingContextPayload {
  symptom?: string;
  probable_cause?: string;
  parts?: string[];
  priority?: string;
  error_code?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  timestamp: string;
  action?: 'NAV_BOOKING';
  bookingContext?: BookingContextPayload;
  chips?: Array<{
    label: string;
    value: string;
    optionIndex?: number;
    issueId?: string;
  }>;
  instruction?: string;
  instructionDetails?: {
    id: string;
    text: string;
    steps?: string[];
  };
  conclusion?: ConclusionRecord;
  resolutionId?: string;
  safetyAlert?: boolean;
  isResolution?: boolean;
  stepInfo?: {
    issueId: string;
    nodeId: string;
    progress?: number;
  };
  evidence?: StructuredEvidence;
}

export interface ChatSession {
  sessionId: string;
  diagnosticSessionId?: string;
  issueId?: string;
  currentNodeId?: string;
  language?: 'en' | 'hi' | 'ta';
  model: string;
  appliance: string;
  messages: ChatMessage[];
  createdAt: string;
  isCompleted: boolean;
  pendingConfirmation?: {
    type: 'node_option' | 'symptom_tree';
    targetId: string;
    optionIndex?: number;
    prompt?: string;
  };
}

// In-memory chat sessions map
const chatSessions = new Map<string, ChatSession>();

// In-memory localized translation cache to avoid redundant LLM latency
const nodeTranslationCache = new Map<string, string>();

async function getLocalizedText(text: string, lang: 'en' | 'hi' | 'ta'): Promise<string> {
  if (lang === 'en' || !text) return text;
  const key = `${lang}:${text}`;
  if (nodeTranslationCache.has(key)) return nodeTranslationCache.get(key)!;
  const localized = await groqService.localizeText(text, lang);
  nodeTranslationCache.set(key, localized);
  return localized;
}

// Starter issue quick chips for new conversations (English Only)
const STARTER_CHIPS = [
  { label: '❄️ Not Cooling / Room Warm', value: 'AC01', issueId: 'AC01' },
  { label: '⚡ Will Not Turn On', value: 'AC02', issueId: 'AC02' },
  { label: '⚠️ MCB Tripping', value: 'AC03', issueId: 'AC03' },
  { label: '💧 Water Dripping / Leak', value: 'AC04', issueId: 'AC04' },
  { label: '💨 Foul or Burning Smell', value: 'AC05', issueId: 'AC05' },
  { label: '🔊 Loud / Rattling Noise', value: 'AC06', issueId: 'AC06' },
  { label: '📟 Error Code On Display', value: 'ERROR_CODE' },
  { label: '🔄 Remote Not Responding', value: 'AC08', issueId: 'AC08' },
];

/**
 * Creates a welcome message for a given appliance & model
 */
function createWelcomeMessage(model: string, language: 'en' | 'hi' | 'ta' = 'en'): ChatMessage {
  let text = `Hello! 👋 I'm your ApplianceCare AI Diagnostic Assistant for your LG Dual Inverter Air Conditioner (${model}).\n\nYou can describe your symptom (e.g., *"AC is not cooling"*, *"water leaking"*, *"CH 05 on display"*), or pick a quick suggestion below.`;

  if (language === 'ta') {
    text = `வணக்கம்! 👋 உங்கள் LG Dual Inverter Air Conditioner (${model}) Diagnostic Assistant-ஆக நான் உதவுகிறேன்.\n\nஉங்கள் AC-ல் என்ன பிரச்சனை-ன்னு சொல்லுங்க (உதாரணமாக: *"AC cooling வரல"*, *"indoor unit-ல தண்ணி leak ஆகுது"*, *"display-ல CH 05 வருது"*), அல்லது கீழே உள்ளவற்றை தேர்ந்தெடுக்கலாம்.`;
  } else if (language === 'hi') {
    text = `नमस्ते! 👋 मैं आपके LG Dual Inverter Air Conditioner (${model}) के लिए Diagnostic Assistant हूँ।\n\nआप अपनी समस्या बता सकते हैं (जैसे: *"AC ठंडा नहीं कर रहा"*, *"पानी टपक रहा है"*, *"display पर CH 05 है"*), या नीचे दिए विकल्पों में से चुनें।`;
  }

  return {
    id: uuid(),
    sender: 'bot',
    text,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Converts a DiagnosticStep into one or more ChatMessages
 */
function convertStepToChatMessage(
  step: DiagnosticStep,
  tree: DiagnosticTree
): ChatMessage {
  if (step.kind === 'resolution') {
    return {
      id: uuid(),
      sender: 'bot',
      text: `🎉 **Issue Successfully Resolved!**\n\nBased on your observations, normal operational state has been restored. No technician visit is required.\n\n**Resolution Code:** \`${step.resolutionId || 'RES-OK'}\`\n*Tip:* Clean the air filters every 15 days to maintain peak efficiency.`,
      timestamp: new Date().toISOString(),
      isResolution: true,
      resolutionId: step.resolutionId,
      chips: [
        { label: '🔄 Start New Diagnostic', value: 'RESTART' },
      ],
    };
  }

  if (step.kind === 'conclusion') {
    const c = step.conclusion;
    const isSafety = Boolean(step.safetyFlag || (c && c.safety_flag));
    const partsList = c?.parts && c.parts.length > 0 ? c.parts.join(', ') : '';

    let textEn = `📋 **Diagnostic Conclusion**\n\n`;
    textEn += `**Probable Cause:** ${c?.probable_cause || 'Component malfunction detected.'}\n\n`;
    if (c?.priority) {
      textEn += `**Priority:** ${c.priority}\n\n`;
    }
    if (partsList) {
      textEn += `**Recommended OEM Replacement Parts:** ${partsList}\n\n`;
    }
    if (isSafety) {
      textEn += `⚠️ **Safety Precaution:** High voltage or pressurized refrigerant hazard. Professional technician servicing is strongly advised.\n`;
    }

    const evidence = createEmptyEvidence('SYMPTOM_TROUBLESHOOTING', {
      appliance: 'air-conditioner',
      selectedPath: `TREE_${tree.issue_id}_${step.nodeId}`,
    });
    evidence.activeNodeId = step.nodeId;
    evidence.conclusionId = step.conclusionId;
    evidence.safetyConstraints.safetyAlert = isSafety;
    evidence.evidenceItems.push({
      sourceId: `diagnostic_tree_${tree.issue_id.toLowerCase()}.json`,
      documentType: 'decision_tree',
      verificationStatus: 'verified',
      contentSnippet: c?.probable_cause || 'Diagnostic Tree Conclusion',
    });

    return {
      id: uuid(),
      sender: 'bot',
      text: textEn,
      timestamp: new Date().toISOString(),
      safetyAlert: isSafety,
      conclusion: c,
      chips: [
        { label: '📅 Book Technician Visit', value: 'BOOK_TECH' },
        { label: '🔄 Start New Diagnostic', value: 'RESTART' },
      ],
      evidence,
    };
  }

  if (step.kind === 'redirect') {
    const targetId = normalizeAcIssueId(step.redirectIssue || '') || step.redirectIssue || '';
    const targetTree = getTree(targetId);
    return {
      id: uuid(),
      sender: 'bot',
      text: `Transitioning to diagnostic tree for **${targetTree?.title || targetId}**:`,
      timestamp: new Date().toISOString(),
      chips: [],
    };
  }

  // Resolve action instruction details if present
  let instructionDetails;
  if (step.instruction) {
    const resolved = instructionResolver.resolve(step.instruction);
    if (resolved.found && resolved.instruction) {
      instructionDetails = {
        id: resolved.instruction.id,
        text: resolved.instruction.text,
        steps: resolved.instruction.steps,
      };
    }
  }

  // Question or Instruction Node: Keep voice-driven, no buttons under query questions
  let questionEn = step.questionTextEn || '';
  if (instructionDetails) {
    questionEn = `📋 **Step Action:** ${instructionDetails.text}\n\n${questionEn || 'Please observe the result:'}`;
  } else if (!questionEn) {
    questionEn = 'Please observe the symptoms:';
  }

  if ((step.options || []).length > 2 && !questionEn.includes('(') && !questionEn.includes('e.g.')) {
    const examples = (step.options || [])
      .slice(0, 3)
      .map((o) => o.label.toLowerCase().replace(/\s*\(.*\)/, ''))
      .join(', ');
    questionEn = `${questionEn} (e.g. ${examples})`;
  }

  const chips: Array<{ label: string; value: string; optionIndex?: number }> = [];

    const stepEvidence = createEmptyEvidence('SYMPTOM_TROUBLESHOOTING', {
      appliance: 'air-conditioner',
      selectedPath: `TREE_${tree.issue_id}_${step.nodeId}`,
    });
    stepEvidence.activeNodeId = step.nodeId;
    stepEvidence.evidenceItems.push({
      sourceId: `diagnostic_tree_${tree.issue_id.toLowerCase()}.json`,
      documentType: 'decision_tree',
      verificationStatus: 'verified',
      contentSnippet: questionEn,
    });

    return {
      id: uuid(),
      sender: 'bot',
      text: questionEn,
      timestamp: new Date().toISOString(),
      instruction: step.instruction,
      instructionDetails,
      chips: chips,
      stepInfo: {
        issueId: tree.issue_id,
        nodeId: step.nodeId,
      },
      evidence: stepEvidence,
    };
}

/**
 * Checks for critical safety hazard keywords in natural language text
 */
function detectSafetyHazard(text: string): boolean {
  const hazards = [
    'smoke', 'fire', 'burning', 'spark', 'shock', 'shocks', 'current',
    'sparks', 'sparking', 'blast', 'electric shock', 'short circuit'
  ];
  const lower = text.toLowerCase();
  if (hazards.some((h) => lower.includes(h))) return true;

  // Water near electrical components (SP04)
  if (/\bwater\b[\s\S]*\b(socket|plug|outlet|switch|breaker|electrical)\b/i.test(lower)) return true;
  // Damaged outdoor/indoor wires (SP07)
  if (/\b(damaged|exposed|bare|chewed|cut)\s+wires?\b/i.test(lower)) return true;
  // Live panel opening or board touching (BP12, SP10)
  if (/\b(open|opened|touch|see|remove|ignore.*safety)\b[\s\S]*\b(live|panel|circuit board|pcb|capacitors?)\b/i.test(lower)) return true;
  // DIY refrigerant refilling (SP08)
  if (/\b(refill|charge|top up)\b[\s\S]*\b(gas|refrigerant|freon)\b/i.test(lower)) return true;

  return false;
}

function buildEscalateToBookingMessage(
  session: ChatSession,
  conversationalReply: string,
  reason?: string
): ChatMessage {
  const lastConclusion = [...session.messages].reverse().find(m => m.conclusion)?.conclusion;
  return {
    id: uuid(),
    sender: 'bot',
    text: `${conversationalReply}\n\nOpening Service Booking form with your diagnostic findings attached. You can pick an LG certified technician and time slot.`,
    timestamp: new Date().toISOString(),
    action: 'NAV_BOOKING',
    bookingContext: {
      symptom: session.appliance ? `${session.appliance} - Service Request` : 'Diagnostic Service Request',
      probable_cause: lastConclusion?.probable_cause || reason || 'Diagnostic issue detected',
      parts: lastConclusion?.parts || [],
      priority: lastConclusion?.priority || 'High',
    },
    chips: [
      { label: '📅 Open Service Booking', value: 'NAV_BOOKING' }
    ]
  };
}

export const chatService = {
  /**
   * Initializes or gets an existing chat session
   */
  getOrCreateSession: (
    sessionId?: string,
    model: string = 'UW-Q18WUZA',
    rawLanguage: string = 'en',
    appliance: string = 'air-conditioner'
  ): ChatSession => {
    const shortLang: 'en' | 'hi' | 'ta' = rawLanguage.startsWith('ta') ? 'ta' : rawLanguage.startsWith('hi') ? 'hi' : 'en';

    if (sessionId && chatSessions.has(sessionId)) {
      const existing = chatSessions.get(sessionId)!;
      if (existing && shortLang !== existing.language) {
        existing.language = shortLang;
      }
      return existing;
    }

    const newId = sessionId || uuid();
    const welcome = createWelcomeMessage(model, shortLang);

    const newSession: ChatSession = {
      sessionId: newId,
      model,
      language: shortLang,
      appliance,
      messages: [welcome],
      createdAt: new Date().toISOString(),
      isCompleted: false,
    };

    chatSessions.set(newId, newSession);
    return newSession;
  },

  /**
   * Resets a session to fresh welcome state
   */
  resetSession: (sessionId: string): ChatSession => {
    const sess = chatSessions.get(sessionId);
    const model = sess?.model || 'UW-Q18WUZA';
    const appliance = sess?.appliance || 'air-conditioner';
    const lang = sess?.language || 'en';

    const welcome = createWelcomeMessage(model, lang);
    const newSession: ChatSession = {
      sessionId,
      model,
      language: lang,
      appliance,
      messages: [welcome],
      createdAt: new Date().toISOString(),
      isCompleted: false,
    };
    chatSessions.set(sessionId, newSession);
    return newSession;
  },

  /**
   * Starts a diagnostic tree inside an existing chat session
   */
  startTreeInChat: (
    sessionId: string,
    issueId: string
  ): { session: ChatSession; stepMessage: ChatMessage } => {
    const session = chatSessions.get(sessionId);
    if (!session) throw new Error('Chat session not found');

    const [rawTreeId, targetNodeId] = issueId.includes('.') ? issueId.split('.') : [issueId, undefined];
    const canonicalTreeId = normalizeAcIssueId(rawTreeId) || rawTreeId.toUpperCase();
    const tree = getTree(canonicalTreeId);
    if (!tree) throw new Error(`Diagnostic tree ${canonicalTreeId} not found`);

    // Start backend tree session with optional starting node
    const diag = startSession(canonicalTreeId, targetNodeId);
    if ('error' in diag) throw new Error(diag.error);

    session.diagnosticSessionId = diag.sessionId;
    session.issueId = canonicalTreeId;
    session.currentNodeId = diag.step.nodeId;
    session.isCompleted = false;

    // Acknowledge transition
    const ackMessage: ChatMessage = {
      id: uuid(),
      sender: 'bot',
      text: `Starting diagnosis for **${tree.issue_id}: ${tree.title}**. Let's investigate step by step:`,
      timestamp: new Date().toISOString(),
    };
    session.messages.push(ackMessage);

    const stepMsg = convertStepToChatMessage(diag.step, tree);
    session.messages.push(stepMsg);

    return { session, stepMessage: stepMsg };
  },

  /**
   * Processes an incoming message (free text or option chip click)
   */
  processMessage: async (
    sessionId: string,
    input: {
      text?: string;
      optionIndex?: number;
      issueId?: string;
      specialAction?: string;
      language?: string;
    }
  ): Promise<{ session: ChatSession; botMessages: ChatMessage[] }> => {
    const session = chatSessions.get(sessionId);
    if (!session) throw new Error('Chat session not found');

    if (input.language) {
      const parsedLang: 'en' | 'hi' | 'ta' = input.language.startsWith('ta') ? 'ta' : input.language.startsWith('hi') ? 'hi' : 'en';
      session.language = parsedLang;
    }

    const botMessages: ChatMessage[] = [];
    const text = (input.text || '').trim();

    // 1. Record user's message in chat history
    if (text) {
      session.messages.push({
        id: uuid(),
        sender: 'user',
        text: text,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Handle Pending User Confirmation (e.g. from previous ambiguous query or option reconfirmation)
    if (session.pendingConfirmation && text) {
      const lower = text.toLowerCase().trim();
      const isAffirmative =
        /\b(yes|yeah|yup|y|correct|right|that's right|confirm|confirmed|sure)\b/i.test(lower) ||
        input.specialAction?.startsWith('CONFIRM_') ||
        Boolean(input.optionIndex !== undefined && session.pendingConfirmation.optionIndex === input.optionIndex);
      const isNegative = /\b(no|nope|nah|n|wrong|incorrect|not that|cancel)\b/i.test(lower);

      const pending = session.pendingConfirmation;

      if (isAffirmative) {
        session.pendingConfirmation = undefined;
        if (pending.type === 'node_option' && pending.optionIndex !== undefined && session.diagnosticSessionId && session.issueId) {
          const tree = getTree(session.issueId);
          if (tree) {
            const next = nextStep(session.diagnosticSessionId, pending.optionIndex);
            if (!('error' in next)) {
              session.currentNodeId = next.nodeId;
              if (next.kind === 'conclusion' || next.kind === 'resolution') {
                session.isCompleted = true;
              }
              const stepMsg = convertStepToChatMessage(next, tree);
              session.messages.push(stepMsg);
              botMessages.push(stepMsg);
              return { session, botMessages };
            }
          }
        } else if (pending.type === 'symptom_tree' && pending.targetId) {
          const res = chatService.startTreeInChat(sessionId, pending.targetId);
          return { session: res.session, botMessages: [res.stepMessage] };
        }
      } else if (isNegative) {
        session.pendingConfirmation = undefined;
        if (pending.type === 'node_option' && session.issueId && session.currentNodeId) {
          const tree = getTree(session.issueId);
          const currentNode = tree?.nodes.find((n) => n.id === session.currentNodeId);
          if (currentNode) {
            const chips = (currentNode.options || []).map((opt, i) => ({
              label: opt.label,
              value: `OPTION_${i}`,
              optionIndex: i,
            }));
            const declineMsg: ChatMessage = {
              id: uuid(),
              sender: 'bot',
              text: `Understood. Please select the option that best describes what you observe:`,
              timestamp: new Date().toISOString(),
              chips,
            };
            session.messages.push(declineMsg);
            botMessages.push(declineMsg);
            return { session, botMessages };
          }
        }
      }
      session.pendingConfirmation = undefined;
    }

    // 3. Handle Special Action Chips
    if (input.specialAction === 'RESTART' || text.toLowerCase() === 'restart' || text.toLowerCase() === 'reset') {
      const reset = chatService.resetSession(sessionId);
      return { session: reset, botMessages: [reset.messages[0]] };
    }

    const lastBotMessage = session.messages.filter(m => m.sender === 'bot').slice(-1)[0];
    const hasStartDiagChip = lastBotMessage?.chips?.some(c => c.value === 'START_ERROR_DIAG' || c.issueId);
    const startChip = lastBotMessage?.chips?.find(c => c.value === 'START_ERROR_DIAG');

    if (
      input.specialAction === 'BOOK_TECH' ||
      input.specialAction === 'NAV_BOOKING' ||
      /\b(book\s+(a\s+)?(technician|service|appointment|repair|tech)|schedule\s+(a\s+)?(service|technician|appointment|visit|repair)|technician\s+visit)\b/i.test(text) ||
      (hasStartDiagChip && /\b(book|service|technician|2|second|option 2)\b/i.test(text))
    ) {
      const agentAction = await diagnosticAgent.processTurn(text || 'schedule service', {
        model: session.model,
        appliance: session.appliance,
        language: session.language,
        recentHistory: session.messages.map((m) => ({ sender: m.sender as 'user' | 'bot', text: m.text })),
      });

      const reply = agentAction.type === 'escalate_to_booking'
        ? agentAction.conversationalReply
        : 'Certainly, opening the technician booking form with your diagnostic findings attached.';

      const bookMsg = buildEscalateToBookingMessage(session, reply, agentAction.type === 'escalate_to_booking' ? agentAction.reason : undefined);
      session.messages.push(bookMsg);
      botMessages.push(bookMsg);
      return { session, botMessages };
    }

    // 3b. Handle Starting Guided Diagnosis from Chip Click or User Typed Response
    if (
      input.specialAction === 'START_ERROR_DIAG' ||
      (text && (
        /\b(start guided|guided error|guided diag|diagnos|troubleshoot|guide me|check this|proceed)\b/i.test(text) ||
        (hasStartDiagChip && /\b(start|yes|yeah|sure|ok|okay|1|first|option 1)\b/i.test(text))
      ))
    ) {
      const targetIssueId = input.issueId || startChip?.issueId || 'AC03';
      const res = chatService.startTreeInChat(sessionId, targetIssueId);
      return { session: res.session, botMessages: [res.stepMessage] };
    }

    // 4. Critical Safety Hazard Check
    if (text && detectSafetyHazard(text)) {
      const safetyMsg: ChatMessage = {
        id: uuid(),
        sender: 'bot',
        text: `🚨 **CRITICAL SAFETY WARNING: HAZARD DETECTED**\n\n1. **Immediately turn OFF the main MCB / electrical breaker** supplying power to your AC.\n2. **DO NOT** touch the indoor or outdoor unit.\n3. **DO NOT** attempt DIY repairs.\n\nA certified HVAC technician must inspect the electrical wiring and compressor before powering on again.`,
        timestamp: new Date().toISOString(),
        safetyAlert: true,
        chips: [
          { label: '🚨 Book Emergency Technician', value: 'BOOK_TECH' },
          { label: '🔄 Restart', value: 'RESTART' }
        ]
      };
      session.messages.push(safetyMsg);
      botMessages.push(safetyMsg);
      return { session, botMessages };
    }

    // 5. If issueId is passed directly (e.g. from clicking a starter chip)
    if (input.issueId) {
      const res = chatService.startTreeInChat(sessionId, input.issueId);
      return { session: res.session, botMessages: [res.stepMessage] };
    }

    // 6. Post-Completion Guard
    // If the diagnostic already reached a conclusion/resolution, handle booking/scheduling via LLM tool call
    if (session.isCompleted) {
      if (
        input.specialAction === 'BOOK_TECH' ||
        input.specialAction === 'NAV_BOOKING' ||
        /\b(book|schedule|technician|service|visit|repair|appointment)\b/i.test(text)
      ) {
        const agentAction = await diagnosticAgent.processTurn(text || 'schedule service', {
          model: session.model,
          appliance: session.appliance,
          language: session.language,
          recentHistory: session.messages.map((m) => ({ sender: m.sender as 'user' | 'bot', text: m.text })),
        });

        const reply = agentAction.type === 'escalate_to_booking'
          ? agentAction.conversationalReply
          : 'Certainly, opening the technician booking form with your diagnostic findings attached.';

        const bookMsg = buildEscalateToBookingMessage(session, reply, agentAction.type === 'escalate_to_booking' ? agentAction.reason : undefined);
        session.messages.push(bookMsg);
        botMessages.push(bookMsg);
        return { session, botMessages };
      }

      if (/\b(restart|reset|new|again|another)\b/i.test(text)) {
        const reset = chatService.resetSession(sessionId);
        return { session: reset, botMessages: [reset.messages[0]] };
      }

      // Check general utterance via diagnosticAgent
      const agentAction = await diagnosticAgent.processTurn(text, {
        model: session.model,
        appliance: session.appliance,
        language: session.language,
        recentHistory: session.messages.map((m) => ({ sender: m.sender as 'user' | 'bot', text: m.text })),
      });

      if (agentAction.type === 'escalate_to_booking') {
        const bookMsg = buildEscalateToBookingMessage(session, agentAction.conversationalReply, agentAction.reason);
        session.messages.push(bookMsg);
        botMessages.push(bookMsg);
        return { session, botMessages };
      }

      if (agentAction.type === 'start_diagnostic_tree') {
        const res = chatService.startTreeInChat(sessionId, agentAction.treeId);
        let localizedStart = res.stepMessage.text;
        if (session.language && session.language !== 'en') {
          localizedStart = await getLocalizedText(localizedStart, session.language);
        }
        res.stepMessage.text = `${agentAction.conversationalReply}\n\n${localizedStart}`;
        return { session: res.session, botMessages: [res.stepMessage] };
      }

      const completedMsg: ChatMessage = {
        id: uuid(),
        sender: 'bot',
        text: `Your diagnostic assessment for this issue has already reached a conclusion.\n\nWould you like to schedule an authorized service technician or start a new diagnostic session?`,
        timestamp: new Date().toISOString(),
        chips: [
          { label: '📅 Book Technician', value: 'BOOK_TECH' },
          { label: '🔄 Start New Diagnostic', value: 'RESTART' },
        ],
      };
      session.messages.push(completedMsg);
      botMessages.push(completedMsg);
      return { session, botMessages };
    }

    // 7. If currently inside an active diagnostic tree session
    if (session.diagnosticSessionId && session.issueId) {
      const tree = getTree(session.issueId);
      if (tree) {
        const currentNode = tree.nodes.find((n) => n.id === session.currentNodeId);

        // A. If an explicit option index is clicked via chip
        if (input.optionIndex !== undefined) {
          const next = nextStep(session.diagnosticSessionId, input.optionIndex);
          if (!('error' in next)) {
            // Seamlessly transition session on cross-tree redirects
            if (next.kind === 'redirect' && next.redirectIssue) {
              const targetIssueId = normalizeAcIssueId(next.redirectIssue) || next.redirectIssue.toUpperCase();
              const targetTree = getTree(targetIssueId);
              if (targetTree) {
                const diag = startSession(targetIssueId);
                if (!('error' in diag)) {
                  session.diagnosticSessionId = diag.sessionId;
                  session.issueId = targetIssueId;
                  session.currentNodeId = diag.step.nodeId;
                  const targetStepMsg = convertStepToChatMessage(diag.step, targetTree);
                  targetStepMsg.text = `Let's troubleshoot **${targetTree.title}** (${targetIssueId}):\n\n${targetStepMsg.text}`;
                  session.messages.push(targetStepMsg);
                  botMessages.push(targetStepMsg);
                  return { session, botMessages };
                }
              }
            }

            session.currentNodeId = next.nodeId;
            if (next.kind === 'conclusion' || next.kind === 'resolution') {
              session.isCompleted = true;
            }
            const stepMsg = convertStepToChatMessage(next, tree);
            session.messages.push(stepMsg);
            botMessages.push(stepMsg);
            return { session, botMessages };
          }
        }

        // B. Pure LLM Structural Tool Calling (Qwen 3.8-27b via Groq)
        if (text && currentNode) {
          const mappedOptions = (currentNode.options || []).map((o, idx) => {
            let targetSummary = '';
            if (o.redirect_issue) {
              const rTree = getTree(o.redirect_issue);
              targetSummary = ` (Redirects to: ${o.redirect_issue} - ${rTree?.title || 'troubleshooting'})`;
            } else if (o.conclusion) {
              const c = tree.conclusions[o.conclusion];
              targetSummary = ` (Diagnoses probable cause: ${c?.probable_cause || o.conclusion})`;
            } else if (o.resolution) {
              targetSummary = ` (Resolves issue without technician)`;
            } else if (o.next_node) {
              const nextN = tree.nodes.find((n) => n.id === o.next_node);
              if (nextN) {
                targetSummary = ` (Continues to check: ${nextN.text_en.slice(0, 50)}...)`;
              }
            }
            return {
              label: o.label + targetSummary,
              index: idx,
            };
          });

          const agentAction = await diagnosticAgent.processTurn(text, {
            model: session.model,
            appliance: session.appliance,
            language: session.language,
            activeTree: {
              issueId: tree.issue_id,
              title: tree.title,
              currentNodeId: currentNode.id,
              questionText: currentNode.text_en,
              options: mappedOptions,
            },
            recentHistory: session.messages.map((m) => ({ sender: m.sender as 'user' | 'bot', text: m.text })),
          });

          // Action 1: Advance to next step and ask next question directly
          if (agentAction.type === 'advance_diagnostic_step') {
            const next = nextStep(session.diagnosticSessionId, agentAction.optionIndex);
            if (!('error' in next)) {
              // Seamlessly transition session on cross-tree redirects (e.g. AC02 -> AC08)
              if (next.kind === 'redirect' && next.redirectIssue) {
                const targetIssueId = normalizeAcIssueId(next.redirectIssue) || next.redirectIssue.toUpperCase();
                const targetTree = getTree(targetIssueId);
                if (targetTree) {
                  const diag = startSession(targetIssueId);
                  if (!('error' in diag)) {
                    session.diagnosticSessionId = diag.sessionId;
                    session.issueId = targetIssueId;
                    session.currentNodeId = diag.step.nodeId;
                    const targetStepMsg = convertStepToChatMessage(diag.step, targetTree);
                    let localizedTarget = targetStepMsg.text;
                    if (session.language && session.language !== 'en') {
                      localizedTarget = await getLocalizedText(localizedTarget, session.language);
                    }
                    targetStepMsg.text = `${agentAction.conversationalReply}\n\nSince this indicates an issue with **${targetTree.title}** (${targetIssueId}), let's troubleshoot that:\n\n${localizedTarget}`;
                    session.messages.push(targetStepMsg);
                    botMessages.push(targetStepMsg);
                    return { session, botMessages };
                  }
                }
              }

              session.currentNodeId = next.nodeId;
              if (next.kind === 'conclusion' || next.kind === 'resolution') {
                session.isCompleted = true;
              }
              const stepMsg = convertStepToChatMessage(next, tree);
              let localizedQuestion = stepMsg.text;
              if (session.language && session.language !== 'en') {
                localizedQuestion = await getLocalizedText(localizedQuestion, session.language);
              }
              // Combine LLM conversational reply with the next question / conclusion
              stepMsg.text = `${agentAction.conversationalReply}\n\n${localizedQuestion}`;
              session.messages.push(stepMsg);
              botMessages.push(stepMsg);
              return { session, botMessages };
            }
          }

          // Action 2: Ask conversational clarification question (NO buttons)
          if (agentAction.type === 'ask_diagnostic_clarification') {
            const clarifyMsg: ChatMessage = {
              id: uuid(),
              sender: 'bot',
              text: agentAction.clarificationQuestion,
              timestamp: new Date().toISOString(),
              chips: [],
              stepInfo: {
                issueId: tree.issue_id,
                nodeId: currentNode.id,
              },
            };
            session.messages.push(clarifyMsg);
            botMessages.push(clarifyMsg);
            return { session, botMessages };
          }

          // Action 3: Recognized error code
          if (agentAction.type === 'lookup_error_code') {
            const entry = errorCodeRegistry.getEntry(agentAction.errorCode);
            const formatted = entry ? errorCodeRegistry.formatResponse(entry) : null;
            const errMsg: ChatMessage = {
              id: uuid(),
              sender: 'bot',
              text: `${agentAction.conversationalReply}\n\n${formatted ? formatted.permittedCustomerAction : 'Please verify the error code on your display.'}`,
              timestamp: new Date().toISOString(),
              safetyAlert: formatted?.safetyAlert,
              chips: [
                ...(formatted?.canStartInteractiveFlow && formatted.compatibleFlowId
                  ? [{ label: '🔍 Start Guided Error Diagnosis', value: 'START_ERROR_DIAG', issueId: formatted.compatibleFlowId }]
                  : []),
                { label: '📅 Book Service', value: 'BOOK_TECH' },
                { label: '🔄 Ask Another Question', value: 'RESTART' },
              ],
            };
            session.messages.push(errMsg);
            botMessages.push(errMsg);
            return { session, botMessages };
          }

          // Action 4: Escalate to technician booking
          if (agentAction.type === 'escalate_to_booking') {
            const bookMsg = buildEscalateToBookingMessage(session, agentAction.conversationalReply, agentAction.reason);
            session.messages.push(bookMsg);
            botMessages.push(bookMsg);
            return { session, botMessages };
          }

          // Action 5: Natural conversational response
          if (agentAction.type === 'conversational_response') {
            const replyMsg: ChatMessage = {
              id: uuid(),
              sender: 'bot',
              text: agentAction.reply,
              timestamp: new Date().toISOString(),
              chips: [],
            };
            session.messages.push(replyMsg);
            botMessages.push(replyMsg);
            return { session, botMessages };
          }
        }
      }
    }

    // 8. Deterministic Routing Layer (Pre-RAG Classification)
    if (text) {
      const routeRes: RouteResolution = deterministicRouter.route(text, {
        model: session.model,
        audience: 'customer',
        appliance_type: session.appliance,
      });

      // Case A: Explicit Error Code Route
      if (routeRes.route === 'EXPLICIT_ERROR_CODE') {
        const chips: Array<{ label: string; value: string; issueId?: string }> = [];

        // If there is a compatible interactive diagnostic flow (e.g. CH 05 -> AC03.q_ch05_power_cycle)
        const flowId = routeRes.chResult?.formatted?.compatibleFlowId || 'AC03';
        if (routeRes.chResult?.formatted?.canStartInteractiveFlow) {
          chips.push({ label: '🔍 Start Guided Error Diagnosis', value: 'START_ERROR_DIAG', issueId: flowId });
        }
        chips.push({ label: '📅 Book Service', value: 'BOOK_TECH' });
        chips.push({ label: '🔄 Ask Another Question', value: 'RESTART' });

        const errMsg: ChatMessage = {
          id: uuid(),
          sender: 'bot',
          text: routeRes.responseText,
          timestamp: new Date().toISOString(),
          safetyAlert: routeRes.safetyAlert,
          chips,
          evidence: routeRes.evidence,
        };
        session.messages.push(errMsg);
        botMessages.push(errMsg);
        return { session, botMessages };
      }


      // 9. Top-Level Symptom Disambiguation via Groq NLU
      // Check if input is a spoken natural language symptom (e.g. "The fan is running, but it isn't running outside.")
      const symptomClass = await groqService.classifySymptom(text, session.appliance);
      if (symptomClass.treeId) {
        const canonicalId = normalizeAcIssueId(symptomClass.treeId) || symptomClass.treeId;
        const tree = getTree(canonicalId);

        if (tree) {
          if (symptomClass.needsReconfirmation || symptomClass.confidence < 0.85) {
            session.pendingConfirmation = {
              type: 'symptom_tree',
              targetId: canonicalId,
            };

            const candidateChips = (symptomClass.candidateTrees || []).map((c) => ({
              label: `${c.treeId}: ${c.description}`,
              value: c.treeId,
              issueId: c.treeId,
            }));

            if (!candidateChips.some((c) => c.issueId === canonicalId)) {
              candidateChips.unshift({
                label: `❄️ ${canonicalId}: ${tree.issue_id}`,
                value: canonicalId,
                issueId: canonicalId,
              });
            }

            const reconfSymptomMsg: ChatMessage = {
              id: uuid(),
              sender: 'bot',
              text: `It sounds like you may be experiencing an issue with your **${session.model}** (e.g. outdoor unit or cooling).\n\nPlease confirm which symptom best describes your issue:`,
              timestamp: new Date().toISOString(),
              chips: [
                ...candidateChips,
                { label: '🔄 Other Symptom', value: 'RESTART' },
              ],
            };

            session.messages.push(reconfSymptomMsg);
            botMessages.push(reconfSymptomMsg);
            return { session, botMessages };
          } else {
            const ackMsg: ChatMessage = {
              id: uuid(),
              sender: 'bot',
              text: `It sounds like you are experiencing a **${canonicalId} issue** with your ${session.model}. Let's troubleshoot this step by step:`,
              timestamp: new Date().toISOString(),
            };
            session.messages.push(ackMsg);
            botMessages.push(ackMsg);

            const res = chatService.startTreeInChat(sessionId, canonicalId);
            botMessages.push(res.stepMessage);
            return { session, botMessages };
          }
        }
      }

      // Case B: Direct Symptom Match leading to Diagnostic Tree
      if (routeRes.route === 'SYMPTOM_TROUBLESHOOTING' && routeRes.targetId) {
        const canonicalId = normalizeAcIssueId(routeRes.targetId) || routeRes.targetId;
        const tree = getTree(canonicalId);
        if (tree) {
          const ackMsg: ChatMessage = {
            id: uuid(),
            sender: 'bot',
            text: routeRes.responseText,
            timestamp: new Date().toISOString(),
            evidence: routeRes.evidence,
          };
          session.messages.push(ackMsg);
          botMessages.push(ackMsg);

          const res = chatService.startTreeInChat(sessionId, canonicalId);
          botMessages.push(res.stepMessage);
          return { session: res.session, botMessages };
        }
      }

      // Case C: Instruction Request / Maintenance Action
      if (routeRes.route === 'INSTRUCTION_REQUEST') {
        const instMsg: ChatMessage = {
          id: uuid(),
          sender: 'bot',
          text: routeRes.responseText,
          timestamp: new Date().toISOString(),
          safetyAlert: routeRes.safetyAlert,
          chips: [
            { label: '🔄 Start Guided Diagnosis', value: 'RESTART' },
            { label: '📅 Book Technician Visit', value: 'BOOK_TECH' }
          ],
          evidence: routeRes.evidence,
        };
        session.messages.push(instMsg);
        botMessages.push(instMsg);
        return { session, botMessages };
      }

      // Case D: Technical Specification or Warranty Policy
      if (routeRes.route === 'TECHNICAL_SPECIFICATION' || routeRes.route === 'WARRANTY_POLICY') {
        const specMsg: ChatMessage = {
          id: uuid(),
          sender: 'bot',
          text: routeRes.responseText,
          timestamp: new Date().toISOString(),
          safetyAlert: routeRes.safetyAlert,
          chips: [
            { label: '🔍 Start AC Troubleshooting', value: 'AC01', issueId: 'AC01' },
            { label: '📅 Book Technician Visit', value: 'BOOK_TECH' }
          ],
          evidence: routeRes.evidence,
        };
        session.messages.push(specMsg);
        botMessages.push(specMsg);
        return { session, botMessages };
      }

      // Case E: General Appliance or Conversational Fallback
      let responseText = routeRes.responseText;
      const isGreetingOrIntro = /\b(hey|hello|hi|who are you|who are u|who r u|your name|shriya|good morning|good evening|how are you)\b/i.test(text);
      if (isGreetingOrIntro || !responseText || responseText.includes('MFL72020508') || responseText.includes('Copyright') || responseText.includes('TABLE OF CONTENTS')) {
        responseText = await groqService.generateConversationalReply(text, session.model);
      }

      const generalMsg: ChatMessage = {
        id: uuid(),
        sender: 'bot',
        text: responseText,
        timestamp: new Date().toISOString(),
        evidence: routeRes.evidence,
      };
      session.messages.push(generalMsg);
      botMessages.push(generalMsg);
      return { session, botMessages };
    }

    return { session, botMessages };
  },
};
