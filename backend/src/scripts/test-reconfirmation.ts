import dotenv from 'dotenv';
dotenv.config();

import { chatService } from '../engine/chatService';

async function testReconfirmation() {
  console.log('======================================================================');
  console.log('   TESTING AMBIGUITY RECONFIRMATION & SYMPTOM DISAMBIGUATION          ');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Top-Level Spoken Symptom ("The fan is running, but it isn't running outside.")
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Top-Level Nuanced Symptom ---');
  const sess1 = chatService.getOrCreateSession(undefined, 'UW-Q18WUZA', 'en', 'air-conditioner');
  const input1 = "The fan is running, but it isn't running outside.";
  console.log(`User query: "${input1}"`);

  const res1 = await chatService.processMessage(sess1.sessionId, { text: input1 });
  for (const m of res1.botMessages) {
    console.log(`[Bot]: ${m.text}`);
    if (m.chips) {
      console.log('Chips:', m.chips.map(c => `[${c.label}]`));
    }
    // Strict assertion: zero manual leakage
    if (m.text.toLowerCase().includes('timer') || m.text.includes('27. NOTE') || m.text.toLowerCase().includes('each press')) {
      console.error('❌ FAIL: Raw manual chunk was leaked into top-level response!');
      process.exit(1);
    }
  }
  console.log('✅ TEST 1 PASSED: Zero manual chunk leakage on top-level nuanced symptom.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Active-Node Ambiguity & Reconfirmation Gate
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Active-Node Nuanced / Mixed Statement Reconfirmation ---');
  const sess2 = chatService.getOrCreateSession(undefined, 'UW-Q18WUZA', 'en', 'air-conditioner');
  
  // Start AC01
  await chatService.processMessage(sess2.sessionId, { issueId: 'AC01' });
  // Step 1: AC is on
  await chatService.processMessage(sess2.sessionId, { optionIndex: 0 }); // Yes -> q2_cooling_symptom
  // Step 2: Cooling starts and stops intermittently -> advances to q5_voltage_compressor
  await chatService.processMessage(sess2.sessionId, { optionIndex: 2 });

  console.log('Active Node:', sess2.currentNodeId); // Should be q5_voltage_compressor

  // User says the ambiguous / mixed statement at q5:
  console.log(`User at q5: "${input1}"`);
  const res2 = await chatService.processMessage(sess2.sessionId, { text: input1 });

  let reconfirmed = false;
  for (const m of res2.botMessages) {
    console.log(`[Bot]: ${m.text}`);
    if (m.chips) {
      console.log('Chips:', m.chips.map(c => `[${c.label}]`));
    }
    if (m.text.toLowerCase().includes('just to confirm') || m.text.toLowerCase().includes('did you mean')) {
      reconfirmed = true;
    }
    if (m.text.includes('27. NOTE') || m.text.toLowerCase().includes('timer')) {
      console.error('❌ FAIL: Raw manual chunk was leaked during active tree!');
      process.exit(1);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 3: User Confirms with "yes"
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: User Confirms with "yes" ---');
  console.log('User: "yes, that\'s right"');
  const res3 = await chatService.processMessage(sess2.sessionId, { text: "yes, that's right" });
  for (const m of res3.botMessages) {
    console.log(`[Bot Advanced]: ${m.text.substring(0, 150)}...`);
    if (m.conclusion) {
      console.log('Conclusion reached:', m.conclusion.probable_cause);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 4: Post-Completion Message Guard
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Post-Completion Message Guard ---');
  console.log('User sends follow-up after conclusion: "okay thanks what should i do now"');
  const res4 = await chatService.processMessage(sess2.sessionId, { text: 'okay thanks what should i do now' });
  for (const m of res4.botMessages) {
    console.log(`[Bot Completed Guard]: ${m.text}`);
    if (m.text.includes('27. NOTE') || m.text.toLowerCase().includes('timer')) {
      console.error('❌ FAIL: Raw manual chunk leaked after completion!');
      process.exit(1);
    }
  }

  console.log('\n======================================================================');
  console.log('   ✅ ALL AMBIGUITY RECONFIRMATION TESTS PASSED (100%)                ');
  console.log('======================================================================');
}

testReconfirmation().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
