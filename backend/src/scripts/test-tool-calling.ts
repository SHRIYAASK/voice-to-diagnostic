import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

async function testTools() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const model = 'qwen/qwen3.8-27b';

  const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'advance_diagnostic_step',
        description: 'Advance to the next step in the diagnostic tree when the user answers the current diagnostic question.',
        parameters: {
          type: 'object',
          properties: {
            option_index: {
              type: 'number',
              description: 'The 0-based index of the matching option from the active question options.',
            },
            conversational_reply: {
              type: 'string',
              description: 'A warm, natural, empathetic acknowledgment of what the user reported, without robotic repetitions or mentioning option indices.',
            },
            reasoning: {
              type: 'string',
              description: 'Brief reason why this option was chosen based on the user utterance.',
            },
          },
          required: ['option_index', 'conversational_reply'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ask_diagnostic_clarification',
        description: 'Ask the user a helpful clarification question when their response is completely unclear, unrelated, or lacks necessary diagnostic details.',
        parameters: {
          type: 'object',
          properties: {
            clarification_question: {
              type: 'string',
              description: 'A helpful question clarifying what specific symptom or state needs to be checked.',
            },
            explanation: {
              type: 'string',
              description: 'Why the user response was unclear or needs clarification.',
            },
          },
          required: ['clarification_question'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lookup_error_code',
        description: 'Look up an error code reported by the user (e.g., CH 05, E1, EC) to start an error diagnostic flow.',
        parameters: {
          type: 'object',
          properties: {
            error_code: {
              type: 'string',
              description: 'The error code observed (e.g., CH 05).',
            },
            conversational_reply: {
              type: 'string',
              description: 'Empathetic response explaining what error code was recognized.',
            },
          },
          required: ['error_code', 'conversational_reply'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'escalate_to_booking',
        description: 'Trigger technician booking when the user explicitly requests a technician visit or service booking.',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Reason for booking service.',
            },
            conversational_reply: {
              type: 'string',
              description: 'Polite confirmation that we are opening technician booking.',
            },
          },
          required: ['reason', 'conversational_reply'],
        },
      },
    },
  ];

  const testCases = [
    {
      question: 'Is the AC turning on and showing lights on the display?',
      options: ['Yes, display lights are on and unit beeps/turns on', 'No, unit is completely dead with no lights'],
      userAnswer: 'the ac is not giveing cool air',
    },
    {
      question: 'What specific cooling symptom are you observing?',
      options: [
        'No cool air / Only warm air blowing',
        'Weak or slightly cool airflow',
        'Cooling starts and stops intermittently',
        'Temperature never reaches set temperature',
      ],
      userAnswer: 'it starts cooling for 5 minutes then stops completely',
    },
    {
      question: 'Check the front display for any blinking code.',
      options: ['No code', 'Code blinking'],
      userAnswer: 'i see error code ch 05 blinking on the panel',
    },
  ];

  for (const tc of testCases) {
    console.log('\n--- Testing User Answer:', tc.userAnswer);
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert appliance diagnostic orchestrator for LG Air Conditioners.
Your job is to understand the user's natural language or spoken utterance and call the appropriate tool.
Current Diagnostic Context:
Active Question: "${tc.question}"
Available Options:
${tc.options.map((opt, i) => `${i}: "${opt}"`).join('\n')}

CRITICAL INSTRUCTIONS:
- You MUST ALWAYS call one of the tools. Do NOT respond with plain text without calling a tool.
- If the user's statement implies that the unit is powered or operating (e.g., they say it is not cooling, blowing warm air, or fan is running), that means the unit is powered on (option 0 for power check).
- Call advance_diagnostic_step with the matching option_index when the user provides an answer or symptom that aligns with one of the options.
- If the user's response does not match any option and lacks necessary information, call ask_diagnostic_clarification.
- Call lookup_error_code if an error code is stated.
- Call escalate_to_booking if they ask to book service.`,
      },
      {
        role: 'user',
        content: tc.userAnswer,
      },
    ];

    const response = await groq.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: 'required',
      temperature: 0.1,
    });

    const choice = response.choices[0];
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      for (const call of choice.message.tool_calls) {
        console.log(`Tool called: ${call.function.name}`);
        console.log(`Arguments: ${call.function.arguments}`);
      }
    } else {
      console.log('No tool called, text:', choice.message.content);
    }
  }
}

testTools().catch((e) => console.error('Error:', e));
