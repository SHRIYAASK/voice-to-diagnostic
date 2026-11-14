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

import { createGroqClient, GroqChatClient } from './groqClient';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { groqService } from './groqService';
import { deterministicRouter } from './deterministicRouter';
import { treeIndexService } from './treeIndexService';

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
      preemptedObservations?: string[];
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
      matchedCurrentOptionIndex?: number;
    }
  | {
      type: 'conversational_response';
      reply: string;
    };

// Shared client with automatic failover to GROQ_API_KEY_2 when the primary key is rate limited
const _groqClient: GroqChatClient | null = createGroqClient();

// Model identifier on Groq LPU
const ORCHESTRATOR_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

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
              description: 'A warm, empathetic, natural human acknowledgment of what the user observed (e.g. "Got it, no lights are visible on the display." or "Understood, your appliance is not cooling."). NEVER use repetitive templates or generic filler phrases. Do NOT mention option numbers or indices.',
            },
            reasoning: {
              type: 'string',
              description: 'Brief explanation of why this option matches the user\'s spoken or typed symptom.',
            },
            preempted_observations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Any additional troubleshooting facts or observations the user explicitly mentioned in this utterance that answer upcoming questions.',
            },
          },
          required: ['option_index', 'conversational_reply'],
        },
      },
    });
  }

  // start_diagnostic_tree is available in all states (starts initial tree or switches tree on symptom correction)
  tools.push({
    type: 'function',
    function: {
      name: 'start_diagnostic_tree',
      description: 'Start or switch to a specific diagnostic tree based on the user\'s stated issue or corrected symptom (e.g. "AC03" for MCB tripping, "AC01" for cooling issues, "AC04" for water leakage). Call this whenever the user introduces or corrects to a different problem.',
      parameters: {
        type: 'object',
        properties: {
          tree_id: {
            type: 'string',
            description: 'The ID of the diagnostic tree to start or switch to (e.g. "AC03" for MCB tripping, "AC01" for cooling issues, "AC04" for water leakage).',
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

  // Universal tools available in all states
  tools.push({
    type: 'function',
    function: {
      name: 'ask_diagnostic_clarification',
      description: 'Ask the user a conversational clarification question when their response is unclear, ambiguous, audio trouble (e.g. "cannot hear you"), or lacks necessary diagnostic details.',
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
      description: 'Trigger technician booking when the user requests an authorized technician visit, schedule repair, schedule a service, call someone, or professional assistance at ANY point (including in compound utterances like "the filter is clean and book me a technician").',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'The reason why technician booking is being initiated, including any observations made by the customer.',
          },
          conversational_reply: {
            type: 'string',
            description: 'Polite, empathetic confirmation acknowledging what they observed and confirming we are opening technician booking with their details.',
          },
          matched_current_option_index: {
            type: 'number',
            description: 'If the customer also answered the active troubleshooting question in the same breath (e.g., "filter is clean and book a tech"), the 0-based option index for that answer so it is recorded into history.',
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
      console.warn('[DiagnosticAgent] Groq client not configured or unavailable. Using deterministic fallback.');
      if (context.activeTree && context.activeTree.options && context.activeTree.options.length > 0) {
        const res = await groqService.resolveOption(
          userText,
          context.activeTree.questionText,
          context.activeTree.options
        );
        if (res.selectedIndex !== null && res.selectedIndex >= 0 && res.selectedIndex < context.activeTree.options.length) {
          const optLabel = context.activeTree.options[res.selectedIndex]?.label || 'your observation';
          const cleanOpt = optLabel.toLowerCase().replace(/\s*\(.*\)/, '').replace(/^[0-9.]+\s*/, '');
          return {
            type: 'advance_diagnostic_step',
            optionIndex: res.selectedIndex,
            conversationalReply: `Got it, ${cleanOpt}.`,
            reasoning: res.rationale,
          };
        }
      }
      if (!context.activeTree) {
        const route = deterministicRouter.route(userText, { appliance_type: context.appliance, model: context.model });
        if (route.targetId) {
          return {
            type: 'start_diagnostic_tree',
            treeId: route.targetId,
            conversationalReply: 'Let us diagnose this issue step by step.',
            reasoning: route.rationale,
          };
        }
      }
      return {
        type: 'conversational_response',
        reply: `Could you please clarify what you are observing with your air conditioner?`,
      };
    }

    const hasActiveTree = Boolean(context.activeTree);
    const tools = buildTools(hasActiveTree);

    let systemPrompt = `You are the core Diagnostic Orchestration Agent for LG Air Conditioners (ApplianceCare AI).
Your purpose is to guide the user through accurate, safe, step-by-step diagnostic trees using structured tool calls.
You speak warmly, professionally, and empathetically.`;

    systemPrompt += `\n\nCRITICAL PRIORITY RULE — CUSTOMER SERVICE & TECHNICIAN BOOKING:
- Customer service or technician booking requests ALWAYS take priority over optional troubleshooting questions.
- If the customer asks for a technician, repair, service visit, or expert assistance at ANY point (e.g. "book me a technician", "please send someone", "need a repair", "schedule a service", "call a tech"), you MUST IMMEDIATELY call 'escalate_to_booking'.
- If the customer also reported an answer to the current troubleshooting question in the same breath (e.g. "the air filter is clean and book me a technician"), capture that answer in 'matched_current_option_index', summarize it in 'reason', and acknowledge it warmly in 'conversational_reply'.
- NEVER continue troubleshooting or force more questions once a technician is requested!

CRITICAL CONVERSATIONAL & CHAIN-OF-THOUGHT RULES:
1. Remember all customer answers: The customer may provide multiple details or compound thoughts in one sentence.
2. Preempted observations: When the customer's utterance answers the current question AND provides details answering upcoming checks:
   - Call 'advance_diagnostic_step' with the current question's option_index.
   - Put the other confirmed facts into 'preempted_observations'.
3. NATURAL, DYNAMIC ACKNOWLEDGMENT:
   - Provide a concise, empathetic acknowledgment reflecting the customer's specific observation in natural language.
   - NEVER use robotic canned templates or repeat static generic filler sentences across turns.
   - Never output internal IDs, node names, or option numbers.
4. One question at a time: The engine will ask the next unanswered question. Your 'conversational_reply' should ONLY acknowledge what the user said; the system will attach the next question.
5. No technical jargon: Never mention internal IDs ("AC01", "REF01", "Tree ID", "Node ID"). Speak in plain, friendly customer language.

CRITICAL PUBLIC-FACING NATURAL LANGUAGE DIRECTIVE:
- NEVER mention internal diagnostic IDs in customer dialogue.
- Refer to the appliance naturally as "your air conditioner" rather than spelling out internal codes.

MANDATORY CODE-SWITCHED SPEAKING POLICY — APPLIANCECARE AI:
You MUST ALWAYS speak in a natural, fluid conversational style with genuine everyday code-switching.
This is a permanent speaking policy, not an optional language mode.

Linguistic Guidelines (Zero Static Scripting):
1. For Tamil-speaking customers, speak in natural everyday Tamil mixed with English (Tanglish). Never use formal, bookish, or literary Tamil.
2. For Hindi-speaking customers, speak in natural everyday conversational Hindi mixed with English (Hinglish). Never use formal, pure, or textbook Hindi.
3. For English-speaking customers, use natural Indian conversational English.
4. Keep common appliance and technical terminology strictly in English, including cooling, compressor, fan, remote, display, filter, outdoor unit, temperature, voltage, MCB, PCB, and drain pipe. Embed them naturally in the local sentence structure.
5. Formulate responses dynamically and contextually based on the customer's exact words. Never repeat static scripted phrases across turns.
6. Acknowledge what the customer said with natural human empathy, and ask only ONE diagnostic question at a time.
7. Keep responses short and easy to understand when spoken aloud.
8. Do not announce the language you detected, and do not recite internal model numbers or technical IDs.
9. If the customer explicitly asks for Tamil, Tanglish, Hindi, Hinglish, or English, change the base language dynamically while retaining natural code-switching.

Technical and safety rules:
- Preserve the meaning of diagnostic-tree questions.
- Never invent symptoms, error codes or appliance specifications.
- Never bypass the deterministic diagnostic engine or safety policies.
- Do not provide unsafe electrical, refrigerant or high-voltage DIY instructions.

Return only the response intended to be spoken aloud.

CRITICAL INSTRUCTIONS:
- You MUST ALWAYS call one of the available tools. Do not output plain text without a tool call.
- Tool function names MUST match exact identifiers with underscores: 'advance_diagnostic_step', 'start_diagnostic_tree', 'ask_diagnostic_clarification', 'lookup_error_code', 'escalate_to_booking'. NEVER use spaces in function names.
- Zero hardcoding: intelligently evaluate the user's natural language, colloquialisms, typos, and implied information.`;

    if (hasActiveTree && context.activeTree) {
      systemPrompt += `\n\nCURRENT ACTIVE DIAGNOSTIC CONTEXT:
Tree ID: ${context.activeTree.issueId} (${context.activeTree.title})
Current Node: ${context.activeTree.currentNodeId}
Active Question: "${context.activeTree.questionText}"
Available Options:
${context.activeTree.options.map((opt) => `${opt.index}: "${opt.label}"`).join('\n')}

Rules for Active Tree:
- If the user's statement matches or reasonably implies any of the above options, call 'advance_diagnostic_step' with that option_index.
- If the user corrects or changes their symptom (e.g. "sorry it's MCB tripping", "actually water is leaking", "fuse blown"), call 'start_diagnostic_tree' with the corresponding tree_id (e.g. "AC03" for MCB tripping, "AC04" for water leakage).
- If the user's statement is completely unrelated or impossible to map to any option, call 'ask_diagnostic_clarification'.

AVAILABLE DIAGNOSTIC TREES CATALOG (for cross-tree symptom switches):
${treeIndexService.getCatalog(context.appliance).map((t) => `${t.id}: ${t.title}`).join('\n')}`;
    } else {
      systemPrompt += `\n\nAVAILABLE DIAGNOSTIC TREES CATALOG:
${treeIndexService.getCatalog(context.appliance).map((t) => `${t.id}: ${t.title}`).join('\n')}

Rules for Starting Diagnosis:
- If the user describes a symptom matching any tree, call 'start_diagnostic_tree' with the corresponding tree_id.
- If the user's utterance is unclear, ambiguous, a greeting, audio trouble, or does not describe a clear symptom, call 'ask_diagnostic_clarification' to politely clarify what issue they are experiencing with their air conditioner.`;
    }

    // CONVERSATION MEMORY: everything the customer has reported so far, so the agent never loses the thread
    // (the short message window below can scroll the original problem out of view).
    const allHistory = context.recentHistory || [];
    const customerStatements = allHistory
      .filter((m) => m.sender === 'user' && m.text && m.text.trim())
      .map((m) => m.text.trim().slice(0, 200));
    const lastConclusion = [...allHistory]
      .reverse()
      .find((m) => m.sender === 'bot' && /probable cause/i.test(m.text || ''));
    if (customerStatements.length > 0) {
      systemPrompt += `

CONVERSATION MEMORY (what the customer has told you so far, oldest first):
${customerStatements.slice(-10).map((t, i) => `${i + 1}. "${t}"`).join(String.fromCharCode(10))}
${lastConclusion ? `
Last diagnostic conclusion given to the customer: ${lastConclusion.text.replace(/\s+/g, ' ').slice(0, 300)}` : ''}

MEMORY RULES:
- The customer's reported problem stays the topic until THEY clearly change it. Short answers ("yes", "the power button", "completely unresponsive") are about that same problem, never a new one.
- NEVER say "let's start fresh", "start over" or ask the customer to repeat or re-describe the problem they already told you. Use the memory above.
- If the customer disputes or refines your conclusion ("you are wrong", "only one button is not working"), accept it, keep the same problem, and ask ONE specific follow-up that narrows it down.
- If the customer asks what they told you before, briefly recap it from the memory above.`;
    }

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add recent context history if available
    if (context.recentHistory && context.recentHistory.length > 0) {
      for (const msg of context.recentHistory.slice(-10)) {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: (msg.text || '').slice(0, 600),
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
            conversationalReply: args.conversational_reply || 'Understood, noted.',
            reasoning: args.reasoning || '',
            preemptedObservations: Array.isArray(args.preempted_observations) ? args.preempted_observations : undefined,
          };

        case 'start_diagnostic_tree': {
          let chosenTreeId = (args.tree_id || '').toUpperCase().trim();
          if (!chosenTreeId.startsWith('AC')) {
            chosenTreeId = 'AC01';
          }
          return {
            type: 'start_diagnostic_tree',
            treeId: chosenTreeId,
            conversationalReply: args.conversational_reply || 'Let us diagnose this issue step by step.',
            reasoning: args.reasoning || '',
          };
        }

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
            matchedCurrentOptionIndex: typeof args.matched_current_option_index === 'number' ? args.matched_current_option_index : undefined,
          };

        default:
          return {
            type: 'conversational_response',
            reply: args.conversational_reply || 'Let us continue troubleshooting your unit.',
          };
      }
    } catch (err: any) {
      console.error('[DiagnosticAgent] Error during LLM tool call:', err.message);

      // The model sometimes names a tool that is not in the request (e.g. "ask_clarification"), which Groq rejects
      // with a 400. Its intended question is still in the rejected generation, so use it instead of discarding it.
      const failed: string = err?.error?.error?.failed_generation || err?.error?.failed_generation || '';
      if (err?.status === 400 && failed) {
        const m = failed.match(/<parameter=(?:clarification_question|conversational_reply)>\s*([\s\S]*?)\s*<\/parameter>/);
        if (m && m[1] && m[1].trim().length > 3) {
          return {
            type: 'ask_diagnostic_clarification',
            clarificationQuestion: m[1].trim(),
            explanation: 'Recovered from a malformed tool call.',
          };
        }
      }

      // Deterministic Fallback 0: Check if booking is requested
      if (/\b(book|schedule|call|send|arrange|need|want|request|get)\b[\s\S]{0,30}\b(technician|tech|mechanic|engineer|expert|service|repair|visit|appointment)\b/i.test(userText)) {
        return {
          type: 'escalate_to_booking',
          reason: 'User requested service booking',
          conversationalReply: 'Certainly, opening the technician booking form with your diagnostic findings attached.',
        };
      }

      // Deterministic Fallback 0.5: Check if user is reporting or correcting to a different symptom tree
      if (context.activeTree) {
        const switchRoute = deterministicRouter.route(userText, { appliance_type: context.appliance, model: context.model });
        const isCorrection = /\b(sorry|actually|wait|no wait|instead|not cooling|wrong issue|different issue)\b/i.test(userText);
        if (
          switchRoute.route === 'SYMPTOM_TROUBLESHOOTING' &&
          switchRoute.targetId &&
          switchRoute.targetId !== context.activeTree.issueId &&
          (isCorrection ||
            (switchRoute.confidence >= 0.85 &&
              // A reply that starts like a refinement ("only the power button works") continues the same problem
              !/^(only|just|also|but|and|yes|yeah|no|nope|not really|it|its|it's)\b/i.test(userText.trim())))
        ) {
          return {
            type: 'start_diagnostic_tree',
            treeId: switchRoute.targetId,
            conversationalReply: 'Understood, let us look at that.',
            reasoning: switchRoute.rationale,
          };
        }
      }

      // Deterministic Fallback 1: Resolve active tree option if in active tree
      if (context.activeTree && context.activeTree.options && context.activeTree.options.length > 0) {
        try {
          const fallbackRes = await groqService.resolveOption(
            userText,
            context.activeTree.questionText,
            context.activeTree.options
          );
          if (fallbackRes.selectedIndex !== null && fallbackRes.selectedIndex >= 0 && fallbackRes.selectedIndex < context.activeTree.options.length) {
            const optLabel = context.activeTree.options[fallbackRes.selectedIndex]?.label || 'your observation';
            const cleanOpt = optLabel.toLowerCase().replace(/\s*\(.*\)/, '').replace(/^[0-9.]+\s*/, '');
            const cleanLang = (context.language || 'en').toLowerCase().split(/[-_]/)[0];
            let conversationalReply = `Got it, ${cleanOpt}.`;
            if (cleanLang === 'ta') {
              conversationalReply = `சரி, ${cleanOpt}.`;
            } else if (cleanLang === 'hi') {
              conversationalReply = `ठीक है, ${cleanOpt}.`;
            } else if (cleanLang === 'te') {
              conversationalReply = `సరే, ${cleanOpt}.`;
            } else if (cleanLang === 'kn') {
              conversationalReply = `ಸರಿ, ${cleanOpt}.`;
            } else if (cleanLang === 'ml') {
              conversationalReply = `ശരി, ${cleanOpt}.`;
            } else if (cleanLang === 'bn') {
              conversationalReply = `ঠিক আছে, ${cleanOpt}.`;
            }
            return {
              type: 'advance_diagnostic_step',
              optionIndex: fallbackRes.selectedIndex,
              conversationalReply,
              reasoning: fallbackRes.rationale || 'Resolved via deterministic option matcher fallback.',
            };
          }
        } catch (fbErr) {
          console.error('[DiagnosticAgent] Fallback option matching error:', fbErr);
        }
      }

      // Deterministic Fallback 2: Route initial utterance if no active tree
      if (!context.activeTree) {
        const route = deterministicRouter.route(userText);
        if (route.targetId && route.targetId.startsWith('AC')) {
          return {
            type: 'start_diagnostic_tree',
            treeId: route.targetId,
            conversationalReply: 'Let us diagnose this issue step by step.',
            reasoning: route.rationale,
          };
        }
      }

      return {
        type: 'conversational_response',
        reply: 'Sorry, I had a brief hiccup understanding that. Could you say it once more?',
      };
    }
  },
};
