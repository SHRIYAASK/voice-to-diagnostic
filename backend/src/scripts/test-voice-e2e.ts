import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const WS_URL = 'ws://localhost:4000/api/voice';

async function testVoiceSession() {
  console.log('=== Checking Live Voice Agent WebSocket ===\n');

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let currentTurnId = 1;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Voice test timed out after 20 seconds'));
    }, 20000);

    ws.on('open', () => {
      console.log('1. Connected to Voice WebSocket at', WS_URL);

      // Send start_session
      ws.send(
        JSON.stringify({
          type: 'start_session',
          language: 'en-IN',
          model: 'UW-Q18WUZA',
          appliance: 'air-conditioner',
        })
      );
    });

    ws.on('message', (raw) => {
      const data = JSON.parse(raw.toString('utf-8'));
      const snippet = typeof data.message === 'string' ? data.message : (data.message?.text ? data.message.text.slice(0, 80) + '...' : (data.text || ''));
      console.log(`[WS Event: ${data.type}]`, snippet);

      if (data.type === 'session_ready') {
        console.log('2. Session ready with ID:', data.sessionId);

        // Send user spoken text input: "my ac is not cooling at all"
        console.log('\n--- Sending Utterance 1: "my ac is not cooling at all" ---');
        ws.send(
          JSON.stringify({
            type: 'text_input',
            text: 'my ac is not cooling at all',
          })
        );
      }

      if (data.type === 'assistant_message' && currentTurnId === 1) {
        console.log('3. Received Assistant Message for Turn 1:');
        console.log('   Text:\n', data.message.text);
      }

      if (data.type === 'audio_done' && currentTurnId === 1) {
        console.log('4. Turn 1 complete (audio_done received).');
        currentTurnId = 2;

        // Send user spoken answer: "the ac is not giveing cool air"
        console.log('\n--- Sending Utterance 2: "the ac is not giveing cool air" ---');
        ws.send(
          JSON.stringify({
            type: 'text_input',
            text: 'the ac is not giveing cool air',
          })
        );
      }

      if (data.type === 'assistant_message' && currentTurnId === 2) {
        console.log('5. Received Assistant Message for Turn 2:');
        console.log('   Text:\n', data.message.text);
      }

      if (data.type === 'audio_done' && currentTurnId === 2) {
        console.log('6. Turn 2 complete. Testing Barge-In Interrupt...');
        currentTurnId = 3;

        ws.send(
          JSON.stringify({
            type: 'interrupt',
          })
        );
      }

      if (data.type === 'interrupted') {
        console.log('7. Received interrupted event with turnId:', data.turnId);
        console.log('\n=== Voice Agent Verification Complete: 100% SUCCESS ===');
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

testVoiceSession()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Voice test failed:', e);
    process.exit(1);
  });
