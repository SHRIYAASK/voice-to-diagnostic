/**
 * ApplianceCare AI – Voice Session Manager & Real-Time Orchestrator
 *
 * Coordinates:
 * Browser Microphone (WebSocket)
 *   -> AudioWorklet / Framing Protocol
 *   -> EndpointDetector (Energy VAD & Trailing Silence)
 *   -> BargeInController (Sub-200ms Interruption & Echo Gate)
 *   -> Gnani Prisma STT (Real-time WebSocket)
 *   -> TranscriptManager (Stabilization & Tanglish/Hinglish Normalization)
 *   -> LanguageResolver (Multilingual Code-Switching)
 *   -> Diagnostic Core & Decision Trees (AC01 - AC16)
 *   -> VoiceResponseFormatter (Plain Spoken Language & Sentence Chunks)
 *   -> Gnani Timbre TTS (Sentence-Level Streaming SSE)
 *   -> VoiceRecoveryManager (Heartbeats & Session Resumption)
 *   -> VoiceObservabilityService (VoiceTrace & Latency Metrics)
 */

import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import { chatService, ChatSession, ChatMessage } from '../engine/chatService';
import { conversationUnderstanding } from '../engine/conversationUnderstanding';
import { gnaniSttService, GnaniSttStreamingSession, resolveSttLanguage } from './gnaniSttService';
import { gnaniTtsService } from './gnaniTtsService';
import { ttsStreamingService } from './ttsStreamingService';
import {
  VoiceStateMachine,
  VoiceState,
  StateTransitionEvent,
} from '../voice/voiceStateMachine';
import { TranscriptManager } from '../voice/transcriptManager';
import { EndpointDetector } from '../voice/endpointDetector';
import { LanguageResolver, ResolvedLanguage } from '../voice/languageResolver';
import { BargeInController } from '../voice/bargeInController';
import { VoiceResponseFormatter } from '../voice/voiceResponseFormatter';
import { VoiceRecoveryManager } from '../voice/voiceRecoveryManager';
import { voiceMetrics } from '../voice/voiceMetrics';
import {
  ClientMessage,
  ServerMessage,
  AudioFramingHeader,
  decodeAudioFrame,
  encodeAudioFrame,
  PROTOCOL_VERSION,
} from '../voice/voiceProtocol';
import { HighPassFilter } from '../voice/highPassFilter';
import { AudioEnhancer, WebRtcAudioEnhancer } from '../voice/audioEnhancer';
import { StreamingVad } from '../voice/sileroVad';
import { AudioQualityTracker } from '../voice/audioQualityTracker';
import { errorCodeExtractor } from '../voice/errorCodeExtractor';
import { audioObservability } from '../voice/audioObservability';

/**
 * Voice Agent language detection helper for backward compatibility
 */
export function detectLanguageFromTranscript(text?: string, sttDetected?: string): string {
  const resolver = new LanguageResolver();
  const res = resolver.resolve(text || '', sttDetected);
  return res.primaryLanguage;
}

export interface VoiceClientState {
  clientId: string;
  sessionId: string;
  turnId: number;
  language: string;
  detectedLanguage?: string;
  model: string;
  appliance: string;
  sttSession: GnaniSttStreamingSession | null;
  activeAbortController: AbortController | null;
  isAssistantSpeaking: boolean;
  isAudioPlaying: boolean;
  lastTranscriptProcessed: string;
  pendingTranscript?: string;
  silenceTimer?: NodeJS.Timeout | null;
  echoGateEnabled: boolean;
  lastSpokenText: string;
  recentAssistantSpeech: string[];
  lastPlaybackEndTime: number;

  // Production voice pipeline components
  stateMachine: VoiceStateMachine;
  transcriptManager: TranscriptManager;
  endpointDetector: EndpointDetector;
  languageResolver: LanguageResolver;
  bargeInController: BargeInController;

  // Modular Audio Processing & Observability Pipeline
  highPassFilter: HighPassFilter;
  audioEnhancer: AudioEnhancer;
  streamingVad: StreamingVad;
  qualityTracker: AudioQualityTracker;
  isDucked: boolean;
  /** Turn carrying the welcome greeting. Energy/VAD-based interruption is disabled for it (speaker echo is not the user). */
  welcomeTurnId?: number;
}

export class VoiceSessionManager {
  private clients = new Map<WebSocket, VoiceClientState>();
  private recoveryManager = new VoiceRecoveryManager();

  public getRecoveryManager(): VoiceRecoveryManager {
    return this.recoveryManager;
  }

  /**
   * Registers a new browser client WebSocket connection
   */
  public handleConnection(ws: WebSocket): void {
    const clientId = uuid();
    const stateMachine = new VoiceStateMachine('CONNECTING', 1);
    const transcriptManager = new TranscriptManager();
    const endpointDetector = new EndpointDetector({
      sampleRate: 16000,
      silenceThresholdMs: 650,
      energyThreshold: 0.015,
    });
    const languageResolver = new LanguageResolver();
    const bargeInController = new BargeInController();
    const highPassFilter = new HighPassFilter({ cutoffHz: 80, sampleRate: 16000 });
    const audioEnhancer = new WebRtcAudioEnhancer();
    const streamingVad = new StreamingVad({ sampleRate: 16000, speechThreshold: 0.5 });
    const qualityTracker = new AudioQualityTracker();

    const state: VoiceClientState = {
      clientId,
      sessionId: '',
      turnId: 1,
      language: 'en-IN',
      detectedLanguage: 'en-IN',
      model: 'UW-Q18WUZA',
      appliance: 'air-conditioner',
      sttSession: null,
      activeAbortController: null,
      isAssistantSpeaking: false,
      isAudioPlaying: false,
      lastTranscriptProcessed: '',
      echoGateEnabled: true,
      lastSpokenText: '',
      recentAssistantSpeech: [],
      lastPlaybackEndTime: 0,
      stateMachine,
      transcriptManager,
      endpointDetector,
      languageResolver,
      bargeInController,
      highPassFilter,
      audioEnhancer,
      streamingVad,
      qualityTracker,
      isDucked: false,
    };

    // Forward state transitions to client
    stateMachine.onStateChange((evt: StateTransitionEvent) => {
      this.sendJson(ws, {
        type: 'state_change',
        previousState: evt.previousState,
        currentState: evt.currentState,
        turnId: evt.turnId,
      });
    });

    this.clients.set(ws, state);

    ws.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
      try {
        if (isBinary) {
          const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
          this.handleAudioFrame(ws, state, buffer);
        } else {
          const messageStr = data.toString('utf-8');
          const payload = JSON.parse(messageStr);
          await this.handleControlMessage(ws, state, payload);
        }
      } catch (err: any) {
        console.error('[VoiceSession] Error processing client message:', err.message);
        voiceMetrics.recordError('INTERNAL_ERROR');
        this.sendJson(ws, { type: 'error', message: err.message, code: 'INTERNAL_ERROR', recoverable: true });
      }
    });

    ws.on('close', () => {
      this.cleanupClient(ws, state);
    });

    ws.on('error', (err) => {
      console.error('[VoiceSession] WebSocket client error:', err.message);
      voiceMetrics.recordError('WS_ERROR');
      this.cleanupClient(ws, state);
    });
  }

  /**
   * Handles binary audio frames received from browser microphone
   */
  private handleAudioFrame(ws: WebSocket, state: VoiceClientState, rawBuffer: Buffer): void {
    let pcmPayload = rawBuffer;
    let turnId = state.turnId;

    // Check if client sent framed binary packet
    const decoded = decodeAudioFrame(rawBuffer);
    if (decoded) {
      turnId = decoded.header.turnId;
      pcmPayload = decoded.payload;

      // Drop stale audio frames from older turns
      if (!state.bargeInController.isChunkValid(turnId, state.turnId)) {
        return;
      }
    }

    // 1. Module 2: Preprocess through 80Hz Butterworth High-Pass Biquad
    const filteredPayload = state.highPassFilter.processBuffer(pcmPayload);

    // 2. Module 4: Streaming VAD 512-sample accumulator & Two-Stage Barge-In
    const int16Count = Math.floor(filteredPayload.length / 2);
    const int16Samples = new Int16Array(filteredPayload.buffer, filteredPayload.byteOffset, int16Count);
    const vadPredictions = state.streamingVad.pushSamples(int16Samples);

    let maxProb = 0;
    for (const pred of vadPredictions) {
      if (pred.probability > maxProb) maxProb = pred.probability;
    }

    // Module 5: Update dynamic noise floor & linear power audio quality
    state.qualityTracker.processFrame(int16Samples, maxProb);

    // Two-stage VAD barge-in evaluation while assistant is speaking or playing
    const inWelcomeTurn = state.welcomeTurnId !== undefined && state.turnId === state.welcomeTurnId;
    if ((state.isAssistantSpeaking || state.isAudioPlaying) && !inWelcomeTurn) {
      for (const pred of vadPredictions) {
        const vadDecision = state.bargeInController.evaluateVadStream(pred.probability, 32, state.turnId);
        if (vadDecision.action === 'duck' && !state.isDucked) {
          state.isDucked = true;
          this.sendJson(ws, { type: 'tts_duck', volume: vadDecision.duckVolume ?? 0.2 });
        } else if (vadDecision.action === 'restore' && state.isDucked) {
          state.isDucked = false;
          this.sendJson(ws, { type: 'tts_duck', volume: 1.0 });
        } else if (vadDecision.action === 'cancel' || vadDecision.isConfirmedInterruption) {
          state.isDucked = false;
          console.log(`[Voice] Interrupted via VAD confirmed speech (turn ${vadDecision.previousTurnId} -> ${vadDecision.newTurnId})`);
          this.interruptAssistant(ws, state, vadDecision.reason);
          break;
        }
      }
    }

    // Energy-based VAD evaluation fallback for backward compatibility
    const vad = state.endpointDetector.processFrame(filteredPayload);

    // Evaluate user barge-in while assistant is speaking
    if ((state.isAssistantSpeaking || state.isAudioPlaying) && !state.isDucked && !inWelcomeTurn) {
      const decision = state.bargeInController.evaluateAudioFrame(vad.isVoiced, state.turnId);
      if (decision.isConfirmedInterruption) {
        console.log(`[Voice] Interrupted via VAD audio energy (turn ${decision.previousTurnId} -> ${decision.newTurnId})`);
        this.interruptAssistant(ws, state, decision.reason);
      }
    }

    // 3. Module 3: Dual-path audio enhancement forwarded to Gnani STT
    state.audioEnhancer
      .processBuffer(filteredPayload)
      .then((enhanced) => {
        if (state.sttSession) {
          state.sttSession.sendAudioChunk(enhanced);
        }
      })
      .catch(() => {
        if (state.sttSession) {
          state.sttSession.sendAudioChunk(filteredPayload);
        }
      });
  }

  /**
   * Handles control and lifecycle messages from browser
   */
  private async handleControlMessage(ws: WebSocket, state: VoiceClientState, payload: any): Promise<void> {
    switch (payload.type) {
      case 'session_start':
      case 'start_session': {
        state.language = payload.language || 'en-IN';
        state.detectedLanguage = (state.language === 'AUTO_DETECT' || state.language === 'indic-auto' || state.language === 'auto') ? undefined : state.language.split(/[-_]/)[0];
        state.model = payload.model || 'UW-Q18WUZA';
        state.appliance = payload.appliance || 'air-conditioner';

        // Reset per-session audio preprocessing, VAD, and quality tracking state
        state.highPassFilter.reset();
        state.audioEnhancer.reset();
        state.streamingVad.reset();
        state.qualityTracker.reset();
        state.isDucked = false;
        state.welcomeTurnId = undefined;

        // Connect or get existing chat session
        const initLang = state.detectedLanguage || 'en';
        const sessionRes = chatService.getOrCreateSession(
          payload.sessionId,
          state.model,
          initLang,
          state.appliance
        );
        state.sessionId = sessionRes.sessionId;

        // Initialize upstream Gnani STT streaming session
        this.initSttForClient(ws, state);

        if (state.stateMachine.canTransitionTo('READY')) {
          state.stateMachine.transitionTo('READY', 'Session initialized');
        }

        // Commit initial state to recovery manager
        this.recoveryManager.commitState({
          sessionId: state.sessionId,
          turnId: state.turnId,
          issueId: sessionRes.issueId,
          currentNodeId: sessionRes.currentNodeId,
          language: state.language,
          model: state.model,
          appliance: state.appliance,
          lastCommittedAt: Date.now(),
          isCompleted: sessionRes.isCompleted,
        });

        // Send confirmation to client
        this.sendJson(ws, {
          type: 'session_ready',
          protocolVersion: PROTOCOL_VERSION,
          sessionId: state.sessionId,
          turnId: state.turnId,
          language: state.language,
          model: state.model,
          appliance: state.appliance,
          activeIssueId: sessionRes.issueId,
          activeNodeId: sessionRes.currentNodeId,
          isCompleted: sessionRes.isCompleted,
          config: {
            sampleRate: 16000,
            channels: 1,
            frameDurationMs: 100,
          },
        });

        // Speak a concise, natural welcome greeting on chatbot opening
        const welcomeGreeting = state.language.startsWith('ta')
          ? 'வணக்கம்! நான் உங்கள் ApplianceCare AI உதவியாளர். உங்கள் ஏசியில் என்ன பிரச்சனை?'
          : state.language.startsWith('hi')
            ? 'नमस्ते! मैं आपका ApplianceCare AI सहायक हूँ। आज आपके एयर कंडीशनर में क्या समस्या है?'
            : "Hello! I'm your ApplianceCare AI assistant. Tell me what's wrong with your air conditioner, or pick a suggestion below.";

        const abortCtrl = new AbortController();
        state.activeAbortController = abortCtrl;
        state.bargeInController.setActiveAbortController(abortCtrl);
        state.welcomeTurnId = state.turnId;
        state.isAssistantSpeaking = true;
        state.isAudioPlaying = true;
        state.bargeInController.setPlaybackState(true);
        state.lastSpokenText = welcomeGreeting;
        state.bargeInController.registerAssistantSpeech(welcomeGreeting);

        this.sendJson(ws, {
          type: 'bot_turn_start',
          turnId: state.turnId,
          text: welcomeGreeting,
          detectedLanguage: state.language,
        });

        // Stream welcome audio asynchronously
        this.streamAudioToClient(ws, state, welcomeGreeting, state.turnId, abortCtrl.signal).catch((err) => {
          console.warn('[VoiceSession] Welcome greeting streaming error:', err.message);
        });
        break;
      }

      case 'mic_mute': {
        console.log(`[Voice] Client mic muted=${payload.muted} for session ${state.sessionId}`);
        break;
      }

      case 'heartbeat': {
        this.recoveryManager.recordHeartbeat(state.sessionId);
        this.sendJson(ws, {
          type: 'heartbeat_ack',
          timestamp: payload.timestamp || Date.now(),
          serverTimestamp: Date.now(),
        });
        break;
      }

      case 'barge_in':
      case 'interrupt': {
        this.interruptAssistant(ws, state, payload.reason || 'user_interruption');
        break;
      }

      case 'cancel_turn': {
        this.interruptAssistant(ws, state, payload.reason || 'user_canceled_turn');
        break;
      }

      case 'playback_state': {
        const isPlaying = Boolean(payload.isPlaying);
        state.isAudioPlaying = isPlaying;
        state.isAssistantSpeaking = isPlaying;
        state.bargeInController.setPlaybackState(isPlaying);

        if (!isPlaying) {
          state.lastPlaybackEndTime = Date.now();
          if (state.stateMachine.state === 'SPEAKING') {
            state.stateMachine.transitionTo('LISTENING', 'Playback completed');
          }
        }
        break;
      }

      case 'session_resume': {
        const resumed = this.recoveryManager.getSession(payload.sessionId);
        if (resumed) {
          state.sessionId = resumed.sessionId;
          state.turnId = resumed.turnId + 1;
          state.stateMachine.setTurn(state.turnId);
          state.language = resumed.language;
          state.model = resumed.model;
          state.appliance = resumed.appliance;

          this.initSttForClient(ws, state);
          state.stateMachine.transitionTo('READY', 'Session resumed from committed state');

          this.sendJson(ws, {
            type: 'session_resumed',
            sessionId: state.sessionId,
            turnId: state.turnId,
            recoveredNodeId: resumed.currentNodeId,
            recoveredIssueId: resumed.issueId,
          });
        } else {
          this.sendJson(ws, {
            type: 'error',
            code: 'SESSION_EXPIRED',
            message: 'Session has expired or cannot be resumed. Starting fresh session.',
            recoverable: false,
          });
        }
        break;
      }

      case 'text_input': {
        if (payload.text) {
          await this.processUtterance(ws, state, payload.text);
        }
        break;
      }

      case 'select_option': {
        await this.processOptionSelection(ws, state, payload.optionIndex, payload.issueId, payload.specialAction);
        break;
      }

      case 'set_language': {
        const reqLang = payload.language || 'en-IN';
        state.language = reqLang;
        state.detectedLanguage = (reqLang === 'AUTO_DETECT' || reqLang === 'indic-auto' || reqLang === 'auto') ? undefined : reqLang.split(/[-_]/)[0];
        this.initSttForClient(ws, state);
        this.sendJson(ws, {
          type: 'language_changed',
          language: state.language,
        });
        break;
      }

      case 'session_end':
      case 'end_session': {
        this.recoveryManager.removeSession(state.sessionId);
        if (state.stateMachine.canTransitionTo('SESSION_ENDED')) {
          state.stateMachine.transitionTo('SESSION_ENDED', 'User ended call');
        }
        this.cleanupClient(ws, state);
        this.sendJson(ws, { type: 'session_ended' });
        break;
      }

      default:
        break;
    }
  }

  /**
   * Initializes or updates the Gnani STT streaming session for a client
   */
  private initSttForClient(ws: WebSocket, state: VoiceClientState): void {
    if (state.sttSession) {
      state.sttSession.close();
      state.sttSession = null;
    }

    state.sttSession = gnaniSttService.createStreamingSession({
      languageCode: state.language,
      sampleRate: 16000,
    });

    state.sttSession.on('ready', () => {
      this.sendJson(ws, { type: 'stt_ready', language: state.language });
    });

    state.sttSession.on('transcript', async (data: { transcript: string; isFinal: boolean; detectedLanguage?: string }) => {
      const { transcript, isFinal, detectedLanguage: sttLangHint } = data;
      if (!transcript) return;

      // 1. Interruption Check: If assistant is currently speaking or streaming audio
      if (state.isAssistantSpeaking || state.isAudioPlaying) {
        const interruption = state.bargeInController.evaluateTranscriptInterruption(
          transcript,
          state.turnId,
          state.welcomeTurnId !== undefined && state.turnId === state.welcomeTurnId
        );
        if (interruption.isConfirmedInterruption) {
          console.log(`[Voice] Interrupted by user transcript: "${transcript}"`);
          this.interruptAssistant(ws, state, interruption.reason);
        } else {
          // Acoustic echo or duplicate trailing hypothesis -> suppress without interrupting
          return;
        }
      }

      // 2. Transcript Stabilization & Normalization
      const processed = isFinal
        ? state.transcriptManager.processFinal(transcript, 0.9, state.language)
        : state.transcriptManager.processPartial(transcript, 0.8, state.language);

      state.pendingTranscript = processed.normalized;

      // 3. Multilingual & Code-Switching Language Resolution
      const langResult = state.languageResolver.resolve(
        processed.normalized,
        sttLangHint,
        state.language
      );
      state.detectedLanguage = langResult.primaryLanguage;

      // 4. Send interim transcript to client
      if (!isFinal) {
        this.sendJson(ws, {
          type: 'transcript_partial',
          turnId: state.turnId,
          text: processed.normalized,
          isStable: processed.isStable,
          language: langResult.primaryLanguage,
          confidence: processed.confidence,
        });

        // Also broadcast legacy 'interim_transcript' for UI backward compatibility
        this.sendJson(ws, {
          type: 'interim_transcript',
          text: processed.normalized,
          turnId: state.turnId,
          detectedLanguage: langResult.recommendedResponsePersona,
        });
      }

      // 5. Turn Endpointing Trigger
      if (state.silenceTimer) {
        clearTimeout(state.silenceTimer);
        state.silenceTimer = null;
      }

      const triggerUtterance = async (txt: string) => {
        if (!txt || state.transcriptManager.isDuplicate(txt)) return;
        state.transcriptManager.recordProcessedFinal(txt);
        state.pendingTranscript = undefined;

        this.sendJson(ws, {
          type: 'transcript_final',
          turnId: state.turnId,
          text: txt,
          normalizedText: processed.normalized,
          language: langResult.primaryLanguage,
          confidence: processed.confidence,
          needsConfirmation: processed.needsConfirmation,
        });

        // Also broadcast legacy 'final_transcript'
        this.sendJson(ws, {
          type: 'final_transcript',
          text: txt,
          turnId: state.turnId,
          detectedLanguage: langResult.recommendedResponsePersona,
        });

        await this.processUtterance(ws, state, txt, langResult.recommendedResponsePersona);
      };

      if (isFinal) {
        await triggerUtterance(processed.normalized);
      } else {
        // Fallback auto-finalize if user pauses for 650ms
        state.silenceTimer = setTimeout(async () => {
          if (state.pendingTranscript && !state.transcriptManager.isDuplicate(state.pendingTranscript)) {
            await triggerUtterance(state.pendingTranscript);
          }
        }, 650);
      }
    });

    state.sttSession.on('error', (err: Error) => {
      console.warn('[Gnani STT Warning]', err.message);
      voiceMetrics.recordError('STT_WARNING');
      this.sendJson(ws, {
        type: 'error',
        code: 'STT_UNAVAILABLE',
        message: err.message,
        recoverable: true,
      });
    });

    state.sttSession.on('close', () => {
      if (this.clients.has(ws) && !state.stateMachine.isTerminal()) {
        setTimeout(() => {
          if (this.clients.has(ws) && !state.sttSession) {
            this.initSttForClient(ws, state);
          }
        }, 1000);
      }
    });
  }

  /**
   * Interrupts any active assistant speech or LLM generation (Barge-In)
   */
  public interruptAssistant(ws: WebSocket, state: VoiceClientState, reason: string): void {
    const decision = state.bargeInController.executeInterruption(state.turnId, reason);
    state.turnId = decision.newTurnId;
    state.stateMachine.setTurn(state.turnId);

    if (state.stateMachine.canTransitionTo('INTERRUPTED')) {
      state.stateMachine.transitionTo('INTERRUPTED', reason);
    }

    state.isAssistantSpeaking = false;
    state.isAudioPlaying = false;
    state.isDucked = false;

    voiceMetrics.markInterrupted(state.sessionId, decision.previousTurnId);

    console.log(`[Voice] Interrupted (${reason}), new turnId=${state.turnId}`);

    // Emit stop_playback to immediately silence client
    this.sendJson(ws, {
      type: 'stop_playback',
      turnId: state.turnId,
      reason: 'barge_in',
    });

    // Also emit legacy 'interrupted' event for compatibility
    this.sendJson(ws, {
      type: 'interrupted',
      turnId: state.turnId,
      reason,
    });

    if (state.stateMachine.canTransitionTo('LISTENING')) {
      state.stateMachine.transitionTo('LISTENING', 'Ready for new speech');
    }
  }

  /**
   * Processes a confirmed user utterance through existing diagnostic orchestration and speaks response
   */
  public async processUtterance(
    ws: WebSocket,
    state: VoiceClientState,
    userText: string,
    forcedPersona?: string
  ): Promise<void> {
    const currentTurn = ++state.turnId;
    state.stateMachine.setTurn(currentTurn);

    if (state.stateMachine.canTransitionTo('PROCESSING')) {
      state.stateMachine.transitionTo('PROCESSING', `Processing utterance: "${userText.slice(0, 30)}"`);
    }

    voiceMetrics.startTrace(state.sessionId, currentTurn);
    voiceMetrics.markSpeechEnded(state.sessionId, currentTurn);
    voiceMetrics.markSttFinalized(state.sessionId, currentTurn);

    const abortCtrl = new AbortController();
    state.activeAbortController = abortCtrl;
    state.bargeInController.setActiveAbortController(abortCtrl);
    state.isAssistantSpeaking = true;
    state.isAudioPlaying = false;

    console.log(`[Voice] Turn ${currentTurn}: Processing utterance: "${userText}"`);

    this.sendJson(ws, {
      type: 'processing_start',
      turnId: currentTurn,
      text: userText,
    });

    try {
      const resolvedFromUtterance = state.languageResolver.resolve(userText, undefined, state.language);
      const targetLang = forcedPersona || resolvedFromUtterance.recommendedResponsePersona || 'en';
      const resolvedLocale = state.languageResolver.normalizeLocale(targetLang);

      // Dynamically update voice state to match customer's spoken language
      state.language = resolvedLocale;
      state.detectedLanguage = targetLang;

      // Notify client in real time so UI reflects the customer's language immediately
      this.sendJson(ws, {
        type: 'language_detected',
        detectedLanguage: targetLang,
        language: resolvedLocale,
        turnId: currentTurn,
      });

      if (state.stateMachine.canTransitionTo('REASONING')) {
        state.stateMachine.transitionTo('REASONING', 'Evaluating diagnostic trees');
      }

      // Process message through understanding & chatbot orchestration
      const understanding = conversationUnderstanding.understand(userText, {
        sessionId: state.sessionId,
        appliance: state.appliance,
        model: state.model,
        language: targetLang as any,
      });

      const result = await chatService.processMessage(state.sessionId, {
        text: userText,
        language: targetLang,
        understanding,
      });

      voiceMetrics.markRoutingCompleted(state.sessionId, currentTurn);

      // Evaluate error codes & audio quality for structured observability monitor
      const errorEval = errorCodeExtractor.evaluate(userText, 0.9);
      if (errorEval.candidate) {
        state.qualityTracker.recordEntityConfidence(errorEval.registryValid ? 0.95 : 0.6);
      }
      const quality = state.qualityTracker.getQuality();

      audioObservability.logTurn({
        turnId: currentTurn,
        language: targetLang,
        noise_tier: quality.noiseTier,
        enhancement: state.audioEnhancer.getName(),
        estimated_snr_db: quality.estimatedSnrDb,
        asr_confidence: quality.asrConfidence,
        entities: {
          brand: 'LG',
          error_code: errorEval.canonicalCode,
          model_number: state.model,
        },
        entity_confirmed: {
          error_code: errorEval.customerConfirmed,
          model_number: Boolean(state.model),
        },
        diagnostic_route: result.session?.issueId || (errorEval.canonicalCode ? 'EXPLICIT_ERROR_CODE' : undefined),
        barge_in: {
          triggered: false,
        },
      });

      // Guard: abort if this turn was superseded
      if (abortCtrl.signal.aborted || state.turnId !== currentTurn) {
        console.log(`[Voice] Turn ${currentTurn}: Aborted after reasoning (active turnId=${state.turnId})`);
        return;
      }

      const botMessages = result.botMessages || [];
      console.log(`[Voice] Turn ${currentTurn}: Got ${botMessages.length} bot message(s)`);

      if (botMessages.length === 0) {
        state.isAssistantSpeaking = false;
        if (state.stateMachine.canTransitionTo('READY')) {
          state.stateMachine.transitionTo('READY');
        }
        return;
      }

      // Send bot message data (text, chips, safety alerts) to client
      for (const botMsg of botMessages) {
        this.sendJson(ws, {
          type: 'assistant_message',
          message: botMsg,
          turnId: currentTurn,
          issueId: result.session?.issueId,
          currentNodeId: result.session?.currentNodeId,
          isCompleted: result.session?.isCompleted ?? false,
          session: result.session,
        });
      }

      // Commit committed diagnostic state to recovery manager
      this.recoveryManager.commitState({
        sessionId: state.sessionId,
        turnId: currentTurn,
        issueId: result.session?.issueId,
        currentNodeId: result.session?.currentNodeId,
        language: state.language,
        model: state.model,
        appliance: state.appliance,
        lastCommittedAt: Date.now(),
        isCompleted: result.session?.isCompleted ?? false,
      });

      // Prepare speakable prose directly for continuous streaming TTS
      const fullTurnText = botMessages.map((m) => m.text).filter(Boolean).join('. ');
      const spokenText = VoiceResponseFormatter.formatForSpeech(fullTurnText, targetLang);

      if (!spokenText || abortCtrl.signal.aborted || state.turnId !== currentTurn) {
        state.isAssistantSpeaking = false;
        return;
      }

      if (state.stateMachine.canTransitionTo('SPEAKING')) {
        state.stateMachine.transitionTo('SPEAKING', 'Streaming TTS response');
      }

      // Mark audio as actively playing so barge-in can be evaluated
      state.isAudioPlaying = true;
      state.bargeInController.setPlaybackState(true);
      state.lastSpokenText = spokenText;
      state.bargeInController.registerAssistantSpeech(state.lastSpokenText);

      this.sendJson(ws, {
        type: 'bot_turn_start',
        turnId: currentTurn,
        text: state.lastSpokenText,
        detectedLanguage: targetLang,
      });

      console.log(`[Voice] Turn ${currentTurn}: Starting continuous streaming TTS`);

      await this.streamAudioToClient(ws, state, spokenText, currentTurn, abortCtrl.signal);
    } catch (err: any) {
      console.error('[VoiceSession] Orchestration error:', err.message);
      voiceMetrics.recordError('ORCHESTRATION_ERROR');
      this.sendJson(ws, {
        type: 'error',
        code: 'INTERNAL_ERROR',
        message: err.message || 'Voice orchestration error',
        recoverable: true,
        turnId: currentTurn,
      });
      state.isAssistantSpeaking = false;
      state.isAudioPlaying = false;
      state.bargeInController.setPlaybackState(false);
      if (state.stateMachine.canTransitionTo('ERROR')) {
        state.stateMachine.transitionTo('ERROR', err.message);
      }
    }
  }

  /**
   * Processes an option chip selection clicked or selected by user
   */
  public async processOptionSelection(
    ws: WebSocket,
    state: VoiceClientState,
    optionIndex?: number,
    issueId?: string,
    specialAction?: string
  ): Promise<void> {
    const currentTurn = ++state.turnId;
    state.stateMachine.setTurn(currentTurn);

    if (state.stateMachine.canTransitionTo('PROCESSING')) {
      state.stateMachine.transitionTo('PROCESSING', `Option index: ${optionIndex}`);
    }

    const abortCtrl = new AbortController();
    state.activeAbortController = abortCtrl;
    state.bargeInController.setActiveAbortController(abortCtrl);
    state.isAssistantSpeaking = true;

    try {
      const activeLang = state.detectedLanguage || state.language || 'en';
      const result = await chatService.processMessage(state.sessionId, {
        optionIndex,
        issueId,
        specialAction,
        language: activeLang,
      });

      if (abortCtrl.signal.aborted || state.turnId !== currentTurn) return;

      const botMessages = result.botMessages || [];
      for (const botMsg of botMessages) {
        this.sendJson(ws, {
          type: 'assistant_message',
          message: botMsg,
          turnId: currentTurn,
          issueId: result.session?.issueId,
          currentNodeId: result.session?.currentNodeId,
          isCompleted: result.session?.isCompleted ?? false,
          session: result.session,
        });
      }

      this.recoveryManager.commitState({
        sessionId: state.sessionId,
        turnId: currentTurn,
        issueId: result.session?.issueId,
        currentNodeId: result.session?.currentNodeId,
        language: state.language,
        model: state.model,
        appliance: state.appliance,
        lastCommittedAt: Date.now(),
        isCompleted: result.session?.isCompleted ?? false,
      });

      const fullTurnText = botMessages.map((m) => m.text).filter(Boolean).join('. ');
      const spokenText = VoiceResponseFormatter.formatForSpeech(fullTurnText, activeLang);

      if (spokenText) {
        if (state.stateMachine.canTransitionTo('SPEAKING')) {
          state.stateMachine.transitionTo('SPEAKING');
        }
        state.isAudioPlaying = true;
        state.bargeInController.setPlaybackState(true);
        state.lastSpokenText = spokenText;
        state.bargeInController.registerAssistantSpeech(state.lastSpokenText);

        await this.streamAudioToClient(ws, state, spokenText, currentTurn, abortCtrl.signal);
      }
    } catch (err: any) {
      console.error('[VoiceSession] Option selection error:', err.message);
      state.isAssistantSpeaking = false;
      state.bargeInController.setPlaybackState(false);
    }
  }

  /**
   * Synthesizes and streams audio chunks to browser over WebSocket via continuous SSE stream
   */
  public async streamAudioToClient(
    ws: WebSocket,
    state: VoiceClientState,
    text: string,
    turnId: number,
    signal: AbortSignal
  ): Promise<void> {
    let chunkCount = 0;
    const activePersona = state.detectedLanguage || state.language || 'en';
    const ttsLanguage = state.languageResolver.normalizeLocale(activePersona);

    await ttsStreamingService.streamText(
      text,
      turnId,
      (chunk) => {
        if (signal.aborted || state.turnId !== turnId) return;

        if (chunkCount === 0) {
          voiceMetrics.markTtsFirstByte(state.sessionId, turnId);
        }

        chunkCount++;

        // Send framed production TTS audio chunk
        const chunkPayload = {
          type: 'tts_audio_chunk',
          turnId,
          sequenceNumber: chunk.sequenceNumber,
          isFinal: chunk.isFinal,
          audioBase64: chunk.audioBase64,
          audio: chunk.audioBase64, // compatibility
          sampleRate: chunk.sampleRate || 24000,
        };
        this.sendJson(ws, chunkPayload);

        // Also broadcast legacy 'audio_chunk' event for UI player compatibility
        this.sendJson(ws, {
          ...chunkPayload,
          type: 'audio_chunk',
          chunkIndex: chunk.sequenceNumber,
        });
      },
      {
        voice: 'Nalini',
        language: ttsLanguage,
        sampleRate: 24000,
        signal,
      }
    );

    if (state.turnId === turnId && !signal.aborted) {
      this.sendJson(ws, {
        type: 'bot_turn_end',
        turnId,
        totalChunks: chunkCount,
      });

      // Legacy 'audio_done'
      this.sendJson(ws, {
        type: 'audio_done',
        turnId,
      });

      state.lastPlaybackEndTime = Date.now();
      voiceMetrics.completeTrace(state.sessionId, turnId);
      console.log(`[Voice] Turn ${turnId}: TTS complete, sent ${chunkCount} audio chunks`);
    }
  }

  public async streamSentencesToClient(
    ws: WebSocket,
    state: VoiceClientState,
    sentences: string[],
    turnId: number,
    signal: AbortSignal
  ): Promise<void> {
    return this.streamAudioToClient(ws, state, sentences.join(' '), turnId, signal);
  }

  /**
   * Cleans up client connections and STT sessions on disconnect
   */
  private cleanupClient(ws: WebSocket, state: VoiceClientState): void {
    if (state.silenceTimer) {
      clearTimeout(state.silenceTimer);
      state.silenceTimer = null;
    }
    if (state.sttSession) {
      state.sttSession.close();
      state.sttSession = null;
    }
    if (state.activeAbortController) {
      state.activeAbortController.abort();
      state.activeAbortController = null;
    }
    state.bargeInController.reset();
    state.endpointDetector.reset();
    state.transcriptManager.reset();
    this.clients.delete(ws);
  }

  /**
   * Helper to send JSON messages safely over WebSocket
   */
  private sendJson(ws: WebSocket, payload: ServerMessage | any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

export const voiceSessionManager = new VoiceSessionManager();
