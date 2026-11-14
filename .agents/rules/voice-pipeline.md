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



---

## Universal Multilingual STT, TTS & Exact Customer Language Matching Invariant

1. **Dynamic Universal Language Mirroring**:
   - The assistant's response language and spoken voice MUST always match the language spoken by the customer on that turn (it can be ANY language: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, or other regional/international languages).
   - If the customer speaks English (or standard Indic English), transcribe in English, formulate response in English, and synthesize speech via TTS with `language: 'en-IN'`.
   - If the customer speaks Hindi (or Hinglish), transcribe in Hindi/Hinglish, formulate response in conversational Hindi/Hinglish, and synthesize speech via TTS with `language: 'hi-IN'`.
   - If the customer speaks Tamil (or Tanglish), transcribe in Tamil/Tanglish, formulate response in conversational Tamil/Tanglish, and synthesize speech via TTS with `language: 'ta-IN'`.
   - If the customer speaks Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, or any other language, dynamically detect the language from script/markers/STT metadata, formulate the response in that language, and synthesize speech via TTS with the matching locale (e.g. `te-IN`, `kn-IN`, `ml-IN`, `bn-IN`, `mr-IN`, `gu-IN`, `pa-IN`, etc.).

2. **Mid-Call Language Switching Across Any Language**:
   - Customers may switch languages dynamically between turns (e.g. Turn 1 English -> Turn 2 Hindi -> Turn 3 Tamil).
   - The voice pipeline must detect language shifts on every turn via `LanguageResolver`, update session state and TTS target parameters dynamically, and emit `language_detected` events to synchronize the UI.
   - Never keep the voice session locked to an initial language when the customer has switched languages.

3. **Synchronized Spoken & Text Localization**:
   - Spoken audio (TTS), conversational LLM acknowledgments, and decision tree questions must be delivered in the same target language.
   - Technical loanwords (e.g. AC, filter, PCB, MCB, remote, cooling, compressor) are retained phonetically in code-switched colloquial speech to ensure natural comprehension.


---

## Auto STT Protocol & Dedicated Language Fallback

1. **Gnani STT Auto Mode Value**:
   - When a session is configured for automatic language identification, the WebSocket header `lang_code` MUST be sent as `"AUTO_DETECT"`. Never append suffixes like `"-IN"` to `auto`.
   - Provide explicit language selector options (`Auto 🌐`, `தமிழ் 🇮🇳`, `हिन्दी 🇮🇳`, `English 🇬🇧`) in the UI so users can lock to a dedicated acoustic model if Auto-LID is noisy.

2. **Extracted Symptom Priority Over UNKNOWN Intent**:
   - In `conversationUnderstanding.ts`, if `symptomExtractor` successfully extracts a primary symptom (`symptoms.primary`) or error code with confidence >= 0.70, `intent.primary` MUST be promoted to `DIAGNOSIS` and `requiresClarification` MUST be `false`.
   - Never ask a customer to clarify their symptom if a valid symptom was already extracted in that turn.

---

## Mandatory Code-Switched Speaking Policy — ApplianceCare AI

You MUST ALWAYS speak in a natural, conversational code-switched style.
This is a permanent speaking policy, not an optional language mode.

### Language rules
1. For Tamil-speaking customers, ALWAYS use conversational Tamil mixed with English (Tamil-English).
2. For Hindi-speaking customers, ALWAYS use conversational Hindi mixed with English (Hinglish).
3. For English-speaking customers, use natural Indian conversational English with familiar regional expressions where appropriate.
4. Never produce completely formal or literary Tamil or Hindi.
5. Never translate every English technical term into the local language.
6. Keep common appliance terminology in English, including cooling, compressor, fan, remote, display, filter, outdoor unit, temperature, voltage, MCB, PCB, and drain pipe.
7. Use natural local sentence structures rather than translating English sentences word-for-word.
8. Continue the same code-switching style throughout the entire conversation.

### Zero Static Few-Shot Scripting in LLM Prompts
- NEVER inject verbatim sentence examples (e.g. specific sample questions) into LLM system prompts.
- LLMs overfit on few-shot examples and parrot them mechanically across turns.
- Guide the LLM using linguistic principles, persona, vocabulary retention (keeping technical terms in English), and dynamic context-sensitive response formulation.

### Conversational rules
- Sound like a helpful local human support executive, not a translation engine.
- Ask only ONE diagnostic question at a time.
- Acknowledge the customer's answer naturally.
- Keep responses short and easy to understand when spoken.
- Do not announce the language you detected.
- Do not randomly change language or speaking style between turns.
- If the customer explicitly asks for Tamil, Hindi, or English, change the base language but ALWAYS retain natural code-switching.

### Technical and safety rules
- Preserve the meaning of diagnostic-tree questions.
- Never invent symptoms, error codes or appliance specifications.
- Never bypass the deterministic diagnostic engine or safety policies.
- Do not provide unsafe electrical, refrigerant or high-voltage DIY instructions.
- Return only the response intended to be spoken aloud.

---

## Conversational Meta-Checks & Language Command Invariants

1. **Audibility & Connection Checks (AUDIBILITY_CHECK)**:
   - Utterances like "கேட்குதா" / "கேக்குதா" / "நான் பேசுறது கேட்குதா" / "can you hear me" / "are you there" / "sun rahe ho" / "meri aawaz aa rahi hai" are meta-conversational audio checks, NOT diagnostic symptoms.
   - The assistant MUST acknowledge audibility naturally in the user's language and invite them to describe the issue:
     - Tamil-English: *"ஆமாங்க, நல்லா கேட்குது! சொல்லுங்க, உங்க AC-ல என்ன பிரச்சனை?"*
     - Hinglish: *"Haan ji, bilkul sun raha hoon! Bataiye, aapke AC mein kya problem ho rahi hai?"*
     - Indian English: *"Yes, I can hear you clearly! Please tell me what's wrong with your AC."*
   - Never route audibility checks to diagnostic clarification loops or repeat canned triage templates.

2. **Dynamic Language & Style Switch Commands (LANGUAGE_COMMAND)**:
   - When the customer explicitly asks to change languages or speaking styles (e.g. "தங்கிலீஷில் பேசு", "tanglish la pesu", "tamil la pesu", "speak in tanglish", "speak in english", "hindi me bolo", "hinglish me baat karo"):
     - Immediately update `session.language` and session persona to the requested language.
     - Respond in the requested language acknowledging the switch:
       - Tanglish: *"சரிங்க, கண்டிப்பா தங்கிலீஷ்லயே பேசுறேன்! உங்க AC-ல என்ன பிரச்சனை-ன்னு சொல்லுங்க?"*
       - Hinglish: *"Haan bilkul! Ab se Hinglish mein baat karenge. Bataiye AC mein kya dikkat hai?"*
       - Indian English: *"Sure, switching to English! Tell me what is happening with your AC."*
   - Never ignore a language switch command or respond with an unrelated symptom clarification question.

3. **Strict Code-Switched Tone in All Fallbacks & Clarifications**:
   - `clarificationManager.ts` and `deterministicRouter.ts` MUST NEVER use formal/literary Tamil (e.g. "சாதனத்தில்") or formal Hindi (e.g. "उपकरण").
   - Always refer to the appliance conversationally as "AC" or "உங்க AC".
   - Never mechanically recite internal model numbers (e.g. "UW-Q18WUZA") in customer-facing spoken triage fallbacks.

---

## Mid-Dialogue Symptom Correction & Dynamic Tree Switching

1. **Universal Tree Transition Availability**:
   - The LLM diagnostic agent MUST always have access to `start_diagnostic_tree`, even while in an active tree question.
   - When the user issues a correction or mentions an alternate symptom (e.g. *"sorry sorry it's MCB tripping"*, *"actually it's leaking water"*, *"wait no, unusual noise"*):
     - The system must prioritize the explicit correction over forcing the text into one of the current question's multiple-choice options.
     - Never force an out-of-context symptom into an option like "No / Not working" that triggers a wrong diversion (such as AC01 $\rightarrow$ AC02 No Power).

2. **Deterministic Pre-emption for Symptom Corrections**:
   - When in an active tree, check if the utterance contains correction markers (`sorry`, `actually`, `no wait`, `wrong issue`, etc.) or matches another diagnostic tree with high confidence ($\ge 0.85$).
   - Immediately switch session context to the new tree via `chatService.startTreeInChat(sessionId, newTreeId)` with an empathetic, conversational acknowledgment in the active language.

3. **Resilient Session Initialization Payloads**:
   - API endpoints creating or fetching chat sessions (`/api/chat/session`) must tolerate missing, null, or empty string values in `sessionId`, `model`, `language`, and `appliance`.
   - Never throw 400 Bad Request on null or empty session attributes; supply safe defaults (`UW-Q18WUZA`, `air-conditioner`, `en`).

---

## System Documentation & Production Hygiene Standards

1. **Comprehensive Documentation Invariant**:
   - Every production release must maintain an up-to-date, single-source-of-truth `README.md` reflecting:
     - End-to-end multi-modal architecture (Web Audio API &rarr; WebSockets &rarr; STT with Auto LID &rarr; Conversation Understanding &rarr; Deterministic Trees / LLM Tool Calling &rarr; TTS Streaming &rarr; Client Audio Queue).
     - Full appliance coverage (Air Conditioners, Refrigerators, Washing Machines, Dishwashers, Microwave Ovens).
     - Conversational code-switching policy (Tamil-English / Tanglish, Hindi-English / Hinglish, Indian English) with zero static few-shot prompts.
     - Accurate environment variable matrix, API contracts, Binary Framing Protocol v2.0.0, and quickstart commands.

2. **Workspace Hygiene & Production Cleanup Rule**:
   - Ad-hoc debugging scripts (e.g. `test-progression.ts`) created during interactive development must not linger in production repositories; all persistent assertions must be formalized into `backend/src/tests/` suites.
   - Clean builds and typechecks must be maintained on both frontend (`npx tsc --noEmit`) and backend (`npm run build`).

3. **Zero Hallucination & Safety Isolation Guarantee**:
   - Diagnostic questions, error codes, and electrical tests must strictly originate from authoritative JSON registries and verified decision trees (`AC01`–`AC16`).
   - High-voltage tests (230V, capacitor discharge, compressor inverter DC Link) are strictly quarantined to the Technician Portal and blocked from customer voice/chat turns.

---

## STT Language Code Specification & Dual-Layer Speech Resilience

1. **Upstream STT Language Code Specification**:
   - Never guess or use generic placeholder strings (such as `AUTO_DETECT`) for cloud speech services.
   - In Gnani Vachana / Prisma STT:
     - Multilingual Auto-detection code is strictly **`indic-auto`**.
     - Regional codes are strictly: `en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `kn-IN`, `ml-IN`, `bn-IN`, `mr-IN`, `gu-IN`, `pa-IN`.
     - Sending non-compliant language identifiers causes immediate WebSocket rejection (Close code `1008`).

2. **Dual-Layer STT Resilience (Cloud + Web Speech API) & Standby Fallback**:
   - Real-time web voice agents implement a dual-layer recognition strategy:
     - **Primary Layer**: Low-latency 16kHz PCM streaming over WebSocket to Gnani STT.
     - **Resilience Layer**: Local browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) running as a standby fallback listener.
   - **Single-Dispatcher Policy**: When cloud STT is connected and active, Web Speech API MUST NOT independently dispatch turns into the chat engine (`handleSendMessage`). Web Speech API dispatches turns **only** if the cloud WebSocket STT is in an error state or reports `STT_UNAVAILABLE`.

---

## Echo Suppression, Microphone Gating & Electrical Safety Routing

1. **Hardware-Level Microphone Muting During Assistant Playback**:
   - During assistant speech playback (`setPlaybackActive(true)`), the microphone recorder MUST be actively muted (`recorder.setMuted(true)`), disabling browser audio tracks.
   - To absorb room reverberations and acoustic speaker reflection decay, unmuting must be delayed by a **400ms decay window** after playback ends before calling `recorder.setMuted(false)`.
   - Semantic echo filtering must drop incoming candidate transcripts having >50% token overlap with the assistant's most recently synthesized utterance.

2. **MCB Tripping Routing Invariant**:
   - Circuit breaker or fuse tripping (`mcb trip`, `breaker trip`, `short circuit`) indicates electrical safety shutdown and must route directly to the power protection diagnostic flow (`AC02.q6_mcb_retrip_check`), NEVER display error codes (`AC03`).

3. **Indic Audibility Phonetic Normalization**:
   - STT engines operating in English or auto-detect frequently produce phonetic English approximations of Indic queries.
   - Common audibility phrases like `"naa paisa cake tha"`, `"naan pesa kekutha"`, `"pesa kekutha"`, `"pesurathu kekutha"` must be normalized directly to `AUDIBILITY_CHECK`.

---

## Conversational Escalation & UI Navigation Invariants

1. **No Premature Auto-Navigation**:
   - In-chat conversational booking and multi-turn workflows must NEVER trigger automatic tab or page redirection (`triggerAutoBookingNavigation`).
   - Automatic navigation is strictly reserved for explicit user clicks on external fallback links (`action === 'NAV_BOOKING'`).

2. **Data Provenance Without Side Effects**:
   - Attaching diagnostic context payloads (`bookingContext`, diagnostic summaries, probable causes) to a chat message must never alter client routing or cause side-effect redirects.

---

## Real-Time STT Bubble Deduplication & Dual-Event Handling

1. **No Premature Ref Assignment**:
   - Never update the deduplication ref (`lastAppendedUserTextRef`) prior to evaluating the deduplication guard. Updating before checking causes 100% of incoming spoken transcripts to be falsely dropped as self-duplicates.

2. **Support Consecutive Identical Utterances Across Turns**:
   - Deduplication guards must allow identical words (e.g., "no", "yes", "okay") if they occur across different turns (> 1500ms apart), ensuring users are never blocked from answering multiple diagnostic steps with the same confirmation.

3. **Dual WebSocket Event Handling**:
   - Frontend listeners must accept both `transcript_final` (modern format) and `final_transcript` (legacy format) to ensure zero dropped user speech bubbles.

---

## Priority-Based Scheduling & Conversational Auto-Fill Verification Invariants

1. **Immediate Profile Auto-Fill on Booking Escalation**:
   - For authenticated customers with saved profile data (Name, Phone, Address), conversational booking MUST immediately auto-populate all known customer fields on Turn 1 of booking.
   - The assistant must not force the user through redundant manual collection steps when valid profile data exists in session context.

2. **Explicit Information Verification Before Commitment**:
   - The assistant MUST always summarize the auto-filled details and ask the explicit verification question:
     > *"Is this auto-filled information correct?"*
   - Confirmation action chips (`CONFIRM_BOOKING`, `EDIT_DATE`, `EDIT_PHONE`, `EDIT_ADDRESS`, `EDIT_NAME`, `CANCEL_BOOKING`) must accompany the summary.
   - The user must be allowed to correct any individual field (via natural speech or chip clicks) without resetting the entire booking state.
   - A service ticket (`createServiceTicket`) must ONLY be generated after the user confirms the information is correct.

3. **Priority-Based Scheduling Invariant**:
   - **High Priority Tasks** (electrical safety, fire/smoke, MCB tripping, electrical failure, `AC02`, `AC03`, `AC05`, `AC16`, `CH05`, or explicit `High` priority):
     - Scheduling slots are strictly constrained to **within the next day** (Today/Tomorrow within 24–48 hours).
     - Any user attempt to schedule beyond the next day must prompt a safety reminder that electrical/safety issues require an urgent next-day inspection.
   - **Medium Priority Tasks** (cooling performance, water leaks, noise, `AC01`, `AC04`, `AC06`):
     - Scheduling is open to **any date** across the upcoming days and weeks.
   - **Low Priority Tasks** (remote control, minor filter cleaning, cosmetic, `AC08`):
     - Scheduling is open to **any date** based on customer convenience.

---

## Noise-Robust Audio Capture, VAD Barge-In & Accurate Entity Extraction Invariants

1. **Two-Stage VAD Interruption Invariant (Duck vs. Cancel)**:
   - **Fast Ducking**: When VAD detects speech probability $\ge 0.5$ for $\ge 96\text{ ms}$, immediately duck TTS playback volume to $0.2\times$ without aborting generation.
   - **Confirmed Cancellation**: When speech persists for $\ge 160\text{ ms}$, confirm interruption, emit `stop_playback`, and immediately abort the active TTS stream.
   - **No ASR Word-Count Gate**: Never require `asrWordCount >= 2` as a prerequisite to stop playback. VAD is the primary interruption trigger; ASR interprets speech.
   - **Hysteresis & Recovery**: If speech drops below threshold for $\ge 400\text{ ms}$ without reaching confirmation, restore TTS volume. Enforce a maximum duck timeout ($1500\text{ ms}$) to prevent permanent ducking in continuous ambient noise.

2. **High-Pass Preprocessing & Sample-Rate Invariants**:
   - **Cutoff Frequency**: Initial baseline cutoff at **80 Hz** (second-order Butterworth biquad, $Q=0.707$) to eliminate compressor/fan rumble without degrading male speech fundamentals.
   - **Filter State Isolation**: High-pass filter state must be kept per session across incoming WebSocket packets and reset upon session termination.
   - **PCM16 Conversion**: Convert incoming Int16 to normalized float `[-1.0, 1.0]`, apply biquad difference equation, then round and clamp back to `[-32768, 32767]`.
   - **Browser Constraints**: `sampleRate: 16000` in `getUserMedia` is ideal, not guaranteed. Inspect `track.getSettings()` and resample if hardware delivers 44.1/48 kHz.

3. **Decoupled Audio Quality Tiers (No Hardcoded 30 dB SNR Assumption)**:
   - Do not initialize noise trackers with hardcoded `-60 dB` floor and `-30 dB` speech.
   - Decouple acoustic SNR, VAD confidence, ASR confidence, and entity confidence into distinct telemetry signals:
     ```ts
     type AudioQuality = {
       estimatedSnrDb: number | null;
       vadConfidence: number;
       asrConfidence: number | null;
       entityConfidence: number | null;
       noiseTier: 'unknown' | 'moderate' | 'high' | 'extreme';
     };
     ```
   - Use smoothed linear audio power for noise floor tracking. Never force push-to-talk solely on a single low ASR confidence score.

4. **Three-Stage Error-Code Extraction & Customer Confirmation**:
   - **Stage 1 (Candidate Extraction)**: Match both contiguous (`CH05`, `CH10`) and spaced (`C H 05`, `see age zero five`, `c etch 5`) patterns without word boundary failure between letters and digits.
   - **Stage 2 (Registry Validation)**: Validate candidate against verified LG Dual Inverter database (`lg_ac_error_codes.json` / `ch_error_code_registry.json`).
   - **Stage 3 (Customer Confirmation)**: Distinguish `registryValid`, `asrConfidence`, and `customerConfirmed`. Never silently mutate a code to a numeric neighbor (e.g., `CH05` to `CH06`). For uncertain or consequential codes, read back to the customer and ask for explicit confirmation.

5. **Safety-First Conversational Recovery Guidance**:
   - When noise is extreme: *"Could you move a little away from the outdoor unit?"*
   - When error code is unclear: *"Could you read the letters and numbers on the display?"*
   - When model is unclear: *"Could you check the model number on the indoor unit label?"*
   - When multiple speakers are heard: *"Could one person tell me the appliance details?"*
   - **Safety Restriction**: Never instruct customers to approach an active outdoor unit, touch internal electrical wiring, or open equipment cabinets.

---

## Full-Duplex Microphone, Client Ducking & Barge-In Invariants

1. **Full-Duplex Microphone Invariant (NEVER Mute Microphone During Assistant Speech)**:
   - To enable customer barge-in and real-time interruption transcription, the browser microphone MUST remain active and unmuted (`isMuted: false`) during assistant TTS playback.
   - Hardware-level microphone muting (`recorderRef.current.setMuted(true)`) during playback is **STRICTLY PROHIBITED**, as it prevents any customer audio from reaching the VAD or ASR.
   - Acoustic feedback is managed via browser hardware AEC (`echoCancellation: { ideal: true }`), server-side VAD, and server-side text echo suppression, NOT by muting the physical microphone.

2. **Client-Side Audio Ducking & Immediate Cancellation Invariant**:
   - `AudioQueuePlayer` MUST provide a smooth volume ramp method `setVolume(volume: number, rampMs: number)` utilizing `gainNode.gain.linearRampToValueAtTime`.
   - When receiving `{ type: 'tts_duck', volume: 0.2 }`, the client MUST immediately ramp playback gain down to $0.2\times$ over $50\text{--}60\text{ ms}$ so the user can easily hear themselves speaking over the assistant.
   - When receiving `{ type: 'tts_duck', volume: 1.0 }`, the client MUST ramp playback gain back to $1.0\times$.
   - When receiving `{ type: 'stop_playback' }` or `{ type: 'interrupted' }`, the client MUST immediately cancel playback (`player.stop()`) and reset volume to $1.0\times$.

3. **Timing Invariants (Milliseconds vs. Seconds)**:
   - **Fast Ducking**: $\ge 96\text{ ms}$ of probable speech ($p \ge 0.5$).
   - **Confirmed Interruption Cancellation**: $\ge 160\text{ ms}$ (0.16s) of confirmed speech. (Must NOT be set to 2.0s, because typical barge-in words like "Stop!", "Wait!", "No!" last 200–400 ms).
   - **Silence Restore Window**: $400\text{ ms}$ of silence drops ducking and restores full volume.
   - **Max Duck Timeout**: Maximum duration the assistant may stay ducked before automatically restoring full volume is **$2000\text{ ms}$ (2.0 seconds)**.

---

## Comprehensive Voice Agent Benchmarking & SLA Targets

### 1. The 10 Metric Categories & Proposed SLA Thresholds
Every benchmark of ApplianceCare AI must evaluate performance across 10 distinct operational categories:

1. **Voice Performance & Latency**:
   - First Response Latency (FRT): P95 $\le 1.5\text{ s}$ (customer speech finish $\to$ assistant speech onset)
   - Barge-in Latency: P95 $\le 120\text{ ms}$ (interruption speech onset $\to$ audio playback halted)
   - ASR Latency: P95 $\le 500\text{ ms}$ (audio packet arrival $\to$ recognized text)
   - TTS Latency: P95 $\le 500\text{ ms}$ (token generation $\to$ first audio chunk emitted)
   - End-of-Turn Detection: P95 $\le 700\text{ ms}$
   - Total Turn Latency: P95 $\le 3.0\text{ s}$

2. **Speech Recognition & Acoustic Accuracy**:
   - Word Error Rate (WER) & Character Error Rate (CER) tracked separately
   - Entity Recognition Accuracy $\ge 98\%$ (critical differentiation: `CH05` vs `CH06`, `AC01` vs `AC10`, PCB, Compressor)
   - Language Detection & Code-Switching Accuracy $\ge 95\%$ across Tanglish, Hinglish, and regional vernaculars
   - Acoustic Noise Robustness tested against compressor rumble, ceiling fans, washing machines, and distant speech

3. **Interruption & Conversation Handling**:
   - Barge-in Success Rate $\ge 98\%$
   - False Barge-in Rate $\le 2\%$ (no stops on ambient background noise or speaker echo)
   - Missed Barge-in Rate $\le 2\%$
   - Conversation Recovery Rate $\ge 95\%$ (resumes cleanly with context retained after interruption)
   - Double-talk Handling: Clean separation without corrupting STT hypotheses
   - Context Retention $\ge 98\%$ across multi-turn compound utterances

4. **Diagnostic Intelligence**:
   - Diagnostic Accuracy $\ge 90\%$ against verified decision tree ground-truth cases
   - Symptom Extraction Accuracy $\ge 95\%$
   - Diagnostic Workflow Completion Rate $\ge 90\%$
   - Follow-up Question Relevance $\ge 95\%$ (evidence-based progression without redundant queries)
   - Correct Escalation Rate $\ge 98\%$ for hazardous or unresolved mechanical issues

5. **Knowledge & RAG Grounding**:
   - Retrieval Precision & Recall $\ge 90\%$
   - Grounded Answer Rate $\ge 95\%$ (zero unsupported technical claims)
   - Hallucination Rate $\le 2\%$
   - Model Applicability Accuracy $\ge 98\%$ (matches exact appliance configuration, e.g. Dual Inverter vs Non-Inverter)

6. **Critical Safety Metrics (Zero Tolerance)**:
   - Unsafe Instruction Rate: **STRICTLY 0%** (zero dangerous DIY guidance permitted across safety suite)
   - Safety Detection Recall: **100%** (immediate detection of smoke, burning, spark, gas leak, MCB tripping)
   - Emergency Escalation Accuracy: **100%**
   - Technician-Only Instruction Leakage: **STRICTLY 0%** (cabinet opening, refrigerant line piercing, high-voltage probing restricted to certified technicians)

7. **Workflow & Business Reliability**:
   - Technician Booking Success Rate $\ge 98\%$
   - Service Ticket Creation Success $\ge 99\%$
   - Duplicate Ticket Rate $\le 1\%$
   - Post-Disconnect State Preservation: Booking committed and preserved if WebSocket drops immediately post-success

8. **Audio Quality & Noise Handling**:
   - Signal-to-Noise Ratio (SNR) tracked dynamically via smoothed linear audio power
   - VAD Precision & Recall $\ge 95\%$
   - Echo Cancellation Effectiveness: Assistant speech completely filtered from user STT stream
   - Clipping & Packet Loss Rate $\le 0.5\%$

9. **Reliability & Scalability**:
   - WebSocket Connection Success $\ge 99.5\%$
   - Session Drop Rate $\le 1\%$
   - Graceful Degradation: Subsystem failure isolation (ASR / TTS / Groq / DB) without crashing server

10. **Customer Experience**:
    - First Contact Resolution (FCR) $\ge 85\%$
    - Repetition Request Rate $\le 5\%$

---

### 2. Tri-Scorecard Evaluation Architecture
Benchmark reporting must decouple pipeline layers into three distinct scorecards to pinpoint failure root-causes:
- **Voice Quality Scorecard**: FRT, Barge-in, ASR, TTS, VAD, Echo, SNR, and Packet Loss.
- **Diagnostic Intelligence Scorecard**: Decision tree accuracy, symptom extraction, follow-up relevance, RAG citations, and safety compliance.
- **Workflow Reliability Scorecard**: Ticket creation, booking confirmation, state recovery, and session persistence.

---

### 3. Metric Slicing Invariant
All latency and accuracy metrics must capture:
- **P50, P95, P99, and Mean**
- **Slices by Language**: English (`en-IN`), Hindi (`hi-IN`), Tamil (`ta-IN`), Hinglish, Tanglish
- **Slices by Noise Condition**: Clean, Moderate AC Fan, Loud Compressor / Dual Speaker







