const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data as T;
}

export const apiClient = {
  // Error codes
  getAllCodes: () =>
    api<{ total: number; codes: ErrorCode[] }>('/api/error-codes'),
  lookupCode: (code: string) =>
    api<{ found: boolean; errorCode?: ErrorCode; message?: string }>(
      `/api/error-codes/${encodeURIComponent(code)}`
    ),
  searchCodes: (q: string) =>
    api<{ results: ErrorCode[] }>(`/api/error-codes/search?q=${encodeURIComponent(q)}`),

  // Diagnostic
  getIssues: () => api<{ issues: IssueInfo[] }>('/api/diagnostic/issues'),
  startDiagnostic: (issueId: string) =>
    api<{ sessionId: string; step: DiagnosticStep }>('/api/diagnostic/start', {
      method: 'POST',
      body: JSON.stringify({ issueId }),
    }),
  nextStep: (sessionId: string, optionIndex: number) =>
    api<{ step: DiagnosticStep }>('/api/diagnostic/next', {
      method: 'POST',
      body: JSON.stringify({ sessionId, optionIndex }),
    }),
  backStep: (sessionId: string) =>
    api<{ step: DiagnosticStep }>('/api/diagnostic/back', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  // Intent Classifier (Laya/Jev alternative)
  classifyQuery: (query: string) =>
    api<{ result: IntentClassificationResult }>('/api/diagnostic/classify', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  // Interactive Conversational Diagnostic Chatbot
  createChatSession: (params?: { sessionId?: string; model?: string; language?: string; appliance?: string }) =>
    api<{ session: ChatSessionData }>('/api/chat/session', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }),
  sendChatMessage: (params: {
    sessionId: string;
    text?: string;
    optionIndex?: number;
    issueId?: string;
    specialAction?: string;
  }) =>
    api<{ session: ChatSessionData; botMessages: ChatMessageItem[] }>('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  resetChatSession: (sessionId: string) =>
    api<{ session: ChatSessionData }>('/api/chat/reset', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  // 10-Technician Scheduling Engine
  getTechnicians: () =>
    api<{ total: number; technicians: TechnicianRecord[] }>('/api/technicians'),
  getAvailableSlots: (date: string) =>
    api<{ date: string; slots: SlotAvailabilityItem[] }>(`/api/technicians/available?date=${encodeURIComponent(date)}`),

  // Multi-Role Auth
  register: (data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    address?: string;
    city?: string;
    pincode?: string;
  }) =>
    api<{ success: boolean; user: UserProfile; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProfile: (data: {
    userId: string;
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    pincode?: string;
  }) =>
    api<{ success: boolean; user: UserProfile; message: string }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  login: (credentials: { email?: string; password?: string; role?: string }) =>
    api<{ success: boolean; user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  createTechnician: (data: { name: string; email: string; password?: string; specialization: string; phone?: string }) =>
    api<{ success: boolean; technician: any; message: string }>('/api/technicians', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Service booking & lifecycle
  bookService: (formData: FormData) =>
    fetch(`${BASE}/api/service/book`, { method: 'POST', body: formData }).then((r) => r.json()),
  getTicket: (ticketId: string, params?: { role?: string; userId?: string; userEmail?: string }) => {
    const q = params ? new URLSearchParams(params as any).toString() : '';
    return api<{ ticket: TicketExtended; hasInvoice: boolean }>(`/api/service/${ticketId}${q ? `?${q}` : ''}`);
  },
  getAllTickets: (params?: { technicianId?: string; status?: string; role?: string; customerId?: string; customerEmail?: string }) => {
    const q = params ? new URLSearchParams(params as any).toString() : '';
    return api<{ total: number; tickets: TicketExtended[] }>(`/api/service${q ? `?${q}` : ''}`);
  },
  updateTicketStatus: (ticketId: string, status: string, technicianNotes?: string) =>
    api<{ success: boolean; ticket: TicketExtended }>(`/api/service/${ticketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, technicianNotes }),
    }),

  // Warranty
  getWarranty: () => api<WarrantyResponse>('/api/warranty'),
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface ErrorCode {
  code: string;
  display: string;
  category: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  customer_action: string;
  technician_action?: string;
  likely_parts: string[];
  safety_flag: boolean;
  aliases?: string[];
}

export interface DiagnosticStep {
  nodeId: string;
  kind: 'question' | 'instruction' | 'conclusion' | 'resolution' | 'redirect';
  questionTextEn?: string;
  questionTextHi?: string;
  options?: Array<{ label: string; index: number }>;
  instruction?: string;
  conclusion?: {
    probable_cause: string;
    confidence?: number;
    parts?: string[];
    priority?: string;
    safety_flag?: boolean;
    technician_note?: string;
  };
  resolutionId?: string;
  redirectIssue?: string;
  safetyFlag?: boolean;
  conclusionId?: string;
}

export interface ChatMessageItem {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  textHi?: string;
  timestamp: string;
  action?: 'NAV_BOOKING';
  bookingContext?: {
    symptom?: string;
    probable_cause?: string;
    parts?: string[];
    priority?: string;
    error_code?: string;
  };
  chips?: Array<{
    label: string;
    labelHi?: string;
    value: string;
    optionIndex?: number;
    issueId?: string;
  }>;
  instruction?: string;
  conclusion?: {
    probable_cause: string;
    confidence?: number;
    parts?: string[];
    priority?: string;
    safety_flag?: boolean;
    technician_note?: string;
  };
  resolutionId?: string;
  safetyAlert?: boolean;
  isResolution?: boolean;
  stepInfo?: {
    issueId: string;
    nodeId: string;
    progress?: number;
  };
}

export interface ChatSessionData {
  sessionId: string;
  diagnosticSessionId?: string;
  issueId?: string;
  currentNodeId?: string;
  language: 'en' | 'hi' | 'ta';
  model: string;
  appliance: string;
  messages: ChatMessageItem[];
  createdAt: string;
  isCompleted: boolean;
}

export interface IssueInfo {
  issue_id: string;
  title: string;
  nodeCount: number;
  conclusionCount: number;
}

export interface IntentClassificationResult {
  type: 'ERROR_CODE' | 'CRITICAL_SAFETY' | 'SYMPTOM_TREE' | 'WARRANTY' | 'MAINTENANCE' | 'AGENTIC_TRIAGE';
  target?: string;
  confidence: number;
  label?: string;
  reason: string;
  suggestedAction?: string;
}

export interface TechnicianRecord {
  id: string;
  name: string;
  employeeCode: string;
  specialization: string;
  certification: string;
  rating: number;
  phone: string;
  activeTickets: number;
  isActive: boolean;
}

export interface SlotAvailabilityItem {
  slot: string;
  availableTechsCount: number;
  technicians: Array<{ id: string; name: string; specialization: string }>;
  isFull: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'technician' | 'admin';
  phone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  specialization?: string;
  employeeCode?: string;
  token: string;
}

export interface TicketExtended {
  ticketId: string;
  status: 'open' | 'in_review' | 'assigned' | 'in_progress' | 'resolved';
  createdAt: string;
  customerName: string;
  contactNumber: string;
  customerEmail?: string;
  customerId?: string;
  serviceAddress: string;
  acModel: string;
  serialNumber?: string;
  reportedIssue: string;
  errorCode?: string;
  diagnosticSummary?: string;
  conclusionId?: string;
  invoiceFile?: string;
  assignedTechnician?: {
    id: string;
    name: string;
  };
  scheduledDate?: string;
  scheduledSlot?: string;
  isAlternativeSlot?: boolean;
  technicianNotes?: string;
}

export type Ticket = TicketExtended;

export interface WarrantyResponse {
  disclaimer: string;
  sections: Record<string, string>;
}
