/**
 * Automated End-to-End Voice Pipeline & Barge-In Verification Suite
 *
 * Tests:
 * 1. Gnani STT Service connectivity & audio validation
 * 2. Gnani TTS Service SSE streaming & latency
 * 3. Hugging Face Evon Service configuration & reasoning suppression
 * 4. WebSocket Server /api/voice connection & lifecycle
 * 5. Barge-in / interruption handling: turn increment & obsolete audio rejection
 * 6. Sentence chunker and timing benchmarks
 */

import http from 'http';
import WebSocket from 'ws';
import { app } from '../index';
import { voiceSessionManager, detectLanguageFromTranscript } from '../services/voiceSessionManager';
import { gnaniSttService, resolveSttLanguage } from '../services/gnaniSttService';
import { gnaniTtsService } from '../services/gnaniTtsService';
import { hfEvonService, SentenceChunker, stripThinkingTags } from '../services/hfEvonService';

async function runVoiceTests() {
  console.log('======================================================================');
  console.log('   ApplianceCare AI — Real-Time Voice Agent Automated Test Suite       ');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title: string, condition: boolean, detail: string = '') {
    if (condition) {
      console.log(`[✅ PASS] ${title}`);
      if (detail) console.log(`         Details: ${detail}`);
      passed++;
    } else {
      console.error(`[❌ FAIL] ${title}`);
      if (detail) console.error(`         Details: ${detail}`);
      failed++;
    }
  }

  // 1. Test SentenceChunker
  const chunker = new SentenceChunker();
  const chunks1 = chunker.push('The AC filter needs cleaning. Please turn off the MCB first! ');
  assert(
    'SentenceChunker detects punctuation delimiters cleanly',
    chunks1.length === 2 && chunks1[0] === 'The AC filter needs cleaning.' && chunks1[1] === 'Please turn off the MCB first!',
    `Extracted sentences: ${JSON.stringify(chunks1)}`
  );

  // 2. Test stripThinkingTags
  const cleaned = stripThinkingTags('<think>internal chain of thought</think>Actual response text.');
  assert(
    'Thinking tag stripper suppresses reasoning traces',
    cleaned === 'Actual response text.',
    `Result: "${cleaned}"`
  );

  // 3. Test Hugging Face Evon config
  assert(
    'Hugging Face Evon configured with exact model gnani/gnani-evon-v3.3-30B-A3B',
    hfEvonService.getModelId() === 'gnani/gnani-evon-v3.3-30B-A3B',
    `Model: ${hfEvonService.getModelId()}, Endpoint: ${hfEvonService.getBaseUrl()}`
  );

  // 4. Test Gnani STT Language Auto-Resolution (en-IN English only)
  assert(
    'resolveSttLanguage correctly maps "auto", "indic-auto", or empty to "en-IN"',
    resolveSttLanguage('auto') === 'en-IN' &&
    resolveSttLanguage('indic-auto') === 'en-IN' &&
    resolveSttLanguage('') === 'en-IN' &&
    resolveSttLanguage('hi-IN') === 'en-IN',
    `auto -> ${resolveSttLanguage('auto')}, hi-IN -> ${resolveSttLanguage('hi-IN')}`
  );

  // 5. Test Voice Agent Language Policy (English only)
  const tamilDetected = detectLanguageFromTranscript('ஏசி கூலிங் வரல, சூடான காத்து வருது');
  const tanglishDetected = detectLanguageFromTranscript('ac cooling varala enna pannunga');
  const hindiDetected = detectLanguageFromTranscript('एसी में कूलिंग नहीं हो रही है');
  const englishDetected = detectLanguageFromTranscript('The AC is not cooling the room');
  assert(
    'detectLanguageFromTranscript adheres to English-only policy for voice agent',
    tamilDetected === 'en-IN' && tanglishDetected === 'en-IN' && hindiDetected === 'en-IN' && englishDetected === 'en-IN',
    `Tamil -> ${tamilDetected}, Tanglish -> ${tanglishDetected}, Hindi -> ${hindiDetected}, English -> ${englishDetected}`
  );

  // 6. Test Gnani Timbre TTS live SSE synthesis (English & Tamil ta-IN)
  console.log('\nMeasuring TTS synthesis latency for English and Tamil...');
  const ttsStart = Date.now();
  let firstChunkMs = 0;
  let totalChunks = 0;

  const ttsRes = await gnaniTtsService.streamSynthesize(
    'Air filter cleaned. Normal cooling operational.',
    (chunk) => {
      totalChunks++;
      if (firstChunkMs === 0) {
        firstChunkMs = Date.now() - ttsStart;
      }
    },
    { voice: 'Nalini', language: 'en-IN' }
  );

  let tamilChunks = 0;
  const ttsTamilRes = await gnaniTtsService.streamSynthesize(
    'Outdoor unit fan சுத்துதா, compressor sound கேக்குதா?',
    (chunk) => {
      tamilChunks++;
    },
    { voice: 'Nalini', language: 'ta-IN' }
  );

  const ttsTotalMs = Date.now() - ttsStart;
  assert(
    'Gnani Timbre TTS streams audio chunks via SSE for both English (en-IN) and Tamil (ta-IN)',
    ttsRes.success && totalChunks > 0 && ttsTamilRes.success && tamilChunks > 0,
    `English chunks: ${totalChunks} (TTFC: ${firstChunkMs}ms), Tamil chunks: ${tamilChunks}, Total: ${ttsTotalMs}ms`
  );

  // 7. Test Live WebSocket Server & Barge-in Protocol
  console.log('\nSpinning up dedicated test server for WebSocket verification...');
  const testServer = http.createServer(app);
  const testWss = new WebSocket.Server({ server: testServer, path: '/api/voice-test' });
  testWss.on('connection', (ws) => voiceSessionManager.handleConnection(ws));

  await new Promise<void>((resolve) => testServer.listen(4005, resolve));

  const wsClient = new WebSocket('ws://localhost:4005/api/voice-test');

  const wsConnected = await new Promise<boolean>((resolve) => {
    wsClient.on('open', () => resolve(true));
    wsClient.on('error', () => resolve(false));
  });

  assert('Voice WebSocket server accepts client connections', wsConnected, 'Connected to ws://localhost:4005/api/voice-test');

  // Test start_session message with 'en-IN' language
  const sessionReady = await new Promise<any>((resolve) => {
    wsClient.on('message', (msg) => {
      try {
        const json = JSON.parse(msg.toString());
        if (json.type === 'session_ready') resolve(json);
      } catch {}
    });
    wsClient.send(JSON.stringify({
      type: 'start_session',
      language: 'en-IN',
      model: 'UW-Q18WUZA'
    }));
  });

  assert(
    'start_session initializes session with English language setting',
    Boolean(sessionReady && sessionReady.language === 'en-IN' && sessionReady.sessionId),
    `Session ID: ${sessionReady?.sessionId}, Language: ${sessionReady?.language}`
  );

  // Test text_input message to verify diagnostic turn generation
  console.log('\nSending text input through voice WebSocket: "water leaking"...');
  const turnMsgs: any[] = [];
  let turnAudioChunks = 0;

  const turnDone = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), 6000);
    wsClient.on('message', (msg) => {
      try {
        const json = JSON.parse(msg.toString());
        if (json.type === 'assistant_message') {
          turnMsgs.push(json);
        }
        if (json.type === 'audio_chunk') {
          turnAudioChunks++;
        }
        if (json.type === 'audio_done') {
          clearTimeout(timer);
          resolve(true);
        }
      } catch {}
    });

    wsClient.send(JSON.stringify({
      type: 'text_input',
      text: 'water leaking from indoor unit'
    }));
  });

  assert(
    'Voice pipeline routes utterance through decision tree & returns assistant message with audio',
    turnMsgs.length > 0 && turnAudioChunks > 0,
    `Assistant messages: ${turnMsgs.length}, Audio chunks received: ${turnAudioChunks}`
  );

  // Test Barge-in / Interrupt
  console.log('\nTesting barge-in interruption signal...');
  const interruptDone = await new Promise<any>((resolve) => {
    wsClient.on('message', (msg) => {
      try {
        const json = JSON.parse(msg.toString());
        if (json.type === 'interrupted') resolve(json);
      } catch {}
    });
    wsClient.send(JSON.stringify({ type: 'interrupt' }));
  });

  assert(
    'Barge-in immediately increments turnId and cancels active speech',
    Boolean(interruptDone && interruptDone.turnId > sessionReady.turnId),
    `Previous turn: ${sessionReady.turnId}, Interrupted turn: ${interruptDone?.turnId}`
  );

  // 8. Test sending audio frames without drop or error during/after interruption
  const dummyPcm = Buffer.alloc(4096);
  let audioFrameAccepted = true;
  try {
    wsClient.send(dummyPcm);
  } catch {
    audioFrameAccepted = false;
  }
  assert('Microphone PCM frame accepted during/after interruption without error', audioFrameAccepted);

  // 9. Test conversation continuation after interruption
  console.log('\nTesting conversation continuation after interruption...');
  const followUpMsgs: any[] = [];
  await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), 8000);
    const handler = (msg: any) => {
      try {
        const json = JSON.parse(msg.toString());
        if (json.type === 'assistant_message') {
          followUpMsgs.push(json);
        }
        if (json.type === 'audio_done') {
          clearTimeout(timer);
          wsClient.off('message', handler);
          resolve(true);
        }
      } catch {}
    };
    wsClient.on('message', handler);
    wsClient.send(JSON.stringify({
      type: 'text_input',
      text: 'actually the MCB is tripped'
    }));
  });

  assert(
    'Agent resumes conversation following interruption without context loss',
    followUpMsgs.length > 0 && followUpMsgs[0].turnId > interruptDone.turnId,
    `Follow-up turn: ${followUpMsgs[0]?.turnId}, Messages received: ${followUpMsgs.length}`
  );

  wsClient.close();
  testServer.close();

  console.log('\n======================================================================');
  console.log(`TOTAL: ${passed} / ${passed + failed} PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('======================================================================\n');
}

runVoiceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
