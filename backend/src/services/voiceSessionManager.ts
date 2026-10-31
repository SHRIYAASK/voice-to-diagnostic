/**
 * Voice Session Manager & Real-Time Orchestrator
 *
 * Coordinates:
 * Browser Mic (WebSocket)
 *   -> Gnani Prisma STT (Realtime WebSocket)
 *   -> ApplianceCare Chat Service & Deterministic Router & RAG
 *   -> Hugging Face Evon LLM (gnani/gnani-evon-v3.3-30B-A3B)
 *   -> Gnani Timbre TTS (Streaming SSE)
 *   -> Browser Audio Playback
 *
 * Supports:
 * - Sub-second latency pipeline
 * - Real-time speech transcription preview
 * - Barge-in & interruption handling: immediate cancellation of obsolete turns
 * - Turn ID versioning preventing stale audio playback
 * - Preserves all existing chatbot intelligence, safety guards, and decision trees
 */

import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import { chatService, ChatSession, ChatMessage } from '../engine/chatService';
import { gnaniSttService, GnaniSttStreamingSession } from './gnaniSttService';
import { gnaniTtsService } from './gnaniTtsService';

export interface VoiceClientState {
  clientId: string;
  sessionId: string;
  turnId: number;
  language: string;
  detectedLanguage?: 'ta-IN' | 'hi-IN' | 'en-IN'; // 'ta-IN', 'hi-IN', or 'en-IN' when in auto mode
  model: string;
  appliance: string;
  sttSession: GnaniSttStreamingSession | null;
  activeAbortController: AbortController | null;
  isAssistantSpeaking: boolean;
  /** True only when TTS audio chunks are actively being played back — safe to barge-in */
  isAudioPlaying: boolean;
  lastTranscriptProcessed: string;
  pendingTranscript?: string;
  silenceTimer?: NodeJS.Timeout | null;
  echoGateEnabled: boolean;
  lastSpokenText: string;
  lastPlaybackEndTime: number;
}

/**
 * Detects whether spoken transcript is Tamil, Hindi, or English.
 * Checks for Tamil Unicode ([\u0B80-\u0BFF]), Devanagari ([\u0900-\u097F]),
 * upstream STT language hint, or common code-switched particles.
 */
export function detectLanguageFromTranscript(text: string, sttDetected?: string): 'ta-IN' | 'hi-IN' | 'en-IN' {
  if (sttDetected) {
    const lower = sttDetected.toLowerCase();
    if (lower.startsWith('ta')) return 'ta-IN';
    if (lower.startsWith('hi')) return 'hi-IN';
    if (lower.startsWith('en')) return 'en-IN';
  }
  // Check for Tamil Unicode characters ([\u0B80-\u0BFF])
  if (/[\u0B80-\u0BFF]/.test(text)) {
    return 'ta-IN';
  }
  // Check for Devanagari script (Hindi, Marathi, Sanskrit, etc.)
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi-IN';
  }
  // Check for common Tanglish words in Latin script
  if (/\b(varala|pannunga|iruku|theriyala|kaathu|kathe|nalla|illa|solunga|eppadi|enna|mudiyala)\b/i.test(text)) {
    return 'ta-IN';
  }
  // Check for common Hinglish words in Latin script
  if (/\b(nahi|hai|kya|paani|tapak|awaz|barf|kam|raha|hawa|chal|kar|band|batao)\b/i.test(text)) {
    return 'hi-IN';
  }
  return 'en-IN';
}

/**
 * Strips markdown symbols, asterisks, and emojis for clean, natural speech synthesis
 */
function cleanTextForSpeech(markdown: string): string {
  if (!markdown) return '';
  let cleaned = markdown
    .replace(/\be\.g\.\b/gi, 'for example')
    .replace(/\bi\.e\.\b/gi, 'that is')
    .replace(/\betc\.\b/gi, 'etcetera')
    .replace(/\bvs\.\b/gi, 'versus')
    .replace(/\*\*(.*?)\*\*/g, '$1') // remove bold asterisks
    .replace(/\*(.*?)\*/g, '$1')     // remove italic asterisks
    .replace(/`([^`]+)`/g, '$1')     // remove code ticks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links
    .replace(/^[#\-*•]\s+/gm, '')    // remove markdown list bullets / headers
    .replace(/[🚨🎉⚠️📋⚡💧💨🔊📟🔄🔍📅✓•]/g, '') // remove common UI emojis
    .replace(/\s*\/\s*/g, ' or ')     // replace slashes with "or" for natural speech
    .replace(/\n+/g, '. ')          // convert newlines to sentence pauses
    .replace(/\s{2,}/g, ' ')        // collapse multiple spaces
    .trim();

  // If text is unusually long (> 1200 chars), cap at a clean full-sentence boundary
  if (cleaned.length > 1200) {
    const periodIdx = cleaned.lastIndexOf('.', 1200);
    if (periodIdx > 400) {
      cleaned = cleaned.slice(0, periodIdx + 1).trim();
    }
  }
  return cleaned;
}

/**
 * Evaluates whether an incoming transcript is a trailing duplicate of the current turn's utterance,
 * or an acoustic echo of the assistant's own spoken audio.
 */
function isEchoOrDuplicate(transcript: string, state: VoiceClientState): boolean {
  const candidate = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (!candidate || candidate.length < 2) return true;

  // 0. Explicit interruption commands should NEVER be treated as duplicate or echo
  const INTERRUPT_KEYWORDS = /^(shut\s*up|stop|wait|pause|hold\s*on|quiet|no|listen|enough|shutup)\b/i;
  if (INTERRUPT_KEYWORDS.test(candidate)) {
    return false;
  }

  // 1. Guard against trailing STT packets of the current utterance being answered
  if (state.lastTranscriptProcessed) {
    const lastNorm = state.lastTranscriptProcessed.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (candidate === lastNorm || lastNorm.includes(candidate) || candidate.includes(lastNorm)) {
      return true;
    }
  }

  // 2. Guard against acoustic echo of the assistant's own spoken words
  if (state.lastSpokenText && (state.isAudioPlaying || Date.now() - state.lastPlaybackEndTime < 1500)) {
    const assistantNorm = state.lastSpokenText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (candidate.length >= 3 && assistantNorm.includes(candidate)) {
      return true;
    }
    const userWords = candidate.split(/\s+/).filter((w) => w.length > 2);
    if (userWords.length >= 2) {
      const matched = userWords.filter((w) => assistantNorm.includes(w));
      if (matched.length / userWords.length >= 0.6) {
        return true;
      }
    }
  }

  return false;
}

export class VoiceSessionManager {
  private clients = new Map<WebSocket, VoiceClientState>();

  /**
   * Registers a new browser client WebSocket connection
   */
  public handleConnection(ws: WebSocket): void {
    const clientId = uuid();
    const state: VoiceClientState = {
      clientId,
      sessionId: '',
      turnId: 1,
      language: 'auto', // Default language is auto (indic-auto)
      model: 'UW-Q18WUZA',
      appliance: 'air-conditioner',
      sttSession: null,
      activeAbortController: null,
      isAssistantSpeaking: false,
      isAudioPlaying: false,
      lastTranscriptProcessed: '',
      echoGateEnabled: true,
      lastSpokenText: '',
      lastPlaybackEndTime: 0,
    };

    this.clients.set(ws, state);

    ws.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
      try {
        if (isBinary) {
          this.handleAudioFrame(ws, state, data as Buffer);
        } else {
          const messageStr = data.toString('utf-8');
          const payload = JSON.parse(messageStr);
          await this.handleControlMessage(ws, state, payload);
        }
      } catch (err: any) {
        console.error('[VoiceSession] Error processing client message:', err.message);
        this.sendJson(ws, { type: 'error', message: err.message });
      }
    });

    ws.on('close', () => {
      this.cleanupClient(ws, state);
    });

    ws.on('error', (err) => {
      console.error('[VoiceSession] WebSocket client error:', err.message);
      this.cleanupClient(ws, state);
    });
  }

  /**
   * Handles binary audio frames received from browser microphone
   */
  private handleAudioFrame(ws: WebSocket, state: VoiceClientState, audioBuffer: Buffer): void {
    // Continuously forward microphone audio frames to streaming STT so user speech is always captured
    if (state.sttSession) {
      state.sttSession.sendAudioChunk(audioBuffer);
    }
  }

  /**
   * Handles control and lifecycle messages from browser
   */
  private async handleControlMessage(ws: WebSocket, state: VoiceClientState, payload: any): Promise<void> {
    switch (payload.type) {
      case 'start_session': {
        state.language = payload.language || 'auto';
        state.model = payload.model || 'UW-Q18WUZA';
        state.appliance = payload.appliance || 'air-conditioner';

        // Connect or get existing chat session
        const initialShortLang = state.language.startsWith('ta') ? 'ta' : state.language.startsWith('hi') ? 'hi' : 'en';
        const sessionRes = chatService.getOrCreateSession(
          payload.sessionId,
          state.model,
          initialShortLang,
          state.appliance
        );
        state.sessionId = sessionRes.sessionId;

        // Initialize upstream Gnani STT streaming session
        this.initSttForClient(ws, state);

        this.sendJson(ws, {
          type: 'session_ready',
          sessionId: state.sessionId,
          turnId: state.turnId,
          language: state.language,
          model: state.model,
        });
        break;
      }

      case 'interrupt': {
        this.interruptAssistant(ws, state, 'user_click');
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
        if (payload.language && payload.language !== state.language) {
          state.language = payload.language;
          // Reinitialize STT session with new language
          this.initSttForClient(ws, state);
          this.sendJson(ws, {
            type: 'language_changed',
            language: state.language,
          });
        }
        break;
      }

      case 'set_echo_gate': {
        state.echoGateEnabled = Boolean(payload.enabled);
        this.sendJson(ws, {
          type: 'echo_gate_changed',
          enabled: state.echoGateEnabled,
        });
        break;
      }

      case 'end_session': {
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

      // Barge-In: If the assistant is currently speaking or streaming audio,
      // verify that this is genuinely NEW user speech, and NOT a trailing packet
      // of the utterance we are already answering, or acoustic echo from speakers!
      if (state.isAssistantSpeaking || state.isAudioPlaying) {
        if (!isEchoOrDuplicate(transcript, state)) {
          console.log(`[Voice] Interrupted by new user speech: "${transcript}"`);
          this.interruptAssistant(ws, state, 'user_speech');
        } else {
          // Trailing packet of current utterance or self-speech echo -> ignore without interrupting
          return;
        }
      }

      state.pendingTranscript = transcript;

      // In auto mode, dynamically determine spoken language from transcript text or Gnani metadata
      if (state.language === 'auto' || state.language === 'indic-auto') {
        const detected = detectLanguageFromTranscript(transcript, sttLangHint);
        if (detected !== state.detectedLanguage) {
          state.detectedLanguage = detected;
          const shortCode = detected === 'ta-IN' ? 'ta' : detected === 'hi-IN' ? 'hi' : 'en';
          this.sendJson(ws, {
            type: 'language_detected',
            detectedLanguage: shortCode,
            languageCode: detected,
            turnId: state.turnId,
          });
        }
      }

      const activeShortLang = state.detectedLanguage === 'ta-IN' ? 'ta' : state.detectedLanguage === 'hi-IN' ? 'hi' : 'en';

      // Send live transcript update to client immediately
      if (!isFinal) {
        this.sendJson(ws, {
          type: 'interim_transcript',
          text: transcript,
          turnId: state.turnId,
          detectedLanguage: state.detectedLanguage ? activeShortLang : undefined,
        });
      }

      if (state.silenceTimer) {
        clearTimeout(state.silenceTimer);
        state.silenceTimer = null;
      }

      const triggerUtterance = async (txt: string) => {
        if (!txt || txt === state.lastTranscriptProcessed) return;
        state.lastTranscriptProcessed = txt;
        state.pendingTranscript = undefined;

        this.sendJson(ws, {
          type: 'final_transcript',
          text: txt,
          turnId: state.turnId,
          detectedLanguage: state.detectedLanguage ? activeShortLang : undefined,
        });

        await this.processUtterance(ws, state, txt);
      };

      if (isFinal) {
        await triggerUtterance(transcript);
      } else {
        // Auto-finalize if user pauses speaking for 600ms
        state.silenceTimer = setTimeout(async () => {
          if (state.pendingTranscript && state.pendingTranscript !== state.lastTranscriptProcessed) {
            await triggerUtterance(state.pendingTranscript);
          }
        }, 600);
      }
    });

    state.sttSession.on('error', (err: Error) => {
      console.warn('[Gnani STT Warning]', err.message);
      this.sendJson(ws, {
        type: 'stt_warning',
        message: err.message,
      });
    });

    state.sttSession.on('close', () => {
      // Reconnect if client is still connected
      if (this.clients.has(ws)) {
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
  private interruptAssistant(ws: WebSocket, state: VoiceClientState, reason: string): void {
    state.turnId++;
    state.isAssistantSpeaking = false;
    state.isAudioPlaying = false;

    if (state.activeAbortController) {
      state.activeAbortController.abort();
      state.activeAbortController = null;
    }

    console.log(`[Voice] Interrupted (${reason}), new turnId=${state.turnId}`);

    this.sendJson(ws, {
      type: 'interrupted',
      turnId: state.turnId,
      reason,
    });
  }

  /**
   * Processes a confirmed user utterance through existing diagnostic orchestration and speaks response
   */
  private async processUtterance(ws: WebSocket, state: VoiceClientState, userText: string): Promise<void> {
    // Semantic Self-Speech Echo Filter (Anti-Feedback Guard)
    const isPlaybackRecent = state.isAudioPlaying || (Date.now() - state.lastPlaybackEndTime < 1200);
    if (isPlaybackRecent && state.lastSpokenText) {
      const candidate = userText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const assistantNorm = state.lastSpokenText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      
      const isSubstring = candidate.length >= 3 && assistantNorm.includes(candidate);
      let isOverlap = false;
      const userWords = candidate.split(/\s+/).filter((w) => w.length > 2);
      if (userWords.length >= 2) {
        const matched = userWords.filter((w) => assistantNorm.includes(w));
        isOverlap = matched.length / userWords.length >= 0.7;
      }

      if (isSubstring || isOverlap) {
        console.log(`[Voice] Rejected acoustic echo utterance from assistant speech: "${userText}"`);
        return;
      }
    }

    const currentTurn = ++state.turnId;
    const abortCtrl = new AbortController();
    state.activeAbortController = abortCtrl;
    state.isAssistantSpeaking = true;
    state.isAudioPlaying = false; // Not playing yet — just processing

    console.log(`[Voice] Turn ${currentTurn}: Processing utterance: "${userText}"`);

    // Broadcast authoritative final transcript with matching current turn ID
    this.sendJson(ws, {
      type: 'final_transcript',
      text: userText,
      turnId: currentTurn,
    });

    this.sendJson(ws, {
      type: 'processing_start',
      turnId: currentTurn,
      text: userText,
    });

    try {
      const targetLang = (state.language === 'auto' || state.language === 'indic-auto')
        ? (state.detectedLanguage === 'ta-IN' ? 'ta' : state.detectedLanguage === 'hi-IN' ? 'hi' : 'en')
        : (state.language.startsWith('ta') ? 'ta' : state.language.startsWith('hi') ? 'hi' : 'en');

      // 1. Process message through Groq-powered chatbot orchestration
      const result = await chatService.processMessage(state.sessionId, { text: userText, language: targetLang });

      // Guard: abort if this turn was superseded (by a user-initiated interrupt click, NOT audio frames)
      if (abortCtrl.signal.aborted || state.turnId !== currentTurn) {
        console.log(`[Voice] Turn ${currentTurn}: Aborted after LLM (current turnId=${state.turnId})`);
        return;
      }

      const botMessages = result.botMessages || [];
      console.log(`[Voice] Turn ${currentTurn}: Got ${botMessages.length} bot message(s)`);

      if (botMessages.length === 0) {
        state.isAssistantSpeaking = false;
        return;
      }

      // Send bot message data (text, chips, safety alerts) to client
      for (const botMsg of botMessages) {
        this.sendJson(ws, {
          type: 'assistant_message',
          message: botMsg,
          turnId: currentTurn,
        });
      }

      // 2. Synthesize and stream speech response across all messages in this turn
      const fullTurnText = botMessages
        .map((m) => m.text)
        .filter(Boolean)
        .join('. ');
      const spokenText = cleanTextForSpeech(fullTurnText);

      if (!spokenText || abortCtrl.signal.aborted || state.turnId !== currentTurn) {
        state.isAssistantSpeaking = false;
        return;
      }

      // Mark audio as actively playing so barge-in is now safe
      state.isAudioPlaying = true;
      state.lastSpokenText = spokenText;
      console.log(`[Voice] Turn ${currentTurn}: Starting TTS for: "${spokenText.slice(0, 80)}..."`);

      await this.streamSpeechToClient(ws, state, spokenText, currentTurn, abortCtrl.signal);
    } catch (err: any) {
      console.error('[VoiceSession] Orchestration error:', err.message);
      this.sendJson(ws, {
        type: 'error',
        message: err.message || 'Voice orchestration error',
        turnId: currentTurn,
      });
      state.isAssistantSpeaking = false;
      state.isAudioPlaying = false;
    }
  }

  /**
   * Processes an option chip selection clicked or selected by user
   */
  private async processOptionSelection(
    ws: WebSocket,
    state: VoiceClientState,
    optionIndex?: number,
    issueId?: string,
    specialAction?: string
  ): Promise<void> {
    const currentTurn = ++state.turnId;
    const abortCtrl = new AbortController();
    state.activeAbortController = abortCtrl;
    state.isAssistantSpeaking = true;

    try {
      const result = await chatService.processMessage(state.sessionId, {
        optionIndex,
        issueId,
        specialAction,
      });

      if (abortCtrl.signal.aborted || state.turnId !== currentTurn) return;

      const botMessages = result.botMessages || [];
      for (const botMsg of botMessages) {
        this.sendJson(ws, {
          type: 'assistant_message',
          message: botMsg,
          turnId: currentTurn,
        });
      }

      const fullTurnText = botMessages
        .map((m) => m.text)
        .filter(Boolean)
        .join('. ');
      const spokenText = cleanTextForSpeech(fullTurnText);
      if (spokenText) {
        await this.streamSpeechToClient(ws, state, spokenText, currentTurn, abortCtrl.signal);
      }
    } catch (err: any) {
      console.error('[VoiceSession] Option selection error:', err.message);
      state.isAssistantSpeaking = false;
    }
  }

  /**
   * Synthesizes and streams audio chunks to browser over WebSocket
   */
  private async streamSpeechToClient(
    ws: WebSocket,
    state: VoiceClientState,
    text: string,
    turnId: number,
    signal: AbortSignal
  ): Promise<void> {
    let chunkCount = 0;

    let ttsLanguage = 'en-IN';
    if (state.language === 'auto' || state.language === 'indic-auto') {
      ttsLanguage = state.detectedLanguage || 'en-IN';
    } else if (state.language.startsWith('ta')) {
      ttsLanguage = 'ta-IN';
    } else if (state.language.startsWith('hi')) {
      ttsLanguage = 'hi-IN';
    } else {
      ttsLanguage = state.language;
    }

    const ttsResult = await gnaniTtsService.streamSynthesize(
      text,
      (chunk) => {
        // Discard chunks if turn was interrupted
        if (signal.aborted || state.turnId !== turnId) return;

        chunkCount++;
        this.sendJson(ws, {
          type: 'audio_chunk',
          turnId,
          chunkIndex: chunk.chunkIndex,
          audio: chunk.audioBase64,
        });
      },
      {
        voice: 'Nalini',
        language: ttsLanguage || 'en-IN',
        sampleRate: 24000,
        signal,
      }
    );

    // If streaming synthesis encountered an error or yielded no chunks, use REST fallback
    if (!ttsResult.success && chunkCount === 0 && !signal.aborted && state.turnId === turnId) {
      const restRes = await gnaniTtsService.synthesizeToBuffer(text, { voice: 'Nalini', language: ttsLanguage || 'en-IN', signal });
      if (restRes.success && restRes.audioBuffer && state.turnId === turnId) {
        this.sendJson(ws, {
          type: 'audio_chunk',
          turnId,
          chunkIndex: 1,
          audio: restRes.audioBuffer.toString('base64'),
        });
      }
    }

    if (state.turnId === turnId && !signal.aborted) {
      this.sendJson(ws, {
        type: 'audio_done',
        turnId,
      });
      state.isAssistantSpeaking = false;
      state.isAudioPlaying = false;
      state.lastPlaybackEndTime = Date.now();
      console.log(`[Voice] Turn ${turnId}: TTS complete, sent ${chunkCount} audio chunks`);
    }
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
    this.clients.delete(ws);
  }

  /**
   * Helper to send JSON messages safely over WebSocket
   */
  private sendJson(ws: WebSocket, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

export const voiceSessionManager = new VoiceSessionManager();
