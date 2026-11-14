import { chatService } from '../engine/chatService';
import dotenv from 'dotenv';

dotenv.config();

async function runE2ETest() {
  console.log('=== Starting E2E LLM Tool-Calling Diagnostic Agent Test ===\n');

  // 1. Create a session and start AC01
  const session = chatService.getOrCreateSession('test-agent-sess-' + Date.now());
  console.log('1. Session initialized:', session.sessionId);

  const startRes = chatService.startTreeInChat(session.sessionId, 'AC01');
  console.log('\n--- Step 1: Diagnosis Started ---');
  console.log('Bot says:\n' + startRes.stepMessage.text);
  console.log('Chips count:', (startRes.stepMessage.chips || []).length);
  if ((startRes.stepMessage.chips || []).length > 0) {
    console.error('FAIL: Expected 0 question chips, found', startRes.stepMessage.chips);
  } else {
    console.log('PASS: Zero option chips under question.');
  }

  // 2. User gives spoken answer with typo and symptom rather than literal "yes"
  console.log('\n--- Step 2: User responds "the ac is not giveing cool air" ---');
  const turn1 = await chatService.processMessage(session.sessionId, {
    text: 'the ac is not giveing cool air',
  });

  const botMsg1 = turn1.botMessages[0];
  console.log('Bot response:\n' + botMsg1?.text);
  console.log('Current node in session:', session.currentNodeId);
  console.log('Chips count:', (botMsg1?.chips || []).length);

  if (session.currentNodeId === 'q2_cooling_symptom') {
    console.log('PASS: Successfully advanced from q1_power_check to q2_cooling_symptom via tool calling!');
  } else {
    console.error('FAIL: Expected q2_cooling_symptom, got', session.currentNodeId);
  }

  // 3. User responds to cooling symptom question with natural description
  console.log('\n--- Step 3: User responds "it starts cooling for 5 minutes then stops completely" ---');
  const turn2 = await chatService.processMessage(session.sessionId, {
    text: 'it starts cooling for 5 minutes then stops completely',
  });

  const botMsg2 = turn2.botMessages[0];
  console.log('Bot response:\n' + botMsg2?.text);
  console.log('Current node in session:', session.currentNodeId);
  console.log('Chips count:', (botMsg2?.chips || []).length);

  // 4. User asks to book a technician
  console.log('\n--- Step 4: User asks "can you book a technician to check it" ---');
  const turn3 = await chatService.processMessage(session.sessionId, {
    text: 'can you book a technician to check it',
  });

  const botMsg3 = turn3.botMessages[0];
  console.log('Bot response:\n' + botMsg3?.text);
  console.log('Chips:', botMsg3?.chips);

  if (botMsg3?.chips?.some(c => c.value === 'NAV_BOOKING')) {
    console.log('PASS: Escalated to technician booking cleanly via tool call!');
  } else {
    console.error('FAIL: Expected booking chip');
  }

  // 5. Post-completion test: User says "i schedule a service" after session is completed
  console.log('\n--- Step 5: Post-completion test: User says "i schedule a service" ---');
  session.isCompleted = true;
  session.messages.push({
    id: 'test-concl',
    sender: 'bot',
    text: 'Diagnostic completed.',
    timestamp: new Date().toISOString(),
    conclusion: {
      probable_cause: 'Refrigerant Undercharge / Leakage (CH 38)',
      parts: ['Copper Flare Nuts', 'R32 Refrigerant Gas'],
      priority: 'High',
    },
  });

  const turn4 = await chatService.processMessage(session.sessionId, {
    text: 'i schedule a service',
  });

  const botMsg4 = turn4.botMessages[0];
  console.log('Bot response:\n' + botMsg4?.text);
  console.log('Action:', botMsg4?.action);
  console.log('Booking Context:', botMsg4?.bookingContext);
  console.log('Chips:', botMsg4?.chips);

  if (botMsg4?.action === 'NAV_BOOKING' && botMsg4?.bookingContext?.probable_cause?.includes('Refrigerant')) {
    console.log('PASS: Post-completion "i schedule a service" successfully triggered NAV_BOOKING tool call and prefilled context!');
  } else {
    console.error('FAIL: Expected NAV_BOOKING action with prefilled context, got:', botMsg4);
  }

  console.log('\n=== All E2E Diagnostic Agent Tests Complete ===');
}

runE2ETest().catch((e) => console.error('E2E Test Error:', e));
