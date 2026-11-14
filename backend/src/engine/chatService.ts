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
import { conversationUnderstanding, ConversationUnderstanding } from './conversationUnderstanding';
import { safetyEngine } from './safetyEngine';
import { treeIndexService } from './treeIndexService';
import { createServiceTicket } from '../routes/service';

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
  action?: 'NAV_BOOKING' | 'BOOKING_CONFIRMED';
  ticketId?: string;
  ticket?: any;
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

export interface ConversationalBookingState {
  step: 'IDLE' | 'AWAITING_DATE_TIME' | 'AWAITING_NAME' | 'AWAITING_PHONE' | 'AWAITING_ADDRESS' | 'AWAITING_CONFIRMATION' | 'COMPLETED';
  priority: 'High' | 'Medium' | 'Low';
  editingField?: 'date_time' | 'name' | 'phone' | 'address';
  preferredDate?: string;
  preferredTime?: string;
  customerName?: string;
  contactNumber?: string;
  serviceAddress?: string;
  pincode?: string;
  customerEmail?: string;
  reportedIssue?: string;
  errorCode?: string;
  probableCause?: string;
  conclusionId?: string;
}

export interface ChatSession {
  sessionId: string;
  diagnosticSessionId?: string;
  issueId?: string;
  currentNodeId?: string;
  language?: string;
  model: string;
  appliance: string;
  messages: ChatMessage[];
  createdAt: string;
  isCompleted: boolean;
  currentUser?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    pincode?: string;
    city?: string;
    customerId?: string;
  };
  bookingState?: ConversationalBookingState;
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

async function getLocalizedText(text: string, lang: string): Promise<string> {
  const cleanLang = (lang || 'en').toLowerCase().split(/[-_]/)[0];
  if (cleanLang === 'en' || !text) return text;
  const key = `${cleanLang}:${text}`;
  if (nodeTranslationCache.has(key)) return nodeTranslationCache.get(key)!;
  const localized = await groqService.localizeText(text, cleanLang);
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
function createWelcomeMessage(model: string, language: string = 'en'): ChatMessage {
  let text = `Hello! 👋 I'm your ApplianceCare AI Diagnostic Assistant for your LG Dual Inverter Air Conditioner (${model}).\n\nYou can describe your symptom (e.g., *"AC is not cooling"*, *"water leaking"*, *"CH 05 on display"*), or pick a quick suggestion below.`;

  if (language === 'ta') {
    text = `வணக்கம்! 👋 நான் உங்கள் ApplianceCare AI assistant. உங்க AC-ல என்ன பிரச்சனை-ன்னு சொல்லுங்க (உதாரணமாக: *"AC cooling வரல"*, *"water leak ஆகுது"*, *"display-ல CH 05 வருது"*), அல்லது கீழே உள்ள suggestions-ல இருந்து pick பண்ணலாம்.`;
  } else if (language === 'hi') {
    text = `Namaste! 👋 Main aapka ApplianceCare AI assistant hoon. Aapke AC mein kya problem ho rahi hai bataiye (jaise: *"cooling bilkul nahi aa rahi"*, *"water leak ho raha hai"*, *"display par CH 05 aa raha hai"*), ya neeche diye options choose kar sakte hain.`;
  }

  return {
    id: uuid(),
    sender: 'bot',
    text,
    timestamp: new Date().toISOString(),
    chips: STARTER_CHIPS,
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
      text: `🎉 **Issue Successfully Resolved!**\n\nBased on your observations, your air conditioner is running normally again. No technician visit is required.\n\n*Tip:* Clean the air filters every 15 days to maintain peak efficiency.`,
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
      text: `Let's check your **${targetTree?.title || 'appliance'}**:`,
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
    questionEn = `${instructionDetails.text}\n\n${questionEn || 'Please observe the result:'}`;
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

// ── Conversational Multi-Turn Booking Helpers ───────────────────────────────

function getTomorrowDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function determineBookingPriority(session: ChatSession, reason?: string): 'High' | 'Medium' | 'Low' {
  const lastConclusion = [...session.messages].reverse().find(m => m.conclusion)?.conclusion;
  if (lastConclusion?.priority) {
    const p = lastConclusion.priority.toLowerCase();
    if (p.includes('high') || p.includes('urgent') || p.includes('critical')) return 'High';
    if (p.includes('low') || p.includes('minor')) return 'Low';
    if (p.includes('med')) return 'Medium';
  }

  const issueId = (session.issueId || '').toUpperCase();
  const textSummary = `${session.bookingState?.reportedIssue || ''} ${session.bookingState?.probableCause || ''} ${reason || ''}`.toLowerCase();

  // High priority: Electrical, safety hazard, fire/smoke, tripping, compressor seizure, CH communication errors
  if (
    issueId === 'AC02' || issueId === 'AC03' || issueId === 'AC05' || issueId === 'AC16' ||
    issueId.startsWith('CH') ||
    /\b(trip|tripping|mcb|breaker|burning|smoke|spark|fire|dead|won't turn on|shock|voltage|short circuit)\b/i.test(textSummary)
  ) {
    return 'High';
  }

  // Low priority: Remote control, filter cleaning, minor cosmetic
  if (
    issueId === 'AC08' ||
    /\b(remote|battery|filter cleaning|clean filter|display light|cosmetic)\b/i.test(textSummary)
  ) {
    return 'Low';
  }

  // Default: Medium priority (Cooling performance, water drip, vibration, noise)
  return 'Medium';
}

function getUpcomingBookingSlots(priority: 'High' | 'Medium' | 'Low' = 'Medium') {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().split('T')[0];

  if (priority === 'High') {
    // High Priority: strictly within next day (Tomorrow slots)
    return [
      { label: '⚡ Tomorrow Morning (09 AM - 01 PM) [Next Day]', value: `SLOT_${tomorrowIso}_Morning (09:00 AM - 01:00 PM)` },
      { label: '⚡ Tomorrow Afternoon (01 PM - 05 PM) [Next Day]', value: `SLOT_${tomorrowIso}_Afternoon (01:00 PM - 05:00 PM)` },
      { label: '⚡ Tomorrow Evening (05 PM - 08 PM) [Next Day]', value: `SLOT_${tomorrowIso}_Evening (05:00 PM - 08:00 PM)` },
    ];
  }

  // Medium and Low Priority: flexible across upcoming days (Any Date)
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);
  const dayAfterIso = dayAfter.toISOString().split('T')[0];

  const in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);
  const in3DaysIso = in3Days.toISOString().split('T')[0];

  return [
    { label: 'Tomorrow Morning (09 AM - 01 PM)', value: `SLOT_${tomorrowIso}_Morning (09:00 AM - 01:00 PM)` },
    { label: 'Tomorrow Afternoon (01 PM - 05 PM)', value: `SLOT_${tomorrowIso}_Afternoon (01:00 PM - 05:00 PM)` },
    { label: 'Day After Tomorrow Morning', value: `SLOT_${dayAfterIso}_Morning (09:00 AM - 01:00 PM)` },
    { label: `In 3 Days (${in3Days.toLocaleDateString('en-US', { weekday: 'short' })})`, value: `SLOT_${in3DaysIso}_Morning (09:00 AM - 01:00 PM)` },
  ];
}

function parseDateAndSlot(text: string = '', specialAction?: string): { date: string; slot: string } {
  if (specialAction?.startsWith('SLOT_')) {
    const parts = specialAction.replace('SLOT_', '').split('_');
    return {
      date: parts[0] || getTomorrowDateStr(),
      slot: parts[1] || 'Morning (09:00 AM - 01:00 PM)',
    };
  }

  const lower = text.toLowerCase();
  let date = getTomorrowDateStr();
  let slot = 'Morning (09:00 AM - 01:00 PM)';

  if (/\b(afternoon|post[- ]?noon|1\s*pm|2\s*pm|3\s*pm|4\s*pm)\b/i.test(lower)) {
    slot = 'Afternoon (01:00 PM - 05:00 PM)';
  } else if (/\b(evening|night|5\s*pm|6\s*pm|7\s*pm|8\s*pm)\b/i.test(lower)) {
    slot = 'Evening (05:00 PM - 08:00 PM)';
  } else if (/\b(morning|early|9\s*am|10\s*am|11\s*am|12\s*pm|noon)\b/i.test(lower)) {
    slot = 'Morning (09:00 AM - 01:00 PM)';
  }

  if (/\b(today|tonight)\b/i.test(lower)) {
    date = new Date().toISOString().split('T')[0];
  } else if (/\b(day after tomorrow|in 2 days)\b/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    date = d.toISOString().split('T')[0];
  } else if (/\btomorrow\b/i.test(lower)) {
    date = getTomorrowDateStr();
  } else {
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayName = weekdays[dayIndex];
      if (lower.includes(dayName)) {
        const now = new Date();
        const currentDay = now.getDay();
        let diff = dayIndex - currentDay;
        if (diff <= 0) diff += 7;
        const target = new Date();
        target.setDate(now.getDate() + diff);
        date = target.toISOString().split('T')[0];
        break;
      }
    }
    const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      date = isoMatch[1];
    }
  }

  return { date, slot };
}

function startConversationalBooking(session: ChatSession, reason?: string): ChatMessage {
  const lastConclusion = [...session.messages].reverse().find(m => m.conclusion)?.conclusion;
  const priority = determineBookingPriority(session, reason);
  const cu = session.currentUser;
  const hasFullProfile = Boolean(cu?.name && cu?.phone && cu?.address);

  const defaultDate = getTomorrowDateStr();
  const defaultSlot = 'Morning (09:00 AM - 01:00 PM)';

  session.bookingState = {
    step: hasFullProfile ? 'AWAITING_CONFIRMATION' : 'AWAITING_DATE_TIME',
    priority,
    preferredDate: defaultDate,
    preferredTime: defaultSlot,
    reportedIssue: session.appliance ? `${session.appliance} - Service Visit` : 'Appliance Service Visit',
    probableCause: lastConclusion?.probable_cause || reason || 'Certified technician inspection required',
    errorCode: session.issueId?.startsWith('CH') ? session.issueId : undefined,
    conclusionId: session.currentNodeId || undefined,
    customerName: cu?.name,
    contactNumber: cu?.phone,
    serviceAddress: cu?.address,
    pincode: cu?.pincode || '560001',
    customerEmail: cu?.email,
  };

  if (hasFullProfile) {
    return buildBookingSummaryMessage(
      session,
      `I have auto-filled your service booking details from your profile:`
    );
  }

  const slotChips = getUpcomingBookingSlots(priority);
  const priorityHeader =
    priority === 'High'
      ? `🚨 **High Priority Notice**: Because this issue requires urgent attention, visits are prioritized **within the next day**.`
      : `What **date and time slot** would work best for your visit?`;

  return {
    id: uuid(),
    sender: 'bot',
    text: `I can schedule an LG certified HVAC technician to inspect your appliance.\n\n${priorityHeader}`,
    timestamp: new Date().toISOString(),
    bookingContext: {
      symptom: session.appliance ? `${session.appliance} - Service Request` : 'Diagnostic Service Request',
      probable_cause: session.bookingState.probableCause,
      priority,
    },
    chips: [
      ...slotChips,
      { label: '📋 Open Booking Form', value: 'NAV_BOOKING' }
    ],
  };
}

function buildBookingSummaryMessage(session: ChatSession, prefixNotice?: string): ChatMessage {
  const bs = session.bookingState!;
  const notice = prefixNotice ? `${prefixNotice}\n\n` : '';
  const addrDisplay = bs.serviceAddress || 'Customer Address';
  const pinDisplay = bs.pincode && !addrDisplay.includes(bs.pincode) ? `, ${bs.pincode}` : '';

  const priorityLabel =
    bs.priority === 'High'
      ? '🚨 High Priority (Next-Day Service Required)'
      : bs.priority === 'Low'
      ? '🟢 Low Priority (Routine Inspection / Any Date)'
      : '⚖️ Medium Priority (Flexible Booking / Any Date)';

  return {
    id: uuid(),
    sender: 'bot',
    text: `${notice}• **Reported Issue:** ${bs.reportedIssue || 'Appliance Service Visit'}\n• **Service Priority:** ${priorityLabel}\n• **Proposed Visit Slot:** **${bs.preferredDate || 'Tomorrow'}** (${bs.preferredTime || 'Morning (09:00 AM - 01:00 PM)'})\n• **Customer Name:** ${bs.customerName || 'Customer'}\n• **Contact Phone:** ${bs.contactNumber || 'Provided via profile'}\n• **Service Address:** ${addrDisplay}${pinDisplay}\n\n**Is this auto-filled information correct?**`,
    timestamp: new Date().toISOString(),
    chips: [
      { label: '✅ Yes, Information is Correct & Book', value: 'CONFIRM_BOOKING' },
      { label: '📅 Change Date/Time', value: 'EDIT_DATE' },
      { label: '📱 Change Phone', value: 'EDIT_PHONE' },
      { label: '📍 Change Address', value: 'EDIT_ADDRESS' },
      { label: '👤 Change Name', value: 'EDIT_NAME' },
      { label: '❌ Cancel', value: 'CANCEL_BOOKING' },
    ],
  };
}

async function handleConversationalBookingTurn(
  session: ChatSession,
  input: { text?: string; specialAction?: string; optionIndex?: number },
  text: string
): Promise<ChatMessage | null> {
  if (!session.bookingState || session.bookingState.step === 'IDLE' || session.bookingState.step === 'COMPLETED') {
    return null;
  }

  // Allow canceling anytime during the multi-turn collection
  if (
    input.specialAction === 'CANCEL_BOOKING' ||
    (/\b(cancel|stop|abort|don't book|no need|never mind|exit booking)\b/i.test(text) && session.bookingState.step !== 'AWAITING_DATE_TIME')
  ) {
    session.bookingState.step = 'IDLE';
    session.bookingState.editingField = undefined;
    return {
      id: uuid(),
      sender: 'bot',
      text: `Technician booking request canceled. Feel free to let me know if you'd like to troubleshoot further or have any questions!`,
      timestamp: new Date().toISOString(),
      chips: [
        { label: '🔄 Start New Diagnostic', value: 'RESTART' },
      ],
    };
  }

  // 1. Step 1: Awaiting Date and Time Slot
  if (session.bookingState.step === 'AWAITING_DATE_TIME') {
    const { date, slot } = parseDateAndSlot(text, input.specialAction);
    const maxAllowed = getTomorrowDateStr();

    if (session.bookingState.priority === 'High' && date > maxAllowed) {
      const slotChips = getUpcomingBookingSlots('High');
      return {
        id: uuid(),
        sender: 'bot',
        text: `⚠️ **High Priority Safety Notice**:\n\nBecause this AC issue is categorized as **High Priority** (electrical/safety hazard), service must be scheduled **within the next day (tomorrow)** to prevent equipment damage or safety hazards.\n\nPlease choose one of the next-day slots below:`,
        timestamp: new Date().toISOString(),
        chips: slotChips,
      };
    }

    session.bookingState.preferredDate = date;
    session.bookingState.preferredTime = slot;

    // Check if user is logged in with complete profile
    const cu = session.currentUser;
    const hasFullProfile = Boolean(cu?.name && cu?.phone && cu?.address);

    if (hasFullProfile) {
      session.bookingState.customerName = cu!.name;
      session.bookingState.contactNumber = cu!.phone;
      session.bookingState.serviceAddress = cu!.address;
      session.bookingState.pincode = cu!.pincode || '560001';
      session.bookingState.customerEmail = cu!.email;
      session.bookingState.step = 'AWAITING_CONFIRMATION';

      return buildBookingSummaryMessage(
        session,
        `I have auto-filled your service booking details from your profile:`
      );
    }

    // Guest flow: ask for full name
    session.bookingState.step = 'AWAITING_NAME';
    return {
      id: uuid(),
      sender: 'bot',
      text: `Understood, visit preference recorded for **${date}** (${slot}).\n\nTo proceed, please share your **Full Name**:`,
      timestamp: new Date().toISOString(),
      chips: [],
    };
  }

  // 2. Step 2: Awaiting Full Name
  if (session.bookingState.step === 'AWAITING_NAME') {
    const name = text.trim();
    if (!name || name.length < 2) {
      return {
        id: uuid(),
        sender: 'bot',
        text: `Please enter your full name so our technician knows who to ask for:`,
        timestamp: new Date().toISOString(),
      };
    }
    session.bookingState.customerName = name;
    session.bookingState.step = 'AWAITING_PHONE';
    return {
      id: uuid(),
      sender: 'bot',
      text: `Thank you, **${name}**. What is your **contact phone number** so our technician can coordinate?`,
      timestamp: new Date().toISOString(),
    };
  }

  // 3. Step 3: Awaiting Contact Phone Number
  if (session.bookingState.step === 'AWAITING_PHONE') {
    const digits = text.replace(/[^\d+]/g, '');
    if (digits.length < 8) {
      return {
        id: uuid(),
        sender: 'bot',
        text: `Please provide a valid phone number (at least 10 digits) so the technician can reach you:`,
        timestamp: new Date().toISOString(),
      };
    }
    session.bookingState.contactNumber = text.trim();
    session.bookingState.step = 'AWAITING_ADDRESS';
    return {
      id: uuid(),
      sender: 'bot',
      text: `Got it. Lastly, please provide your **complete service address and 6-digit pincode**:`,
      timestamp: new Date().toISOString(),
    };
  }

  // 4. Step 4: Awaiting Service Address
  if (session.bookingState.step === 'AWAITING_ADDRESS') {
    const addr = text.trim();
    if (addr.length < 5) {
      return {
        id: uuid(),
        sender: 'bot',
        text: `Please provide your full service address (including house/flat number and locality) so our technician can locate your premises:`,
        timestamp: new Date().toISOString(),
      };
    }
    const pinMatch = addr.match(/\b(\d{6})\b/);
    session.bookingState.serviceAddress = addr;
    session.bookingState.pincode = pinMatch ? pinMatch[1] : (session.currentUser?.pincode || '560001');
    session.bookingState.step = 'AWAITING_CONFIRMATION';

    return buildBookingSummaryMessage(session, 'Perfect! Please review your service appointment details:');
  }

  // 5. Step 5: Awaiting Confirmation & Multi-Turn Detail Correction
  if (session.bookingState.step === 'AWAITING_CONFIRMATION') {
    // 5a. If user was actively prompted to edit a specific field
    if (session.bookingState.editingField) {
      const field = session.bookingState.editingField;

      if (field === 'phone') {
        const digits = text.replace(/[^\d+]/g, '');
        if (digits.length < 8) {
          return {
            id: uuid(),
            sender: 'bot',
            text: `Please provide a valid phone number (at least 10 digits):`,
            timestamp: new Date().toISOString(),
            chips: [{ label: '❌ Keep Current Phone', value: 'CONFIRM_BOOKING' }],
          };
        }
        session.bookingState.contactNumber = text.trim();
        session.bookingState.editingField = undefined;
        return buildBookingSummaryMessage(session, `✅ Updated contact phone number to **${session.bookingState.contactNumber}**.`);
      }

      if (field === 'address') {
        if (text.trim().length < 5) {
          return {
            id: uuid(),
            sender: 'bot',
            text: `Please provide your full service address (including house/flat number and locality):`,
            timestamp: new Date().toISOString(),
            chips: [{ label: '❌ Keep Current Address', value: 'CONFIRM_BOOKING' }],
          };
        }
        const pinMatch = text.match(/\b(\d{6})\b/);
        session.bookingState.serviceAddress = text.trim();
        if (pinMatch) session.bookingState.pincode = pinMatch[1];
        session.bookingState.editingField = undefined;
        return buildBookingSummaryMessage(session, `✅ Updated service address to **${session.bookingState.serviceAddress}**.`);
      }

      if (field === 'date_time') {
        const { date, slot } = parseDateAndSlot(text, input.specialAction);
        const maxAllowed = getTomorrowDateStr();

        if (session.bookingState.priority === 'High' && date > maxAllowed) {
          const slotChips = getUpcomingBookingSlots('High');
          return {
            id: uuid(),
            sender: 'bot',
            text: `⚠️ **High Priority Safety Notice**:\n\nBecause this AC issue is categorized as **High Priority** (electrical/safety hazard), service must be scheduled **within the next day (tomorrow)** to prevent hazard or equipment damage.\n\nPlease choose one of the next-day slots below:`,
            timestamp: new Date().toISOString(),
            chips: slotChips,
          };
        }

        session.bookingState.preferredDate = date;
        session.bookingState.preferredTime = slot;
        session.bookingState.editingField = undefined;
        return buildBookingSummaryMessage(session, `✅ Updated visit slot to **${date}** (${slot}).`);
      }

      if (field === 'name') {
        if (text.trim().length < 2) {
          return {
            id: uuid(),
            sender: 'bot',
            text: `Please enter your full name:`,
            timestamp: new Date().toISOString(),
            chips: [{ label: '❌ Keep Current Name', value: 'CONFIRM_BOOKING' }],
          };
        }
        session.bookingState.customerName = text.trim();
        session.bookingState.editingField = undefined;
        return buildBookingSummaryMessage(session, `✅ Updated customer name to **${session.bookingState.customerName}**.`);
      }
    }

    // 5b. Cancellation
    if (
      input.specialAction === 'CANCEL_BOOKING' ||
      /\b(cancel|stop|abort|don't book|no need|never mind|exit booking)\b/i.test(text)
    ) {
      session.bookingState.step = 'IDLE';
      session.bookingState.editingField = undefined;
      return {
        id: uuid(),
        sender: 'bot',
        text: `Technician booking request canceled. Feel free to let me know if you'd like to troubleshoot further or have any questions!`,
        timestamp: new Date().toISOString(),
        chips: [
          { label: '🔄 Start New Diagnostic', value: 'RESTART' },
        ],
      };
    }

    // 5c. Confirmation
    const isConfirm =
      input.specialAction === 'CONFIRM_BOOKING' ||
      /\b(yes|yeah|yup|confirm|book|proceed|sure|ok|okay|do it|fine|yes please|looks good|all good|correct|information is correct)\b/i.test(text);

    if (isConfirm && !/\b(change|edit|update|modify|different|wrong)\b/i.test(text)) {
      const { ticket, appointment } = createServiceTicket({
        customerName: session.bookingState.customerName || session.currentUser?.name || 'Customer',
        contactNumber: session.bookingState.contactNumber || session.currentUser?.phone || '+91 98000 00000',
        serviceAddress: session.bookingState.serviceAddress || session.currentUser?.address || 'Customer Address',
        pincode: session.bookingState.pincode || session.currentUser?.pincode,
        customerEmail: session.bookingState.customerEmail || session.currentUser?.email,
        preferredDate: session.bookingState.preferredDate,
        preferredTime: session.bookingState.preferredTime,
        acModel: session.model || 'UW-Q18WUZA',
        reportedIssue: session.bookingState.reportedIssue || 'Appliance Service Visit',
        errorCode: session.bookingState.errorCode,
        probableCause: session.bookingState.probableCause,
        conclusionId: session.bookingState.conclusionId,
        priority: session.bookingState.priority,
      });

      session.bookingState.step = 'COMPLETED';
      session.bookingState.editingField = undefined;

      const confirmationText = `🎉 **Technician Visit Successfully Confirmed!**\n\nYour service ticket has been created and assigned:\n• **Ticket ID:** \`${ticket.ticketId}\`\n• **Priority:** **${ticket.priority || session.bookingState.priority}**\n• **Assigned Technician:** **${appointment.technicianName}** (HVAC Certified Specialist)\n• **Scheduled Date:** **${appointment.date}**\n• **Time Window:** **${appointment.slot}**\n• **Service Address:** ${ticket.serviceAddress}\n\n${appointment.isAlternativeSlot ? `*(Note: Assigned in nearest available slot: ${appointment.slot})*\n\n` : ''}Our certified technician will call you at ${ticket.contactNumber} 30 minutes before arrival. You can track this appointment anytime using your Ticket ID.`;

      return {
        id: uuid(),
        sender: 'bot',
        text: confirmationText,
        timestamp: new Date().toISOString(),
        action: 'BOOKING_CONFIRMED',
        ticketId: ticket.ticketId,
        ticket: ticket,
        chips: [
          { label: '🔍 Track Ticket Status', value: 'TRACK_TICKET' },
          { label: '🔄 Start New Diagnostic', value: 'RESTART' },
        ],
      };
    }

    // 5d. Granular Field Edit Intent Detection
    // 1. Phone number edit
    const isPhoneEdit = input.specialAction === 'EDIT_PHONE' || /\b(phone|mobile|contact|call|number)\b/i.test(text);
    if (isPhoneEdit) {
      // Check if user provided the phone number in this same utterance
      const phoneDigits = text.match(/(?:[+]?\d[\d\s-]{8,}\d)/);
      if (phoneDigits && phoneDigits[0].replace(/[^\d]/g, '').length >= 10) {
        session.bookingState.contactNumber = phoneDigits[0].trim();
        return buildBookingSummaryMessage(session, `✅ Updated contact phone number to **${session.bookingState.contactNumber}**.`);
      }
      session.bookingState.editingField = 'phone';
      return {
        id: uuid(),
        sender: 'bot',
        text: `Please provide your updated **contact phone number**:`,
        timestamp: new Date().toISOString(),
        chips: [{ label: '❌ Keep Current Phone', value: 'CONFIRM_BOOKING' }],
      };
    }

    // 2. Address edit
    const isAddressEdit = input.specialAction === 'EDIT_ADDRESS' || /\b(address|location|place|pincode|house|flat|apartment|colony)\b/i.test(text);
    if (isAddressEdit) {
      // Check if user provided the address inline
      const inlineAddrMatch = text.match(/(?:address|location|to|is)[:\s]+(.{8,})/i);
      if (inlineAddrMatch && inlineAddrMatch[1].trim().length >= 8) {
        const newAddr = inlineAddrMatch[1].trim();
        const pinMatch = newAddr.match(/\b(\d{6})\b/);
        session.bookingState.serviceAddress = newAddr;
        if (pinMatch) session.bookingState.pincode = pinMatch[1];
        return buildBookingSummaryMessage(session, `✅ Updated service address to **${session.bookingState.serviceAddress}**.`);
      }
      session.bookingState.editingField = 'address';
      return {
        id: uuid(),
        sender: 'bot',
        text: `Please provide your updated **complete service address and 6-digit pincode**:`,
        timestamp: new Date().toISOString(),
        chips: [{ label: '❌ Keep Current Address', value: 'CONFIRM_BOOKING' }],
      };
    }

    // 3. Date / Time Slot edit
    const isDateEdit =
      input.specialAction === 'EDIT_DATE' ||
      input.specialAction?.startsWith('SLOT_') ||
      /\b(date|time|slot|day|window|morning|afternoon|evening|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text);

    if (isDateEdit) {
      const isExplicitSlot =
        input.specialAction?.startsWith('SLOT_') ||
        /\b(morning|afternoon|evening|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]+|\d{4}-\d{2}-\d{2})\b/i.test(text);

      if (isExplicitSlot) {
        const { date, slot } = parseDateAndSlot(text, input.specialAction);
        const maxAllowed = getTomorrowDateStr();

        if (session.bookingState.priority === 'High' && date > maxAllowed) {
          const slotChips = getUpcomingBookingSlots('High');
          return {
            id: uuid(),
            sender: 'bot',
            text: `⚠️ **High Priority Safety Notice**:\n\nBecause this AC issue is categorized as **High Priority** (electrical/safety hazard), service must be scheduled **within the next day (tomorrow)** to prevent equipment damage or safety hazards.\n\nPlease choose one of the next-day slots below:`,
            timestamp: new Date().toISOString(),
            chips: slotChips,
          };
        }

        session.bookingState.preferredDate = date;
        session.bookingState.preferredTime = slot;
        return buildBookingSummaryMessage(session, `✅ Updated visit slot to **${date}** (${slot}).`);
      }
      session.bookingState.editingField = 'date_time';
      const slotChips = getUpcomingBookingSlots(session.bookingState.priority);
      return {
        id: uuid(),
        sender: 'bot',
        text: `What date and time slot would you like instead?`,
        timestamp: new Date().toISOString(),
        chips: slotChips,
      };
    }

    // 4. Name edit
    const isNameEdit = input.specialAction === 'EDIT_NAME' || /\b(name|customer)\b/i.test(text);
    if (isNameEdit) {
      const inlineNameMatch = text.match(/(?:name|is|to)[:\s]+([a-zA-Z\s]{2,})/i);
      if (inlineNameMatch && inlineNameMatch[1].trim().length >= 2) {
        session.bookingState.customerName = inlineNameMatch[1].trim();
        return buildBookingSummaryMessage(session, `✅ Updated customer name to **${session.bookingState.customerName}**.`);
      }
      session.bookingState.editingField = 'name';
      return {
        id: uuid(),
        sender: 'bot',
        text: `Please provide your updated **full name**:`,
        timestamp: new Date().toISOString(),
        chips: [{ label: '❌ Keep Current Name', value: 'CONFIRM_BOOKING' }],
      };
    }

    // 5e. General Edit or Disapproval ("edit", "change details", "no", "wrong")
    const isGeneralEdit = input.specialAction === 'EDIT_BOOKING' || /\b(edit|change|different|modify|wrong|incorrect|no|nope|nah)\b/i.test(text);
    if (isGeneralEdit) {
      return {
        id: uuid(),
        sender: 'bot',
        text: `Which detail would you like to update?`,
        timestamp: new Date().toISOString(),
        chips: [
          { label: '📅 Date & Time', value: 'EDIT_DATE' },
          { label: '📱 Phone Number', value: 'EDIT_PHONE' },
          { label: '📍 Service Address', value: 'EDIT_ADDRESS' },
          { label: '👤 Customer Name', value: 'EDIT_NAME' },
          { label: '❌ Cancel Booking', value: 'CANCEL_BOOKING' },
        ],
      };
    }

    // 5f. Fallback re-prompt
    return buildBookingSummaryMessage(session);
  }

  return null;
}

export const chatService = {
  /**
   * Initializes or gets an existing chat session
   */
  getOrCreateSession: (
    sessionId?: string,
    model: string = 'UW-Q18WUZA',
    rawLanguage: string = 'en',
    appliance: string = 'air-conditioner',
    currentUser?: any
  ): ChatSession => {
    const shortLang: 'en' | 'hi' | 'ta' = rawLanguage.startsWith('ta') ? 'ta' : rawLanguage.startsWith('hi') ? 'hi' : 'en';

    if (sessionId && chatSessions.has(sessionId)) {
      const existing = chatSessions.get(sessionId)!;
      if (existing && shortLang !== existing.language) {
        existing.language = shortLang;
      }
      if (currentUser) {
        existing.currentUser = currentUser;
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
      currentUser,
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
      text: `Let's troubleshoot your **${tree.title}**. Here are a few quick checks:`,
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
      understanding?: ConversationUnderstanding;
      currentUser?: any;
    }
  ): Promise<{ session: ChatSession; botMessages: ChatMessage[] }> => {
    const session = chatSessions.get(sessionId);
    if (!session) throw new Error('Chat session not found');

    if (input.currentUser) {
      session.currentUser = input.currentUser;
    }

    if (input.language) {
      const parsedLang = input.language.toLowerCase().split(/[-_]/)[0] || 'en';
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

    // 1b. Handle Conversational Multi-Turn Technician Booking if Active
    if (
      session.bookingState &&
      session.bookingState.step !== 'IDLE' &&
      session.bookingState.step !== 'COMPLETED'
    ) {
      const bookingTurn = await handleConversationalBookingTurn(session, input, text);
      if (bookingTurn) {
        session.messages.push(bookingTurn);
        botMessages.push(bookingTurn);
        return { session, botMessages };
      }
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

    // 3. Independent Safety Hazard Check (BEFORE any workflow or booking actions)
    const safetyCheck = text ? safetyEngine.check(text, { language: session.language }) : { detected: false, responseText: undefined, level: null };
    if (safetyCheck.detected) {
      const safetyMsg: ChatMessage = {
        id: uuid(),
        sender: 'bot',
        text: safetyCheck.responseText || `🚨 **CRITICAL SAFETY WARNING: HAZARD DETECTED**\n\n1. **Immediately turn OFF the main MCB / electrical breaker** supplying power to your AC.\n2. **DO NOT** touch the indoor or outdoor unit.\n3. **DO NOT** attempt DIY repairs.\n\nA certified HVAC technician must inspect the electrical wiring and compressor before powering on again.`,
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

    // 4. Conversation Understanding Evaluation (if not already injected)
    const cu: ConversationUnderstanding = input.understanding || (text ? conversationUnderstanding.understand(text, {
      sessionId,
      appliance: session.appliance,
      model: session.model,
      language: session.language as any,
      hasActiveDiagnosticTree: Boolean(session.diagnosticSessionId && session.issueId),
      lastBotQuestionText: session.messages.filter(m => m.sender === 'bot').slice(-1)[0]?.text,
    }) : undefined as any);

    // 4a. Conversational Handling for Language Switch Commands
    if (cu && cu.intent.primary === 'LANGUAGE_COMMAND') {
      let targetLang: 'ta' | 'hi' | 'en' = 'en';
      if (/தங்கிலீ|தமிங்கிலீ|tanglish|tamil|தமிழ்/i.test(text)) {
        targetLang = 'ta';
      } else if (/hindi|hinglish/i.test(text)) {
        targetLang = 'hi';
      }
      session.language = targetLang;

      let replyText = "Sure, switching to English! Tell me what's happening with your AC.";
      if (targetLang === 'ta') {
        replyText = "சரிங்க, தங்கிலீஷ்லயே பேசலாம்! சொல்லுங்க, உங்க AC-ல என்ன பிரச்சனை ஆகுது?";
      } else if (targetLang === 'hi') {
        replyText = "Haan bilkul, ab Hinglish mein baat karenge! Bataiye AC mein kya dikkat aa rahi hai?";
      }

      const langMsg: ChatMessage = {
        id: uuid(),
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(langMsg);
      botMessages.push(langMsg);
      return { session, botMessages };
    }

    // 4b. Conversational Handling for Audibility / Connection Checks
    if (cu && cu.intent.primary === 'AUDIBILITY_CHECK') {
      const lang = (session.language || 'en').startsWith('ta') ? 'ta' : (session.language || 'en').startsWith('hi') ? 'hi' : 'en';
      let replyText = "Yes, I can hear you clearly! Tell me what is happening with your AC.";
      if (lang === 'ta') {
        replyText = "ஆமாங்க, நல்லா கேட்குது! சொல்லுங்க, உங்க AC-ல என்ன பிரச்சனை?";
      } else if (lang === 'hi') {
        replyText = "Haan ji, bilkul sun raha hoon! Bataiye, AC mein kya problem aa rahi hai?";
      }

      const audioMsg: ChatMessage = {
        id: uuid(),
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(audioMsg);
      botMessages.push(audioMsg);
      return { session, botMessages };
    }

    // 4c. Clarification handling for UNKNOWN intents
    // Guard: if the user already received this exact clarification question on the
    // previous turn, do NOT ask it again — fall through to deterministicRouter.route()
    // so the user's new text gets a genuine routing attempt.
    const lastBotText = session.messages.filter(m => m.sender === 'bot').slice(-1)[0]?.text ?? '';
    const clarificationAlreadyAsked =
      cu?.clarificationQuestion?.text &&
      lastBotText.startsWith(cu.clarificationQuestion.text.slice(0, 40));

    if (cu && cu.requiresClarification && cu.clarificationQuestion && !session.diagnosticSessionId && !clarificationAlreadyAsked) {
      const clarifyMsg: ChatMessage = {
        id: uuid(),
        sender: 'bot',
        text: cu.clarificationQuestion.text,
        timestamp: new Date().toISOString(),
        chips: (cu.clarificationQuestion.options || []).map(opt => ({
          label: opt,
          value: opt,
        })),
      };
      session.messages.push(clarifyMsg);
      botMessages.push(clarifyMsg);
      return { session, botMessages };
    }

    const lastBotMessage = session.messages.filter(m => m.sender === 'bot').slice(-1)[0];
    const hasStartDiagChip = lastBotMessage?.chips?.some(c => c.value === 'START_ERROR_DIAG' || c.issueId);
    const startChip = lastBotMessage?.chips?.find(c => c.value === 'START_ERROR_DIAG');

    const isBookingRequested =
      input.specialAction === 'BOOK_TECH' ||
      input.specialAction === 'NAV_BOOKING' ||
      (cu && cu.intent.primary === 'BOOKING' && cu.intent.confidence >= 0.7) ||
      /\b(book|schedule|call|send|arrange|need|want|request|get)\b[\s\S]{0,30}\b(technician|tech|mechanic|engineer|expert|service|repair|visit|appointment)\b/i.test(text) ||
      (hasStartDiagChip && /\b(book|service|technician|2|second|option 2)\b/i.test(text));

    if (isBookingRequested) {
      if (input.specialAction === 'NAV_BOOKING') {
        const bookMsg = buildEscalateToBookingMessage(session, 'Certainly, opening the technician booking form with your diagnostic findings attached.');
        session.messages.push(bookMsg);
        botMessages.push(bookMsg);
        return { session, botMessages };
      }

      let bookingReason = 'Customer requested technician visit.';

      // If customer was in an active diagnostic tree and also provided an observation in this message,
      // record that observation into the session history/evidence!
      if (session.diagnosticSessionId && session.issueId) {
        const tree = getTree(session.issueId);
        const currentNode = tree?.nodes.find((n) => n.id === session.currentNodeId);
        if (currentNode && text) {
          const optMatch = await groqService.resolveOption(
            text,
            currentNode.text_en,
            (currentNode.options || []).map((o, idx) => ({ label: o.label, index: idx }))
          );
          if (optMatch.selectedIndex !== null && optMatch.selectedIndex >= 0) {
            const next = nextStep(session.diagnosticSessionId, optMatch.selectedIndex);
            if (!('error' in next)) {
              session.currentNodeId = next.nodeId;
              const answeredOpt = currentNode.options[optMatch.selectedIndex];
              bookingReason = `${tree?.title || 'Diagnostic'} - ${currentNode.text_en}: ${answeredOpt.label}`;
            }
          }
        }
      }

      const bookMsg = startConversationalBooking(session, bookingReason);
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

    // 5. If issueId is passed directly (e.g. from clicking a starter chip)
    if (input.issueId) {
      const res = chatService.startTreeInChat(sessionId, input.issueId);
      return { session: res.session, botMessages: [res.stepMessage] };
    }

    // 6. Post-Completion Guard
    // If the diagnostic already reached a conclusion/resolution, handle booking/scheduling conversationally
    if (session.isCompleted) {
      if (
        input.specialAction === 'BOOK_TECH' ||
        input.specialAction === 'NAV_BOOKING' ||
        /\b(book|schedule|technician|service|visit|repair|appointment)\b/i.test(text)
      ) {
        if (input.specialAction === 'NAV_BOOKING') {
          const bookMsg = buildEscalateToBookingMessage(session, 'Opening the service booking form with your diagnostic findings attached.');
          session.messages.push(bookMsg);
          botMessages.push(bookMsg);
          return { session, botMessages };
        }

        const bookMsg = startConversationalBooking(session);
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
        const bookMsg = startConversationalBooking(session, agentAction.reason);
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

      if (agentAction.type === 'ask_diagnostic_clarification') {
        const clarifyMsg: ChatMessage = {
          id: uuid(),
          sender: 'bot',
          text: agentAction.clarificationQuestion,
          timestamp: new Date().toISOString(),
          chips: [
            { label: '📅 Book Technician', value: 'BOOK_TECH' },
            { label: '🔄 Start New Diagnostic', value: 'RESTART' },
          ],
        };
        session.messages.push(clarifyMsg);
        botMessages.push(clarifyMsg);
        return { session, botMessages };
      }

      if (agentAction.type === 'conversational_response') {
        const replyMsg: ChatMessage = {
          id: uuid(),
          sender: 'bot',
          text: agentAction.reply,
          timestamp: new Date().toISOString(),
          chips: [
            { label: '📅 Book Technician', value: 'BOOK_TECH' },
            { label: '🔄 Start New Diagnostic', value: 'RESTART' },
          ],
        };
        session.messages.push(replyMsg);
        botMessages.push(replyMsg);
        return { session, botMessages };
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
                  targetStepMsg.text = `Let's troubleshoot your **${targetTree.title}**:\n\n${targetStepMsg.text}`;
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

        // B. Mid-dialogue Symptom Correction / Dynamic Tree Switch
        if (text) {
          const isSymptomCorrection = /\b(sorry|actually|no wait|wait|instead|wrong issue|not this|different issue|different problem)\b/i.test(text);
          const switchRoute = deterministicRouter.route(text, { appliance_type: session.appliance, model: session.model, language: session.language });
          const [switchRawTreeId, switchTargetNodeId] = (switchRoute?.targetId || '').includes('.')
            ? (switchRoute?.targetId || '').split('.')
            : [switchRoute?.targetId || '', undefined];
          const switchCanonicalTreeId = normalizeAcIssueId(switchRawTreeId) || switchRawTreeId.toUpperCase();

          const isNodeOrTreeSwitch = switchCanonicalTreeId !== tree.issue_id ||
            (switchTargetNodeId && session.currentNodeId !== switchTargetNodeId);

          if (
            switchRoute &&
            switchRoute.route === 'SYMPTOM_TROUBLESHOOTING' &&
            switchRoute.targetId &&
            isNodeOrTreeSwitch &&
            (isSymptomCorrection || switchRoute.confidence >= 0.85)
          ) {
            const res = chatService.startTreeInChat(sessionId, switchRoute.targetId);
            let localizedStart = res.stepMessage.text;
            if (session.language && session.language !== 'en') {
              localizedStart = await getLocalizedText(localizedStart, session.language);
            }
            const topicName = treeIndexService.getTopicTitle(switchRoute.targetId, session.language);
            const ack = session.language === 'ta'
              ? `சரிங்க, ${topicName} பிரச்சனையை check பண்ணலாம்.`
              : session.language === 'hi'
              ? `Theek hai, ${topicName} ki problem check karte hain.`
              : `Understood, let's troubleshoot the ${topicName} issue:`;
            res.stepMessage.text = `${ack}\n\n${localizedStart}`;
            return { session: res.session, botMessages: [res.stepMessage] };
          }
        }

        // C. Pure LLM Structural Tool Calling (Qwen 3.8-27b via Groq)
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
            let next = nextStep(session.diagnosticSessionId, agentAction.optionIndex);
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
                    targetStepMsg.text = `${agentAction.conversationalReply}\n\nSince this points to an issue with **${targetTree.title}**, let's check that next:\n\n${localizedTarget}`;
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

              // Dynamic Lookahead for Compound User Observations:
              // If the user's message also answered the newly arrived node, auto-advance without repeating!
              let lookaheadRounds = 0;
              while (
                !session.isCompleted &&
                next.kind === 'question' &&
                next.options &&
                next.options.length > 0 &&
                lookaheadRounds < 2
              ) {
                const lookaheadMatch = await groqService.resolveOption(
                  text,
                  next.questionTextEn || '',
                  next.options.map((o) => ({ label: o.label, index: o.index }))
                );
                if (
                  lookaheadMatch.selectedIndex !== null &&
                  lookaheadMatch.selectedIndex >= 0 &&
                  lookaheadMatch.confidence >= 0.8
                ) {
                  const advanced = nextStep(session.diagnosticSessionId, lookaheadMatch.selectedIndex);
                  if (!('error' in advanced)) {
                    next = advanced;
                    session.currentNodeId = next.nodeId;
                    if (next.kind === 'conclusion' || next.kind === 'resolution') {
                      session.isCompleted = true;
                    }
                    lookaheadRounds++;
                    continue;
                  }
                }
                break;
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
            // Commit any active troubleshooting check answered in this turn
            if (
              agentAction.matchedCurrentOptionIndex !== undefined &&
              agentAction.matchedCurrentOptionIndex >= 0 &&
              agentAction.matchedCurrentOptionIndex < (currentNode.options || []).length
            ) {
              const next = nextStep(session.diagnosticSessionId, agentAction.matchedCurrentOptionIndex);
              if (!('error' in next)) {
                session.currentNodeId = next.nodeId;
              }
            }
            const bookMsg = buildEscalateToBookingMessage(session, agentAction.conversationalReply, agentAction.reason);
            session.messages.push(bookMsg);
            botMessages.push(bookMsg);
            return { session, botMessages };
          }

          // Action 5: Natural conversational response
          if (agentAction.type === 'conversational_response') {
            // Check if user's input actually matches an active tree option
            const fallbackOpt = await groqService.resolveOption(text, currentNode.text_en, mappedOptions);
            if (
              fallbackOpt.selectedIndex !== null &&
              fallbackOpt.selectedIndex >= 0 &&
              fallbackOpt.selectedIndex < (currentNode.options || []).length
            ) {
              let next = nextStep(session.diagnosticSessionId, fallbackOpt.selectedIndex);
              if (!('error' in next)) {
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
                      targetStepMsg.text = `${agentAction.reply}\n\nSince this points to an issue with **${targetTree.title}**, let's check that next:\n\n${localizedTarget}`;
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

                // Dynamic Lookahead for Compound User Observations in fallback resolution
                let lookaheadRounds = 0;
                while (
                  !session.isCompleted &&
                  next.kind === 'question' &&
                  next.options &&
                  next.options.length > 0 &&
                  lookaheadRounds < 2
                ) {
                  const lookaheadMatch = await groqService.resolveOption(
                    text,
                    next.questionTextEn || '',
                    next.options.map((o) => ({ label: o.label, index: o.index }))
                  );
                  if (
                    lookaheadMatch.selectedIndex !== null &&
                    lookaheadMatch.selectedIndex >= 0 &&
                    lookaheadMatch.confidence >= 0.8
                  ) {
                    const advanced = nextStep(session.diagnosticSessionId, lookaheadMatch.selectedIndex);
                    if (!('error' in advanced)) {
                      next = advanced;
                      session.currentNodeId = next.nodeId;
                      if (next.kind === 'conclusion' || next.kind === 'resolution') {
                        session.isCompleted = true;
                      }
                      lookaheadRounds++;
                      continue;
                    }
                  }
                  break;
                }

                const stepMsg = convertStepToChatMessage(next, tree);
                let localizedQuestion = stepMsg.text;
                if (session.language && session.language !== 'en') {
                  localizedQuestion = await getLocalizedText(localizedQuestion, session.language);
                }
                const optLabel = currentNode.options[fallbackOpt.selectedIndex]?.label || 'your observation';
                const cleanOpt = optLabel.toLowerCase().replace(/\s*\(.*\)/, '').replace(/^[0-9.]+\s*/, '');
                const naturalAck = `Got it, ${cleanOpt}.`;
                stepMsg.text = `${naturalAck}\n\n${localizedQuestion}`;
                session.messages.push(stepMsg);
                botMessages.push(stepMsg);
                return { session, botMessages };
              }
            }

            // If truly conversational and not matching any option,
            // never leave the user stranded without options or the question!
            const currentStepMsg = convertStepToChatMessage(
              {
                nodeId: currentNode.id,
                kind: 'question',
                questionTextEn: currentNode.text_en,
                questionTextHi: currentNode.text_hi,
                options: (currentNode.options || []).map((opt, i) => ({ label: opt.label, index: i })),
              },
              tree
            );
            let localizedCurrent = currentStepMsg.text;
            if (session.language && session.language !== 'en') {
              localizedCurrent = await getLocalizedText(localizedCurrent, session.language);
            }
            currentStepMsg.text = `${agentAction.reply}\n\n${localizedCurrent}`;
            session.messages.push(currentStepMsg);
            botMessages.push(currentStepMsg);
            return { session, botMessages };
          }

          // Action 6: Switch symptom tree ONLY if user explicitly stated a new symptom
          if (agentAction.type === 'start_diagnostic_tree') {
            const explicitSwitchPatterns = /\b(different|another|also|leaking|leak|water|dripping|mcb|trip|tripping|spark|smell|odor|noise|sound|vibration|remote)\b/i;
            const isExplicitSwitch = explicitSwitchPatterns.test(text) && agentAction.treeId !== tree.issue_id;

            if (isExplicitSwitch) {
              const res = chatService.startTreeInChat(sessionId, agentAction.treeId);
              let localizedStart = res.stepMessage.text;
              if (session.language && session.language !== 'en') {
                localizedStart = await getLocalizedText(localizedStart, session.language);
              }
              res.stepMessage.text = `${agentAction.conversationalReply}\n\n${localizedStart}`;
              return { session: res.session, botMessages: [res.stepMessage] };
            }
          }

          // Safe Active Tree Node Fallback:
          // Keep user grounded in the active question without dropping to generic root routing
          const currentStepMsg = convertStepToChatMessage(
            {
              nodeId: currentNode.id,
              kind: 'question',
              questionTextEn: currentNode.text_en,
              questionTextHi: currentNode.text_hi,
              options: (currentNode.options || []).map((opt, i) => ({ label: opt.label, index: i })),
            },
            tree
          );
          let localizedCurrent = currentStepMsg.text;
          if (session.language && session.language !== 'en') {
            localizedCurrent = await getLocalizedText(localizedCurrent, session.language);
          }
          const conversationalPrefix =
            (agentAction as any).conversationalReply ||
            (agentAction as any).reply ||
            "Understood, let's look at this:";
          currentStepMsg.text = `${conversationalPrefix}\n\n${localizedCurrent}`;
          session.messages.push(currentStepMsg);
          botMessages.push(currentStepMsg);
          return { session, botMessages };
        }
      }
    }

    // 8. Deterministic Routing Layer (Pre-RAG Classification)
    if (text) {
      const routeRes: RouteResolution = deterministicRouter.route(text, {
        model: session.model,
        audience: 'customer',
        appliance_type: session.appliance,
        language: session.language,
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
              label: c.description,
              value: c.treeId,
              issueId: c.treeId,
            }));

            if (!candidateChips.some((c) => c.issueId === canonicalId)) {
              candidateChips.unshift({
                label: `❄️ ${tree.title}`,
                value: canonicalId,
                issueId: canonicalId,
              });
            }

            const reconfSymptomMsg: ChatMessage = {
              id: uuid(),
              sender: 'bot',
              text: `It sounds like your air conditioner may be having an issue (e.g. cooling or outdoor fan).\n\nPlease confirm what you're noticing most:`,
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
              text: `It sounds like you're experiencing a **${tree.title.toLowerCase()}**. Let's check a few quick things step by step:`,
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
        const [rawTargetTreeId] = routeRes.targetId.includes('.') ? routeRes.targetId.split('.') : [routeRes.targetId];
        const canonicalId = normalizeAcIssueId(rawTargetTreeId) || rawTargetTreeId;
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

          const res = chatService.startTreeInChat(sessionId, routeRes.targetId);
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
