/**
 * LLM Structural Tool-Calling Diagnostic Agent
 *
 * Uses Qwen (qwen/qwen3.8-27b via Groq) with native Tool Calling (function calling)
 * to intelligently analyze spoken and typed user utterances against LG Air Conditioner
 * diagnostic trees with ZERO hardcoding or regex matching.
 *
 * Traverses AC01 - AC16 decision trees dynamically and formats conversational
 * responses asking the next question directly to the user.
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export interface ActiveDiagnosticContext {
  model?: string;
  appliance?: string;
  language?: string; // 'ta', 'hi', or 'en'
  activeTree?: {
    issueId: string;
    title: string;
    currentNodeId: string;
    questionText: string;
    options: Array<{ label: string; index: number }>;
  };
  recentHistory?: Array<{ sender: 'user' | 'bot'; text: string }>;
}

export type DiagnosticAgentAction =
  | {
      type: 'advance_diagnostic_step';
      optionIndex: number;
      conversationalReply: string;
      reasoning: string;
    }
  | {
      type: 'start_diagnostic_tree';
      treeId: string;
      conversationalReply: string;
      reasoning: string;
    }
  | {
      type: 'ask_diagnostic_clarification';
      clarificationQuestion: string;
      explanation: string;
    }
  | {
      type: 'lookup_error_code';
      errorCode: string;
      conversationalReply: string;
    }
  | {
      type: 'escalate_to_booking';
      reason: string;
      conversationalReply: string;
    }
  | {
      type: 'conversational_response';
      reply: string;
    };

const GROQ_API_KEY = process.env.GROQ_API_KEY;
let _groqClient: Groq | null = null;
if (GROQ_API_KEY && GROQ_API_KEY.startsWith('gsk_')) {
  _groqClient = new Groq({ apiKey: GROQ_API_KEY });
}

// Model identifier on Groq LPU
const ORCHESTRATOR_MODEL = 'qwen/qwen3.8-27b';

// Available Diagnostic Trees reference for start_diagnostic_tree
const TREE_CATALOG = [
  { id: 'AC01', title: 'Cooling Performance / Not Cooling / Blowing Warm Air' },
  { id: 'AC02', title: 'Power Failure / Not Turning On / No Display' },
  { id: 'AC03', title: 'MCB Tripping / Circuit Breaker / Electrical Safety' },
  { id: 'AC04', title: 'Indoor Water Leakage / Dripping from Unit' },
  { id: 'AC05', title: 'Abnormal Odor / Bad Smell / Burning Smell' },
  { id: 'AC06', title: 'Abnormal Noise / Vibration / Rattling' },
  { id: 'AC07', title: 'Airflow / Fan Blower Issues' },
  { id: 'AC08', title: 'Remote Control Malfunction / Remote Not Working' },
  { id: 'AC09', title: 'Ice Formation / Pipe Freezing / Frost' },
  { id: 'AC10', title: 'Compressor Frequent Cycling / Starting and Stopping' },
  { id: 'AC11', title: 'Display / LED Lights Blinking' },
  { id: 'AC12', title: 'Air Filter Cleaning & Maintenance' },
  { id: 'AC13', title: 'Temperature Sensor / Thermistor Malfunction' },
  { id: 'AC14', title: 'Cabinet / Front Grille Physical Enclosure' },
  { id: 'AC15', title: 'Smart Connectivity / LG ThinQ Wi-Fi Setup' },
  { id: 'AC16', title: 'Hardware Failure / Emergency Escalation' },
];

/**
 * Builds the native function tool definitions for Groq Chat Completions
 */
function buildTools(hasActiveTree: boolean): Groq.Chat.Completions.ChatCompletionTool[] {
  const tools: Groq.Chat.Completions.ChatCompletionTool[] = [];

  if (hasActiveTree) {
    tools.push({
      type: 'function',
      function: {
        name: 'advance_diagnostic_step',
        description: 'Advance to the next step in the active diagnostic tree when the user\'s response or symptom matches one of the active question options.',
        parameters: {
          type: 'object',
          properties: {
            option_index: {
              type: 'number',
              description: 'The 0-based index of the matching option from the active question options list.',
            },
            conversational_reply: {
              type: 'string',
              description: 'A warm, empathetic, natural acknowledgment of what the user observed (e.g. "I understand your AC is turning on and lights are visible, but it\'s blowing warm air."). Do NOT mention option numbers or indices.',
            },
            reasoning: {
              type: 'string',
              description: 'Brief technical explanation of why this option matches the user\'s spoken or typed symptom.',
            },
          },
          required: ['option_index', 'conversational_reply'],
        },
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'ask_diagnostic_clarification',
        description: 'Ask the user a conversational clarification question when their response is completely unclear, ambiguous, or lacks necessary diagnostic details for the current question.',
        parameters: {
          type: 'object',
          properties: {
            clarification_question: {
              type: 'string',
              description: 'A polite, natural question clarifying what specific symptom or state needs to be checked, without presenting buttons.',
            },
            explanation: {
              type: 'string',
              description: 'Why the user response requires clarification.',
            },
          },
          required: ['clarification_question'],
        },
      },
    });
  } else {
    tools.push({
      type: 'function',
      function: {
        name: 'start_diagnostic_tree',
        description: 'Start a specific diagnostic tree based on the user\'s stated issue or symptom.',
        parameters: {
          type: 'object',
          properties: {
            tree_id: {
              type: 'string',
              description: 'The ID of the diagnostic tree to start (e.g. "AC01" for cooling issues, "AC04" for water leakage).',
            },
            conversational_reply: {
              type: 'string',
              description: 'Warm, natural acknowledgment confirming the symptom and introducing the guided troubleshooting.',
            },
            reasoning: {
              type: 'string',
              description: 'Why this diagnostic tree was selected for the user\'s symptom.',
            },
          },
          required: ['tree_id', 'conversational_reply'],
        },
      },
    });
  }

  // Universal tools available in all states
  tools.push({
    type: 'function',
    function: {
      name: 'lookup_error_code',
      description: 'Look up an error code reported by the user (e.g., CH 05, E1, EC, FL) to begin error-specific guided diagnostics.',
      parameters: {
        type: 'object',
        properties: {
          error_code: {
            type: 'string',
            description: 'The error code mentioned by the user (e.g., "CH 05").',
          },
          conversational_reply: {
            type: 'string',
            description: 'Empathetic response recognizing the error code on the unit.',
          },
        },
        required: ['error_code', 'conversational_reply'],
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'escalate_to_booking',
      description: 'Trigger technician booking when the user requests an authorized technician visit, schedule repair, schedule a service (e.g. "schedule service", "i schedule a service"), or professional assistance.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'The reason why technician booking is being initiated.',
          },
          conversational_reply: {
            type: 'string',
            description: 'Polite confirmation that we are opening technician booking with their details.',
          },
        },
        required: ['reason', 'conversational_reply'],
      },
    },
  });

  return tools;
}

export const diagnosticAgent = {
  /**
   * Process a user utterance via Qwen tool-calling
   */
  processTurn: async (
    userText: string,
    context: ActiveDiagnosticContext
  ): Promise<DiagnosticAgentAction> => {
    if (!_groqClient) {
      console.warn('[DiagnosticAgent] Groq client not configured with valid API key.');
      return {
        type: 'conversational_response',
        reply: `I received your message: "${userText}". How else can I assist with your LG air conditioner?`,
      };
    }

    const hasActiveTree = Boolean(context.activeTree);
    const tools = buildTools(hasActiveTree);

    let systemPrompt = `You are the core Diagnostic Orchestration Agent for LG Air Conditioners (ApplianceCare AI).
Your purpose is to guide the user through accurate, safe, step-by-step diagnostic trees using structured tool calls.
You speak warmly, professionally, and empathetically.

CRITICAL LANGUAGE & CODE-SWITCHING DIRECTIVE:
- When the user speaks in Tamil (or Tanglish) or context.language is 'ta':
  * You MUST formulate conversational_reply, clarification_question, and all direct dialogue in natural, modern conversational code-switched Tamil (Tamil script + common English loanwords).
  * DO NOT use archaic/literary/pure Tamil words (e.g., avoid "வெளிப்புற அலகு காற்று சுழல்கிறதா").
  * Use everyday colloquial phrasing: "Outdoor unit fan சுத்துதா, compressor sound கேக்குதா?", "Air filter-ல dust அடைச்சிருக்கா?", "MCB trip ஆகுதா?", "Remote check பண்ணுங்க".
  * Common technical terms MUST stay in English: AC, Cooling, Remote, Display, Outdoor unit, Fan, Compressor, Filter, MCB, Power, Service, Drain pipe, Sensor, Mode.
- When the user speaks in Hindi (or Hinglish) or context.language is 'hi':
  * Reply in natural everyday code-switched Hindi (Hinglish with Devanagari script or conversational Latin script).
- When the user speaks in English or context.language is 'en':
  * Reply in English.
- NEVER respond in plain English if the user spoke in Tamil or Hindi! Match the user's spoken language code-switch.

CRITICAL INSTRUCTIONS:
- You MUST ALWAYS call one of the available tools. Do not output plain text without a tool call.
- Zero hardcoding: intelligently evaluate the user's natural language, colloquialisms, typos (e.g. "giveing", "wont cold"), and implied information.
- In power checks: If the user says "the ac is not cooling" or "it's blowing warm air" or "fan is running", that IMPLIES the unit is powered on and display lights are working (Option 0 in a power check).
- In remote checks (e.g. asking if AC starts blowing air when pressing remote): If the user says "no it doesn't blow air" or "no response" or "remote doesn't work", that matches the option for "No response to remote".
- In symptoms checks: Map descriptions like "cools for 5 mins then stops" to intermittent cooling; "warm air only" to no cool air; "air is slow" to weak airflow.
- If an error code is stated (e.g. "CH 05", "CH 01"), call lookup_error_code.
- If the user asks to schedule a service, book a technician, request a visit, or have someone inspect/repair the unit (e.g. "schedule service", "i schedule a service", "book technician", "schedule a visit", "yes book it"), you MUST call escalate_to_booking.`;

    if (hasActiveTree && context.activeTree) {
      systemPrompt += `\n\nCURRENT ACTIVE DIAGNOSTIC CONTEXT:
Tree ID: ${context.activeTree.issueId} (${context.activeTree.title})
Current Node: ${context.activeTree.currentNodeId}
Active Question: "${context.activeTree.questionText}"
Available Options:
${context.activeTree.options.map((opt) => `${opt.index}: "${opt.label}"`).join('\n')}

Rules for Active Tree:
- If the user's statement matches or reasonably implies any of the above options, call 'advance_diagnostic_step' with that option_index.
- If the user's statement is completely unrelated or impossible to map to any option, call 'ask_diagnostic_clarification'.`;
    } else {
      systemPrompt += `\n\nAVAILABLE DIAGNOSTIC TREES CATALOG:
${TREE_CATALOG.map((t) => `${t.id}: ${t.title}`).join('\n')}

Rules for Starting Diagnosis:
- If the user describes a symptom matching any tree (e.g., cooling trouble, water dripping, tripping breaker), call 'start_diagnostic_tree' with the corresponding tree_id.`;
    }

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add recent context history if available
    if (context.recentHistory && context.recentHistory.length > 0) {
      for (const msg of context.recentHistory.slice(-4)) {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }
    }

    messages.push({
      role: 'user',
      content: userText,
    });

    try {
      const response = await _groqClient.chat.completions.create({
        model: ORCHESTRATOR_MODEL,
        messages,
        tools,
        tool_choice: 'required',
        temperature: 0.1,
        max_tokens: 450,
      });

      const choice = response.choices[0];
      const toolCalls = choice?.message?.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // Fallback if model answered with content instead of tool
        const content = choice?.message?.content || '';
        return {
          type: 'conversational_response',
          reply: content || 'Could you please specify your observation in a bit more detail?',
        };
      }

      const primaryCall = toolCalls[0];
      const fnName = primaryCall.function.name;
      const args = JSON.parse(primaryCall.function.arguments || '{}');

      switch (fnName) {
        case 'advance_diagnostic_step':
          return {
            type: 'advance_diagnostic_step',
            optionIndex: typeof args.option_index === 'number' ? args.option_index : 0,
            conversationalReply: args.conversational_reply || 'Understood, let us proceed to the next step.',
            reasoning: args.reasoning || '',
          };

        case 'start_diagnostic_tree':
          return {
            type: 'start_diagnostic_tree',
            treeId: args.tree_id || 'AC01',
            conversationalReply: args.conversational_reply || 'Let us diagnose this issue step by step.',
            reasoning: args.reasoning || '',
          };

        case 'ask_diagnostic_clarification':
          return {
            type: 'ask_diagnostic_clarification',
            clarificationQuestion: args.clarification_question || 'Could you please clarify what you are observing on your AC unit?',
            explanation: args.explanation || '',
          };

        case 'lookup_error_code':
          return {
            type: 'lookup_error_code',
            errorCode: args.error_code || 'CH 05',
            conversationalReply: args.conversational_reply || `Let me check error code ${args.error_code}.`,
          };

        case 'escalate_to_booking':
          return {
            type: 'escalate_to_booking',
            reason: args.reason || 'User requested service booking',
            conversationalReply: args.conversational_reply || 'I am opening the technician booking form for you.',
          };

        default:
          return {
            type: 'conversational_response',
            reply: args.conversational_reply || 'Let us continue troubleshooting your unit.',
          };
      }
    } catch (err: any) {
      console.error('[DiagnosticAgent] Error during LLM tool call:', err.message);
      return {
        type: 'conversational_response',
        reply: 'I understand. Let us check the next step for your air conditioner.',
      };
    }
  },
};
