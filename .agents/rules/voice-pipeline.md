# Voice Pipeline Development Rules

## Barge-in / Interrupt Flag Separation & Audio Frame Prohibition

In real-time voice pipelines (STT → LLM → TTS), always maintain **two separate flags**:

- `isAssistantSpeaking`: `true` during LLM processing **and** TTS playback (broad "busy" flag)
- `isAudioPlaying`: `true` **only** when TTS audio chunks are actively being sent to the client

**CRITICAL INVARIANT: NEVER trigger barge-in on raw microphone audio frames.**
Browser microphones emit continuous audio frames (at 16kHz, ~50-100ms chunks) regardless of whether the user is speaking — including pure silence, room hum, and acoustic speaker echo.
If `handleAudioFrame` calls `interruptAssistant` on audio frames while `isAudioPlaying === true`, the very first frame arriving after TTS starts (<50ms) will immediately kill audio playback and increment `turnId`.

**Barge-in MUST be strictly gated on:**
1. STT emitting recognized words (`data.transcript` with non-empty text, e.g. `barge_in_transcript`).
2. Explicit user action (tap / click to interrupt).

```ts
// ❌ WRONG: kills playback within 50ms on silent mic frames
if (state.isAudioPlaying) {
  this.interruptAssistant(ws, state, 'barge_in_speech');
}

// ✅ CORRECT: send audio frame to STT; let STT transcript event trigger barge-in
if (state.sttSession) {
  state.sttSession.sendAudioChunk(audioBuffer);
}
// In sttSession.on('transcript'):
if (state.isAudioPlaying && transcript.length > 0) {
  this.interruptAssistant(ws, state, 'barge_in_transcript');
}
```

---

## Web Audio API User Gesture Unlocking

In modern browsers (Chrome, Edge, Safari):
- An `AudioContext` created or resumed inside a WebSocket `onmessage` callback is **permanently blocked by autoplay policy** (`'suspended'` state).
- Calling `.resume()` from a network callback does NOT unlock audio hardware.
- If `source.start(0)` is called on a suspended context, it sits queued silently without producing any sound through speakers.

**The Rule:**
- The `AudioContext` MUST be created and unlocked during a **synchronous user gesture** (e.g. clicking "Voice Agent" or "Start Call").
- `AudioQueuePlayer` must expose an `unlock()` method that resumes the context and plays a 1-sample silent buffer during the click handler.

---

## Microphone Speaker Loopback Suppression

- In `AudioRecorder`, never connect `processorNode` directly to `audioContext.destination`.
- Route through a zero-gain `GainNode` (`gain.value = 0`) before connecting to destination, preventing raw mic feedback into speakers.

---

## Turn ID Guard Pattern

The `state.turnId !== currentTurn` guard is only safe for interrupts triggered by
**deliberate user action** (button click, `interrupt` WebSocket message).

It must NOT be used to silently discard responses caused by automatic audio-frame barge-in
during LLM processing, as that creates the silent-reply bug described above.

---

## React Audio Callbacks — Always Use Refs

Any React `state` variable used inside a WebSocket `onmessage`, `onAudioData`, or other
long-lived callback closure **MUST be mirrored in a `useRef`** and read from the ref inside
the callback. State values captured in closures become stale after component re-renders.

```ts
// ❌ Bug: isMuted is stale after first render
const isMuted = useState(false);
onAudioData: (buffer) => {
  if (!isMuted) ws.send(buffer); // always reads the initial value
};

// ✅ Fix: ref stays synchronized across re-renders
const isMutedRef = useRef(false);
const handleToggleMute = () => {
  const next = !isMuted;
  setIsMuted(next);
  isMutedRef.current = next; // keep ref in sync
};
onAudioData: (buffer) => {
  if (!isMutedRef.current) ws.send(buffer); // always current
};
```

---

## Voice Pipeline Logging

Always add `console.log` at **each stage** of the voice pipeline to allow silent-failure
diagnosis without needing an attached debugger:

```ts
console.log(`[Voice] Turn ${currentTurn}: Processing utterance: "${userText}"`);
// after LLM:
console.log(`[Voice] Turn ${currentTurn}: Got ${botMessages.length} bot message(s)`);
// before TTS:
console.log(`[Voice] Turn ${currentTurn}: Starting TTS for: "${spokenText.slice(0, 80)}"`);
// after TTS:
console.log(`[Voice] Turn ${turnId}: TTS complete, sent ${chunkCount} audio chunks`);
```

If a turn silently disappears, the log will show exactly which stage it stopped at.

---

## Voice Activity Detection (VAD) Architecture

The voice pipeline implements a **3-tier hybrid VAD architecture** to balance sub-second latency with reliable sentence endpointing:

1. **Client-Side Hardware DSP & Native VAD**:
   - Microphone capture in `AudioRecorder` uses WebRTC DSP:
     ```ts
     audio: {
       channelCount: 1,
       sampleRate: 16000,
       echoCancellation: true,
       noiseSuppression: true,
       autoGainControl: true,
     }
     ```
   - In environments with WebSpeech (`webkitSpeechRecognition`), browser OS-level VAD tracks `interimResults` and emits `isFinal: true` upon speech completion.

2. **Upstream Streaming ASR VAD (Gnani Prisma STT)**:
   - Raw 16kHz linear PCM frames are streamed over WebSocket to `wss://api.vachana.ai/stt/v3/stream`.
   - Gnani's neural ASR engine performs real-time acoustic segmentation, emitting partial frames (`isFinal: false`) and completed utterance boundaries (`isFinal: true`).

3. **Application-Level Silence Timeout VAD (600ms Endpoint Guard)**:
   - In `voiceSessionManager.ts`, if interim transcripts arrive without an immediate `isFinal` event (e.g. natural pauses in speech), an application silence timer acts as the endpoint detector:
     ```ts
     if (isFinal) {
       await triggerUtterance(transcript);
     } else {
       state.silenceTimer = setTimeout(async () => {
         if (state.pendingTranscript && state.pendingTranscript !== state.lastTranscriptProcessed) {
           await triggerUtterance(state.pendingTranscript);
         }
       }, 600);
     }
     ```
   - Reset on every incoming transcript chunk. If 600ms of silence elapses after speech, the utterance is automatically finalized and dispatched to the diagnostic engine.

---

## Interruption & Barge-In Handling Pattern

Interruption is governed by a **4-layer synchronized cancellation protocol**:

1. **Turn ID Versioning (Epoch Guard)**:
   - Every utterance turn is assigned an incrementing integer `turnId` tracked on both backend (`state.turnId`) and frontend (`activeTurnIdRef.current`).
   - When an interruption occurs:
     ```ts
     state.turnId++;
     this.sendJson(ws, { type: 'interrupted', turnId: state.turnId, reason });
     ```
   - In-flight LLM generation and streaming TTS audio chunks check:
     ```ts
     if (signal.aborted || state.turnId !== currentTurn) return;
     ```
     Any chunk belonging to a superseded turn (`< currentTurn`) is discarded immediately.

2. **AbortController Cancellation**:
   - Each turn holds `state.activeAbortController = new AbortController()`.
   - On interruption, `state.activeAbortController.abort()` cancels:
     - In-flight Groq/Qwen LLM streaming HTTP requests.
     - Streaming SSE and HTTP connections to Gnani Timbre TTS.

3. **Client-Side Web Audio Queue Flushing**:
   - In `AudioQueuePlayer`, calling `player.stop()`:
     - Calls `sourceNode.stop(0)` on the currently playing chunk.
     - Disconnects the node from `audioContext.destination`.
     - Clears the internal buffer queue (`queue = []`).
     - Resets `isPlaying = false`.
   - Calls `window.speechSynthesis.cancel()` to instantly silence fallback synthesis.

4. **Echo Gate & Anti-Self-Interruption Shield**:
   - **Critical Problem**: Without protection, laptop speaker sound leaks into the microphone during TTS playback, transcribing the assistant's own voice and triggering self-interruption.
   - **Protection Protocol**:
     - **Frame Gate**: Never trigger barge-in on raw mic PCM frames.
     - **Echo Gate**: When `isAssistantSpeaking` is true, `AudioRecorder.setMuted(true)` mutes mic transmission with a 500ms reverberation decay tail.
     - **Semantic Filter**: `isEchoOfAssistant(userText)` checks incoming transcripts against `lastSpokenAssistantText` during and up to 1.2s after playback. Substring matches or >=70% word overlaps are rejected as acoustic echo.
     - **User Interrupt**: Clicking the Mic or "Stop Audio" button triggers instant unmuting and sends `{ type: 'interrupt' }`.

