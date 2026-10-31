import { chatService } from '../engine/chatService';
import dotenv from 'dotenv';

dotenv.config();

async function testRedirectFlow() {
  console.log('=== Testing Diagnostic Tree Redirect Flow (AC02 -> AC08) ===\n');

  // 1. Start AC02
  const session = chatService.getOrCreateSession('test-redirect-' + Date.now());
  const start = chatService.startTreeInChat(session.sessionId, 'AC02');
  console.log('Step 1 (AC02 start):\n', start.stepMessage.text);

  // 2. Answer Step 1: Display lights turn on
  console.log('\n--- User: "yes lights and display turn on" ---');
  const turn1 = await chatService.processMessage(session.sessionId, {
    text: 'yes lights and display turn on',
  });
  const botMsg1 = turn1.botMessages[turn1.botMessages.length - 1];
  console.log('Bot response:\n', botMsg1.text);
  console.log('Current Node:', session.currentNodeId);

  // 3. Answer Step 2: Exactly as in user screenshot: "no the ac is not blowing air"
  console.log('\n--- User: "no the ac is not blowing air" ---');
  const turn2 = await chatService.processMessage(session.sessionId, {
    text: 'no the ac is not blowing air',
  });
  const botMsg2 = turn2.botMessages[turn2.botMessages.length - 1];
  console.log('Bot response:\n', botMsg2.text);
  console.log('Session Issue ID:', session.issueId);
  console.log('Current Node:', session.currentNodeId);

  // Assertions
  const hasCorruptedPlaceholder = botMsg2.text.includes('Please observe the symptoms:');
  if (hasCorruptedPlaceholder) {
    console.error('FAIL: Bot responded with "Please observe the symptoms:" placeholder!');
    process.exit(1);
  } else {
    console.log('PASS: No "Please observe the symptoms:" placeholder found.');
  }

  if (session.issueId === 'AC08') {
    console.log('PASS: Diagnostic session successfully transitioned to AC08 (Remote Control Malfunction)!');
  } else {
    console.error('FAIL: Expected session.issueId === "AC08", but got', session.issueId);
    process.exit(1);
  }

  if (botMsg2.text.toLowerCase().includes('remote') && botMsg2.text.toLowerCase().includes('display')) {
    console.log('PASS: Next question from AC08 successfully asked to user!');
  } else {
    console.error('FAIL: Next question does not ask about remote display. Text:', botMsg2.text);
    process.exit(1);
  }

  console.log('\n=== All Redirect Flow Tests Passed Successfully ===');
}

testRedirectFlow().catch((e) => {
  console.error('Test Error:', e);
  process.exit(1);
});
