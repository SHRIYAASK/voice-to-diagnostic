import dotenv from 'dotenv';
dotenv.config();

import { chatService } from '../engine/chatService';

async function testGroqConversation() {
  console.log('--- STARTING CONVERSATIONAL GROQ NLU VERIFICATION ---');

  // 1. Initialize session
  const init = chatService.getOrCreateSession(undefined, 'UW-Q18WUZA', 'en', 'air-conditioner');
  const sessionId = init.sessionId;
  console.log('Session ID:', sessionId);

  // 2. User symptom: "not cooling"
  console.log('\nUser: "not cooling"');
  let res = await chatService.processMessage(sessionId, { text: 'not cooling' });
  console.log('Bot messages count:', res.botMessages.length);
  for (const m of res.botMessages) {
    console.log(`[Bot]: ${m.text.substring(0, 80)}...`);
  }

  // 3. User responds to Q1: "yes ac is turned on"
  console.log('\nUser: "yes ac is turned on"');
  res = await chatService.processMessage(sessionId, { text: 'yes ac is turned on' });
  for (const m of res.botMessages) {
    console.log(`[Bot]: ${m.text}`);
    if (m.chips) {
      console.log('Chips:', m.chips.map(c => `[${c.optionIndex}]: ${c.label}`));
    }
  }

  // 4. User responds to Q2 with the conversational statement:
  // "the room starts to cool and stops in between"
  console.log('\nUser: "the room starts to cool and stops in between"');
  res = await chatService.processMessage(sessionId, { text: 'the room starts to cool and stops in between' });
  for (const m of res.botMessages) {
    console.log(`[Bot]: ${m.text}`);
    if (m.chips) {
      console.log('Chips:', m.chips.map(c => `[${c.optionIndex}]: ${c.label}`));
    }
    // Check for leakage of manual note 27
    if (m.text.toLowerCase().includes('timer button advances') || m.text.includes('27. NOTE')) {
      console.error('❌ BUG DETECTED: Timer note was leaked!');
      process.exit(1);
    }
  }

  // 5. User speaks an off-topic/unresolved question during active diagnostic
  console.log('\nUser: "purple elephant running across the wall" (Ambiguous/unresolved in active tree)');
  res = await chatService.processMessage(sessionId, { text: 'purple elephant running across the wall' });
  for (const m of res.botMessages) {
    console.log(`[Bot Guard]: ${m.text}`);
    if (m.chips) {
      console.log('Chips preserved:', m.chips.map(c => `[${c.optionIndex}]: ${c.label}`));
    }
    if (m.text.toLowerCase().includes('timer') || m.text.toLowerCase().includes('warranty')) {
      console.error('❌ BUG DETECTED: General RAG leaked during active tree guard!');
      process.exit(1);
    }
  }

  console.log('\n✅ ALL CONVERSATIONAL GROQ NLU & ACTIVE TREE GUARD TESTS PASSED!');
}

testGroqConversation().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
