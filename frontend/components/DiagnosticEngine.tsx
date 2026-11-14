'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  RotateCcw,
  Languages,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  ChevronRight,
  Info,
  Star,
  Thermometer,
  Zap,
  Droplets,
  Wind,
  Volume2,
  VolumeX,
  ArrowDown,
  MoreVertical,
  X,
  Mic,
  MicOff,
  PhoneCall,
  Loader2,
  ShieldCheck,
  Headphones,
  UserCheck,
} from 'lucide-react';
import { apiClient, ChatMessageItem, ChatSessionData, UserProfile } from '../lib/api';
import { getApplianceById } from '../lib/appliances';
import { AudioRecorder } from '../lib/audioRecorder';
import { AudioQueuePlayer } from '../lib/audioPlayer';

interface DiagnosticEngineProps {
  onEscalateToBooking: (context: {
    symptom: string;
    probable_cause?: string;
    parts?: string[];
    priority?: string;
    error_code?: string;
  }) => void;
  onTicketCreated?: (ticketId: string) => void;
  selectedModel: string;
  selectedAppliance?: string;
  currentUser?: UserProfile | null;
}

interface StarterPill {
  label: string;
  labelHi?: string;
  value: string;
  issueId?: string;
}

// Compact Starter Action Pills for the AC module
const STARTER_ACTION_PILLS: StarterPill[] = [
  { label: '❄️ Not Cooling / Room Warm', labelHi: '❄️ ठंडक नहीं / कमरा गर्म', value: 'AC01', issueId: 'AC01' },
  { label: '⚡ Will Not Turn On', labelHi: '⚡ चालू नहीं हो रहा', value: 'AC02', issueId: 'AC02' },
  { label: '⚠️ MCB Tripping', labelHi: '⚠️ एमसीबी ट्रिप हो रही है', value: 'AC03', issueId: 'AC03' },
  { label: '💧 Water Dripping / Leak', labelHi: '💧 पानी टपक रहा है / लीक', value: 'AC04', issueId: 'AC04' },
  { label: '🫧 Foul or Burning Smell', labelHi: '🫧 दुर्गंध या जलने की गंध', value: 'AC05', issueId: 'AC05' },
  { label: '🔊 Loud / Rattling Noise', labelHi: '🔊 तेज / खड़खड़ाहट की आवाज', value: 'AC06', issueId: 'AC06' },
  { label: '▦ Error Code on Display', labelHi: '▦ डिस्प्ले पर एरर कोड', value: 'ERROR_CODE' },
  { label: '↩️ Remote Not Responding', labelHi: '↩️ रिमोट काम नहीं कर रहा', value: 'AC08', issueId: 'AC08' },
];

export const DiagnosticEngine: React.FC<DiagnosticEngineProps> = ({
  onEscalateToBooking,
  onTicketCreated,
  selectedModel,
  selectedAppliance = 'air-conditioner',
  currentUser,
}) => {
  const [session, setSession] = useState<ChatSessionData | null>(null);
  const sessionIdRef = useRef<string>('');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [language, setLanguage] = useState<'auto' | 'ta' | 'hi' | 'en'>('en');
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);

  // Scroll management states
  const [isNearBottom, setIsNearBottom] = useState<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [isNavigatingToBooking, setIsNavigatingToBooking] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inline Voice Agent States (Hands-Free STT -> Evon -> Tree/RAG -> Timbre TTS)
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error'>('idle');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Echo Gate & Acoustic Self-Speech Suppression
  const [isEchoGateEnabled, setIsEchoGateEnabled] = useState<boolean>(true);
  const echoGateActiveRef = useRef<boolean>(false);
  const echoGateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpokenAssistantTextRef = useRef<string>('');
  const lastPlaybackEndTimeRef = useRef<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioQueuePlayer | null>(null);
  const activeTurnIdRef = useRef<number>(1);
  const hasReceivedAudioForTurnRef = useRef<boolean>(false);
  const processedChunksRef = useRef<Set<string>>(new Set());
  const recognitionRef = useRef<any>(null);
  const isSttFallbackRef = useRef<boolean>(false);
  const playbackStartTimeRef = useRef<number>(0);
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const lastAppendedUserTextRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  // Checks if a candidate user transcript is an acoustic echo of what the assistant spoke
  const isEchoOfAssistant = (userText: string): boolean => {
    const candidate = userText?.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
    if (!candidate || candidate.length < 3) return false;

    // Echo only physically occurs while assistant is speaking or within 1.2s of playback stopping
    const isPlaybackRecent = isAssistantSpeaking || (Date.now() - lastPlaybackEndTimeRef.current < 1200);
    if (!isPlaybackRecent) return false;

    const assistantSpeech = lastSpokenAssistantTextRef.current
      .toLowerCase()
      .replace(/[*#`_📋⚠️🚨]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!assistantSpeech) return false;

    // Direct substring match
    if (assistantSpeech.includes(candidate) || candidate.includes(assistantSpeech)) {
      console.log(`[EchoGate] Dropped direct substring echo: "${userText}"`);
      return true;
    }

    // High word overlap match during playback
    const userWords = candidate.split(/\s+/).filter((w) => w.length > 2);
    if (userWords.length >= 2) {
      const matchingWords = userWords.filter((w) => assistantSpeech.includes(w));
      const overlapRatio = matchingWords.length / userWords.length;
      if (overlapRatio >= 0.5) {
        console.log(`[EchoGate] Dropped word overlap echo (${Math.round(overlapRatio * 100)}%): "${userText}"`);
        return true;
      }
    }

    return false;
  };

  // Coordinates playback state and UI speech indicator
  const setPlaybackActive = (playing: boolean) => {
    setIsAssistantSpeaking(playing);
    if (playing) {
      playbackStartTimeRef.current = Date.now();
      consecutiveSpeechFramesRef.current = 0;
      if (echoGateTimerRef.current) {
        clearTimeout(echoGateTimerRef.current);
        echoGateTimerRef.current = null;
      }
      echoGateActiveRef.current = true;
      setVoiceStatus('speaking');

      // Full-Duplex Invariant: NEVER mute the microphone during assistant playback!
      // The microphone must stay continuously unmuted so user speech reaches backend
      // VAD for fast ducking and confirmed barge-in, and Gnani STT for transcription.
      // Acoustic echo suppression is handled by hardware AEC and server-side VAD/echo filters.
      recorderRef.current?.setMuted(false);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'playback_state', isPlaying: true }));
      }
    } else {
      consecutiveSpeechFramesRef.current = 0;
      lastPlaybackEndTimeRef.current = Date.now();
      playerRef.current?.setVolume(1.0, 10);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'playback_state', isPlaying: false }));
      }
      // Decay tail for room acoustic reflections and speaker decay (400ms)
      if (echoGateTimerRef.current) clearTimeout(echoGateTimerRef.current);
      echoGateTimerRef.current = setTimeout(() => {
        echoGateActiveRef.current = false;
        if (isVoiceActive) {
          setVoiceStatus((prev) => (prev === 'speaking' ? 'listening' : prev));
        }
      }, 400);
    }
  };

  // Toggle between Speaker Mode (Echo Gate ON) and Headphone Mode (Echo Gate OFF)
  const toggleEchoGate = () => {
    setIsEchoGateEnabled((prev) => {
      const next = !prev;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'set_echo_gate', enabled: next }));
      }
      if (!next) {
        echoGateActiveRef.current = false;
      } else if (isAssistantSpeaking) {
        echoGateActiveRef.current = true;
      }
      return next;
    });
  };

  // Stop/cleanup voice resources
  const stopVoiceMode = () => {
    if (echoGateTimerRef.current) {
      clearTimeout(echoGateTimerRef.current);
      echoGateTimerRef.current = null;
    }
    echoGateActiveRef.current = false;
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.close();
      playerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'mic_mute', muted: true }));
          wsRef.current.close();
        }
      } catch {}
      wsRef.current = null;
    }
    setIsVoiceActive(false);
    isSttFallbackRef.current = false;
    setVoiceStatus('idle');
    setIsAssistantSpeaking(false);
    setInterimTranscript('');
  };

  // Immediate barge-in / speech interrupt
  const handleInterruptSpeech = () => {
    if (echoGateTimerRef.current) {
      clearTimeout(echoGateTimerRef.current);
      echoGateTimerRef.current = null;
    }
    echoGateActiveRef.current = false;
    recorderRef.current?.setMuted(false);

    if (playerRef.current) {
      playerRef.current.stop();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
    setIsAssistantSpeaking(false);
    setVoiceStatus('listening');
  };

  // Trigger automatic navigation to Book Technician page
  const triggerAutoBookingNavigation = (bookingContext?: {
    symptom?: string;
    probable_cause?: string;
    parts?: string[];
    priority?: string;
    error_code?: string;
  }) => {
    setIsNavigatingToBooking(true);
    const lastConclusionMsg = [...messages].reverse().find((m) => m.conclusion);
    const conclusion = lastConclusionMsg?.conclusion;
    const finalContext = {
      symptom: bookingContext?.symptom || `${applianceInfo.name} - Diagnostic Service Request`,
      probable_cause: bookingContext?.probable_cause || conclusion?.probable_cause || 'Diagnostic issue detected',
      parts: bookingContext?.parts || conclusion?.parts || [],
      priority: bookingContext?.priority || conclusion?.priority || 'High',
      error_code: bookingContext?.error_code,
    };

    setTimeout(() => {
      onEscalateToBooking(finalContext);
    }, 1200);
  };

  // Safely appends a user message to chat transcript, deduplicating against recent user bubbles
  const appendUserMessage = (userText: string) => {
    const trimmed = userText?.trim();
    if (!trimmed) return;

    // Strict deduplication guard against immediate duplicate triggers (< 1500ms)
    const now = Date.now();
    const lastNorm = lastAppendedUserTextRef.current.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const currentNorm = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (
      lastNorm &&
      lastNorm === currentNorm &&
      now - lastAppendedUserTextRef.current.time < 1500
    ) {
      console.log('[DiagnosticEngine] Dropped duplicate user bubble:', trimmed);
      return;
    }
    lastAppendedUserTextRef.current = { text: trimmed, time: now };

    setMessages((prev) => [
      ...prev,
      {
        id: 'voice-user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        sender: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
      },
    ]);
    setIsNearBottom(true);
    setTimeout(() => scrollToBottom(true), 30);
  };

  // Handle incoming voice session messages from backend WebSocket
  const handleVoiceServerMessage = (data: any) => {
    switch (data.type) {
      case 'session_ready':
        setVoiceStatus('listening');
        activeTurnIdRef.current = data.turnId || 1;
        if (data.sessionId) {
          sessionIdRef.current = data.sessionId;
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  sessionId: data.sessionId,
                  issueId: data.activeIssueId ?? prev.issueId,
                  currentNodeId: data.activeNodeId ?? prev.currentNodeId,
                  isCompleted: data.isCompleted ?? prev.isCompleted,
                }
              : prev
          );
        }
        break;

      case 'language_detected':
        if (data.detectedLanguage && language === 'auto') {
          const clean = data.detectedLanguage.toLowerCase().split(/[-_]/)[0];
          setLanguage(clean as any);
        }
        break;

      case 'interim_transcript':
        if (data.turnId >= activeTurnIdRef.current) {
          if (isAssistantSpeaking || playerRef.current?.playing || (typeof window !== 'undefined' && window.speechSynthesis?.speaking)) {
            handleInterruptSpeech();
          }
          setInterimTranscript(data.text);
          setVoiceStatus('listening');
        }
        break;

      case 'transcript_final':
      case 'final_transcript':
        if (data.turnId && data.turnId > activeTurnIdRef.current) {
          activeTurnIdRef.current = data.turnId;
          if (playerRef.current) {
            playerRef.current.stop();
          }
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
        }
        if (data.text) {
          setInterimTranscript('');
          appendUserMessage(data.text);
          setVoiceStatus('processing');
          setIsLoading(true);
        }
        break;

      case 'processing_start':
        if (data.turnId && data.turnId > activeTurnIdRef.current) {
          activeTurnIdRef.current = data.turnId;
          if (playerRef.current) {
            playerRef.current.stop();
          }
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
        }
        if (data.text) {
          setInterimTranscript('');
        }
        setVoiceStatus('processing');
        setIsLoading(true);
        hasReceivedAudioForTurnRef.current = false;
        break;

      case 'assistant_message':
        if (data.turnId && data.turnId > activeTurnIdRef.current) {
          activeTurnIdRef.current = data.turnId;
        }
        if (data.turnId >= activeTurnIdRef.current && data.message) {
          const botMsg: ChatMessageItem = data.message;
          lastSpokenAssistantTextRef.current = botMsg.text || '';
          if (data.session?.messages && data.session.messages.length > 0) {
            setMessages(data.session.messages);
          } else {
            setMessages((prev) => {
              if (prev.some((m) => m.id === botMsg.id)) return prev;
              return [...prev, botMsg];
            });
          }
          setIsLoading(false);
          setIsNearBottom(true);
          setTimeout(() => scrollToBottom(true), 30);

          if (data.session) {
            setSession(data.session);
            if (data.session.sessionId) {
              sessionIdRef.current = data.session.sessionId;
            }
          } else if (data.issueId || data.currentNodeId) {
            setSession((prev) =>
              prev
                ? {
                    ...prev,
                    issueId: data.issueId ?? prev.issueId,
                    currentNodeId: data.currentNodeId ?? prev.currentNodeId,
                    isCompleted: data.isCompleted ?? prev.isCompleted,
                  }
                : prev
            );
          }

          if (botMsg.action === 'NAV_BOOKING') {
            triggerAutoBookingNavigation(botMsg.bookingContext);
          }
          if (botMsg.action === 'BOOKING_CONFIRMED' && botMsg.ticketId) {
            onTicketCreated?.(botMsg.ticketId);
          }
        }
        break;

      case 'bot_turn_start':
        if (data.turnId) {
          activeTurnIdRef.current = data.turnId;
          if (playerRef.current) {
            playerRef.current.setActiveTurnId(data.turnId);
          }
        }
        // AudioQueuePlayer onStateChange callback activates speaking state once chunks actually begin playing
        break;

      case 'audio_chunk':
      case 'tts_audio_chunk': {
        // If audio chunks for a NEW turn arrive, immediately purge residual audio from old turn!
        const chunkTurn = data.turnId || activeTurnIdRef.current;
        const seq = data.sequenceNumber || data.chunkIndex || 0;
        const chunkKey = `${chunkTurn}:${seq}`;

        // Deduplicate chunks if received across both event names
        if (processedChunksRef.current.has(chunkKey)) {
          break;
        }
        processedChunksRef.current.add(chunkKey);
        if (processedChunksRef.current.size > 200) {
          const firstKey = processedChunksRef.current.values().next().value;
          if (firstKey) processedChunksRef.current.delete(firstKey);
        }

        if (chunkTurn > activeTurnIdRef.current) {
          activeTurnIdRef.current = chunkTurn;
          if (playerRef.current) {
            playerRef.current.setActiveTurnId(chunkTurn);
          }
        }
        const audioData = data.audioBase64 || data.audio;
        if (chunkTurn >= activeTurnIdRef.current && audioData) {
          hasReceivedAudioForTurnRef.current = true;
          playerRef.current?.enqueueBase64(audioData, chunkTurn);
        }
        break;
      }

      case 'audio_done':
        // If external TTS streamed no chunks or player is idle, fallback to browser SpeechSynthesis
        const shouldFallback = (!hasReceivedAudioForTurnRef.current || (playerRef.current && !playerRef.current.playing)) && isVoiceActive;
        if (shouldFallback && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          setTimeout(() => {
            if (playerRef.current && playerRef.current.playing) return;
            setMessages((currentMsgs) => {
              const latestBotTexts: string[] = [];
              for (let i = currentMsgs.length - 1; i >= 0; i--) {
                if (currentMsgs[i].sender === 'bot') {
                  latestBotTexts.unshift(currentMsgs[i].text);
                } else {
                  break;
                }
              }
              if (latestBotTexts.length > 0) {
                const combined = latestBotTexts.join('. ');
                const clean = combined
                  .replace(/\be\.g\.\b/gi, 'for example')
                  .replace(/\bi\.e\.\b/gi, 'that is')
                  .replace(/\s*\/\s*/g, ' or ')
                  .replace(/[*#`_📋⚠️🚨]/g, '')
                  .trim();
                lastSpokenAssistantTextRef.current = clean;
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(clean);
                utterance.lang = language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';
                utterance.onstart = () => {
                  setPlaybackActive(true);
                };
                utterance.onend = () => {
                  setPlaybackActive(false);
                };
                window.speechSynthesis.speak(utterance);
              }
              return currentMsgs;
            });
          }, 250);
        }
        break;

      case 'tts_duck': {
        const duckVol = typeof data.volume === 'number' ? data.volume : 0.2;
        playerRef.current?.setVolume(duckVol, 50);
        break;
      }

      case 'stop_playback':
      case 'interrupted':
        activeTurnIdRef.current = data.turnId || activeTurnIdRef.current;
        if (echoGateTimerRef.current) {
          clearTimeout(echoGateTimerRef.current);
          echoGateTimerRef.current = null;
        }
        echoGateActiveRef.current = false;
        if (playerRef.current) {
          playerRef.current.stop();
          playerRef.current.setVolume(1.0, 10);
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        setIsAssistantSpeaking(false);
        setVoiceStatus('listening');
        break;

      case 'error':
        console.warn('[Voice Server Warning]', data.message);
        if (data.code === 'STT_UNAVAILABLE') {
          isSttFallbackRef.current = true;
          console.log('[Voice Client] Upstream STT unavailable; activated browser WebSpeech fallback mode');
        }
        break;
    }
  };

  // Start inline voice mode
  const startVoiceMode = async () => {
    try {
      setVoiceError(null);
      isSttFallbackRef.current = false;
      setVoiceStatus('connecting');
      setIsVoiceActive(true);

      // Initialize audio queue player for streaming playback
      const player = new AudioQueuePlayer((isPlaying) => {
        setPlaybackActive(isPlaying);
      });
      playerRef.current = player;
      // Explicitly unlock AudioContext during the user's click gesture
      await player.unlock();

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const defaultHost = window.location.hostname || 'localhost';
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}//${defaultHost}:4000/api/voice`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start_session',
            sessionId: sessionIdRef.current || session?.sessionId || '',
            language: language === 'auto' ? 'indic-auto' : language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN',
            model: selectedModel,
            appliance: selectedAppliance,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleVoiceServerMessage(data);
        } catch (err) {
          console.error('[VoiceWS parse error]', err);
        }
      };

      ws.onerror = (e) => {
        console.error('[VoiceWS error]', e);
        setVoiceStatus('error');
        setVoiceError('Voice server connection failed. Please ensure backend is running.');
      };

      ws.onclose = () => {
        if (isVoiceActive) {
          setVoiceStatus('idle');
          setIsVoiceActive(false);
        }
      };

      // Initialize microphone recorder (16 kHz mono linear PCM little-endian)
      const recorder = new AudioRecorder({
        sampleRate: 16000,
        autoGainControl: true,
        onAudioData: (buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            // Full-Duplex Invariant: ALWAYS stream audio frames to WebSocket so server-side
            // 80Hz filter, Silero VAD, and Gnani STT receive 100% of user speech audio.
            ws.send(buffer);

            const isPlaying = playerRef.current?.playing || isAssistantSpeaking || (typeof window !== 'undefined' && window.speechSynthesis?.speaking);

            // Compute real-time RMS energy of the incoming 16-bit linear PCM frame
            const int16 = new Int16Array(buffer);
            let sumSquares = 0;
            for (let i = 0; i < int16.length; i++) {
              const norm = int16[i] / 32768;
              sumSquares += norm * norm;
            }
            const rms = Math.sqrt(sumSquares / int16.length);

            // Instant Client-Side Interruption (Barge-In) Detection & Two-Stage Ducking:
            // When user speaks over assistant audio:
            if (isPlaying) {
              // Conversational speech into microphone typically has RMS >= 0.016
              // Background noise with AEC typically has RMS < 0.012
              if (rms >= 0.018) {
                consecutiveSpeechFramesRef.current++;

                // Stage 1 (Fast Local Ducking): Immediately drop playback volume to 20% within 40ms
                playerRef.current?.setVolume(0.2, 40);

                // Stage 2 (Confirmed Interruption): Sustained speech (>= 2 frames ~160ms) or loud burst (rms >= 0.045)
                if (consecutiveSpeechFramesRef.current >= 2 || rms >= 0.045) {
                  console.log(`[BargeIn] Client-side speech interruption confirmed (RMS=${rms.toFixed(4)}, frames=${consecutiveSpeechFramesRef.current}). Halting playback.`);
                  consecutiveSpeechFramesRef.current = 0;

                  // Immediately halt all browser audio playback (< 40ms)
                  if (playerRef.current) {
                    playerRef.current.stop();
                    playerRef.current.setVolume(1.0, 10);
                  }
                  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  setIsAssistantSpeaking(false);
                  setPlaybackActive(false);
                  setVoiceStatus('listening');

                  // Signal backend to abort TTS streaming & advance turn
                  ws.send(JSON.stringify({ type: 'barge_in', reason: 'client_vad' }));
                }
              } else if (rms < 0.012) {
                // Decay speech frames on silence
                if (consecutiveSpeechFramesRef.current > 0) {
                  consecutiveSpeechFramesRef.current = Math.max(0, consecutiveSpeechFramesRef.current - 1);
                }
              }
            }
          }
        },
        onError: (err) => {
          console.error('[AudioRecorder error]', err);
          setVoiceStatus('error');
          setVoiceError('Microphone access denied. Please allow microphone permissions in your browser.');
        },
      });
      recorderRef.current = recorder;
      await recorder.start();

      // Dual-layer STT resilience: Initialize Web Speech API as resilient local recognizer
      const SpeechRecognition = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = language === 'ta' ? 'ta-IN' : language === 'hi' ? 'hi-IN' : 'en-IN';

          recognition.onresult = (event: any) => {
            const isPlaying = playerRef.current?.playing || isAssistantSpeaking;
            if (isPlaying) return;

            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
              } else {
                interim += event.results[i][0].transcript;
              }
            }

            if (interim && !final) {
              setInterimTranscript(interim.trim());
              setVoiceStatus('listening');
            }

            if (final.trim()) {
              const cleaned = final.trim();
              setInterimTranscript('');

              // Standby fallback guard: if WebSocket is open and active, backend Gnani STT owns dispatching
              const isCloudSttActive = !isSttFallbackRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && voiceStatus !== 'error';
              if (isCloudSttActive) {
                console.log(`[WebSpeech standby] Cloud STT is active; skipping fallback dispatch for: "${cleaned}"`);
                return;
              }

              const now = Date.now();
              // Prevent duplicate dispatch if backend STT already processed this utterance
              if (now - lastAppendedUserTextRef.current.time > 2000 || lastAppendedUserTextRef.current.text !== cleaned) {
                lastAppendedUserTextRef.current = { text: cleaned, time: now };
                handleSendMessage(cleaned);
              }
            }
          };

          recognition.onerror = (e: any) => {
            console.warn('[WebSpeech fallback warning]', e.error);
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn('[WebSpeech init skipped]', e);
        }
      }
    } catch (err: any) {
      console.error('[startVoiceMode failed]', err);
      setVoiceStatus('error');
      setVoiceError(err.message || 'Failed to initialize microphone');
    }
  };

  // Toggle voice mode on/off
  const toggleVoiceMode = () => {
    if (isVoiceActive) {
      stopVoiceMode();
    } else {
      startVoiceMode();
    }
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopVoiceMode();
    };
  }, []);

  const applianceInfo = getApplianceById(selectedAppliance);

  // Scroll to bottom helper
  const scrollToBottom = (smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  // Scroll listener to detect if user has scrolled away from the bottom
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceToBottom < 80;
    setIsNearBottom(atBottom);
    setShowScrollBottomBtn(!atBottom && messages.length > 2);
  };

  // Auto-scroll when new messages arrive or loading state changes, only if already near bottom
  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom(true);
    }
  }, [messages, isLoading]);

  // Initialize chat session on mount or when model/appliance changes
  useEffect(() => {
    async function initSession() {
      try {
        setIsLoading(true);
        const res = await apiClient.createChatSession({
          model: selectedModel || 'UW-Q18WUZA',
          language: language === 'auto' ? 'en' : language,
          appliance: selectedAppliance || 'air-conditioner',
          currentUser: currentUser,
        });
        setSession(res.session);
        sessionIdRef.current = res.session.sessionId;
        setMessages(res.session.messages || []);
        setIsNearBottom(true);
        setTimeout(() => scrollToBottom(false), 50);
      } catch (err) {
        console.error('Failed to initialize diagnostic chat:', err);
      } finally {
        setIsLoading(false);
      }
    }
    initSession();
  }, [selectedModel, selectedAppliance]);

  // Handle switching language
  const handleToggleLanguage = async () => {
    const nextLang: 'auto' | 'ta' | 'hi' | 'en' =
      language === 'en' ? 'ta' : language === 'ta' ? 'hi' : language === 'hi' ? 'auto' : 'en';
    setLanguage(nextLang);
    if (!session) return;
    try {
      const res = await apiClient.createChatSession({
        sessionId: session.sessionId,
        model: selectedModel || 'UW-Q18WUZA',
        language: nextLang === 'auto' ? 'en' : nextLang,
        appliance: selectedAppliance || 'air-conditioner',
      });
      setSession(res.session);
      sessionIdRef.current = res.session.sessionId;
    } catch (err) {
      console.error('Failed to update language:', err);
    }
  };

  // Handle sending user input
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : inputText).trim();
    if (!textToSend || !session || isLoading) return;

    // If inline voice mode is active, send over voice WebSocket so it speaks reply
    if (isVoiceActive && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      handleInterruptSpeech();
      setInputText('');
      setIsLoading(true);
      setVoiceStatus('processing');

      appendUserMessage(textToSend);

      wsRef.current.send(
        JSON.stringify({
          type: 'text_input',
          text: textToSend,
        })
      );
      return;
    }

    setInputText('');
    setIsLoading(true);

    // Optimistically append user message
    const tempUserMsg: ChatMessageItem = {
      id: 'temp-' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsNearBottom(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await apiClient.sendChatMessage({
        sessionId: session.sessionId,
        text: textToSend,
        currentUser: currentUser,
      });

      setSession(res.session);
      sessionIdRef.current = res.session.sessionId;
      setMessages(res.session.messages);

      setTimeout(() => inputRef.current?.focus(), 100);

      const latestBotMsg = [...res.session.messages].reverse().find((m) => m.sender === 'bot');
      if (latestBotMsg && latestBotMsg.action === 'NAV_BOOKING') {
        triggerAutoBookingNavigation(latestBotMsg.bookingContext);
      }
      if (latestBotMsg && latestBotMsg.action === 'BOOKING_CONFIRMED' && latestBotMsg.ticketId) {
        onTicketCreated?.(latestBotMsg.ticketId);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      const errorMsg: ChatMessageItem = {
        id: 'err-' + Date.now(),
        sender: 'bot',
        text: 'Sorry, I encountered an issue connecting to the diagnostic server. Please try again or restart.',
        textHi: 'क्षमा करें, डायग्नोस्टिक सर्वर से जुड़ने में समस्या हुई। कृपया पुनः प्रयास करें।',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle clicking quick-reply chips
  const handleChipClick = async (chip: {
    label: string;
    labelHi?: string;
    value: string;
    optionIndex?: number;
    issueId?: string;
  }) => {
    if (!session || isLoading) return;

    if (chip.value === 'RESTART') {
      handleRestart();
      return;
    }

    if (chip.value === 'NAV_BOOKING') {
      const lastConclusionMsg = [...messages].reverse().find((m) => m.conclusion);
      const conclusion = lastConclusionMsg?.conclusion;
      onEscalateToBooking({
        symptom: `${applianceInfo.name} - Diagnostic Triage`,
        probable_cause: conclusion?.probable_cause || 'Diagnostic issue detected',
        parts: conclusion?.parts,
        priority: conclusion?.priority || 'High',
      });
      return;
    }

    const userDisplayText = language === 'hi' && chip.labelHi ? chip.labelHi : chip.label;

    // If inline voice mode is active, send over voice WebSocket so it speaks reply
    if (isVoiceActive && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      handleInterruptSpeech();
      setIsLoading(true);
      setVoiceStatus('processing');

      appendUserMessage(userDisplayText);

      wsRef.current.send(
        JSON.stringify({
          type: 'select_option',
          optionIndex: chip.optionIndex,
          issueId: chip.issueId,
          specialAction: chip.value,
        })
      );
      return;
    }

    setIsLoading(true);

    // Optimistically append user response bubble
    const tempUserMsg: ChatMessageItem = {
      id: 'chip-' + Date.now(),
      sender: 'user',
      text: userDisplayText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsNearBottom(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await apiClient.sendChatMessage({
        sessionId: session.sessionId,
        text: chip.label,
        optionIndex: chip.optionIndex,
        issueId: chip.issueId,
        specialAction: chip.value,
        currentUser: currentUser,
      });

      setSession(res.session);
      sessionIdRef.current = res.session.sessionId;
      setMessages(res.session.messages);

      const latestBotMsg = [...res.session.messages].reverse().find((m) => m.sender === 'bot');
      if (latestBotMsg && latestBotMsg.action === 'NAV_BOOKING') {
        triggerAutoBookingNavigation(latestBotMsg.bookingContext);
      }
      if (latestBotMsg && latestBotMsg.action === 'BOOKING_CONFIRMED' && latestBotMsg.ticketId) {
        onTicketCreated?.(latestBotMsg.ticketId);
      }
    } catch (err) {
      console.error('Failed to process option choice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle session reset
  const handleRestart = async () => {
    if (!session) return;
    try {
      setIsLoading(true);
      setUserRating(null);
      setRatingSubmitted(false);
      setShowMenu(false);
      const res = await apiClient.resetChatSession(session.sessionId);
      setSession(res.session);
      sessionIdRef.current = res.session.sessionId;
      setMessages(res.session.messages);
      setIsNearBottom(true);
      setTimeout(() => scrollToBottom(false), 50);
    } catch (err) {
      console.error('Failed to reset chat:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic suggestions list for the side-scroll suggestions bar in one line
  const getSuggestions = (): StarterPill[] => {
    // If active in conversational booking, surface contextual booking action suggestions
    if (session?.bookingState && session.bookingState.step !== 'IDLE' && session.bookingState.step !== 'COMPLETED') {
      if (session.bookingState.step === 'AWAITING_CONFIRMATION') {
        return [
          { label: '✅ Yes, Details Correct & Book', labelHi: '✅ हाँ, विवरण सही है और बुक करें', value: 'CONFIRM_BOOKING' },
          { label: '📅 Change Date/Time', labelHi: '📅 तारीख/समय बदलें', value: 'EDIT_DATE' },
          { label: '📱 Change Phone', labelHi: '📱 फोन बदलें', value: 'EDIT_PHONE' },
          { label: '📍 Change Address', labelHi: '📍 पता बदलें', value: 'EDIT_ADDRESS' },
          { label: '👤 Change Name', labelHi: '👤 नाम बदलें', value: 'EDIT_NAME' },
          { label: '❌ Cancel Booking', labelHi: '❌ बुकिंग रद्द करें', value: 'CANCEL_BOOKING' },
        ];
      }
      if (session.bookingState.step === 'AWAITING_DATE_TIME') {
        const isHigh = session.bookingState.priority === 'High';
        return [
          { label: '📅 Tomorrow Morning', labelHi: '📅 कल सुबह', value: 'Tomorrow Morning' },
          { label: '📅 Tomorrow Afternoon', labelHi: '📅 कल दोपहर', value: 'Tomorrow Afternoon' },
          { label: '📅 Tomorrow Evening', labelHi: '📅 कल शाम', value: 'Tomorrow Evening' },
          ...(!isHigh
            ? [
                { label: '📅 Day After Tomorrow', labelHi: '📅 परसों', value: 'Day After Tomorrow' },
                { label: '📅 Next Week', labelHi: '📅 अगले सप्ताह', value: 'Next Week' },
              ]
            : []),
          { label: '❌ Cancel Booking', labelHi: '❌ बुकिंग रद्द करें', value: 'CANCEL_BOOKING' },
        ];
      }
      if (session.bookingState.editingField) {
        return [
          { label: '❌ Keep Current Value', labelHi: '❌ वर्तमान मान रखें', value: 'CONFIRM_BOOKING' },
          { label: '❌ Cancel Booking', labelHi: '❌ बुकिंग रद्द करें', value: 'CANCEL_BOOKING' },
        ];
      }
    }

    if (selectedAppliance === 'refrigerator') {
      return [
        { label: '🧊 No Cooling / Warm', labelHi: '🧊 ठंडा नहीं हो रहा / गर्म', value: 'REF01', issueId: 'REF01' },
        { label: '❄️ Low Cooling / Food Warm', labelHi: '❄️ कम ठंडक / खाना गर्म', value: 'REF02', issueId: 'REF02' },
        { label: '⚡ Won\'t Turn On / Dead', labelHi: '⚡ चालू नहीं हो रहा / बिजली नहीं', value: 'REF03', issueId: 'REF03' },
        { label: '💧 Water Leaking', labelHi: '💧 पानी लीक हो रहा है', value: 'REF06', issueId: 'REF06' },
        { label: '🧊 Heavy Frost Buildup', labelHi: '🧊 अत्यधिक बर्फ जमना', value: 'REF10', issueId: 'REF10' },
        { label: '🔊 Unusual Noise', labelHi: '🔊 तेज असामान्य आवाज', value: 'REF04', issueId: 'REF04' },
      ];
    }
    if (selectedAppliance === 'washing-machine') {
      return [
        { label: '🔄 Not Spinning / Draining', labelHi: '🔄 घूम या खाली नहीं हो रहा', value: 'Not spinning' },
        { label: '💧 Water Leaking From Door', labelHi: '💧 दरवाजे से पानी लीक', value: 'Water leaking' },
        { label: '🔊 Loud Vibration on Spin', labelHi: '🔊 स्पिन पर तेज कंपन', value: 'Vibrating heavily' },
        { label: '▦ Error Code dE / OE', labelHi: '▦ एरर कोड dE / OE', value: 'Error code dE' },
      ];
    }
    return STARTER_ACTION_PILLS;
  };

  const suggestions = getSuggestions();

  // Welcome message helper
  const getWelcomeGreeting = () => {
    if (language === 'hi') {
      return `नमस्ते! मैं आपका अप्लायंसकेयर एआई सहायक हूँ। अपने ${applianceInfo.name.toLowerCase()} की समस्या बताएं, या नीचे दिए गए सुझावों में से चुनें।`;
    }
    return `Hi! I'm your ApplianceCare AI assistant. Tell me what's wrong with your ${applianceInfo.name.toLowerCase()}, or pick a suggestion below.`;
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-2 sm:py-3 flex justify-end min-h-0 h-full overflow-hidden relative">
      {/* Booking Redirect Banner */}
      {isNavigatingToBooking && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-teal-700 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-pulse border border-teal-500">
          <Loader2 className="w-4 h-4 animate-spin text-teal-200" />
          <span>Opening Book Technician form...</span>
        </div>
      )}

      {/* CHATBOT MAIN CONTAINER: Fits visible application frame, 3 vertical sections */}
      <div className="w-full lg:max-w-xl xl:max-w-2xl flex flex-col h-full min-h-0 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
        
        {/* ============================================================== */}
        {/* SECTION 1: FIXED CHAT HEADER / WELCOME AREA                    */}
        {/* ============================================================== */}
        <div className="shrink-0 bg-white border-b border-slate-100 px-4 py-3 sm:px-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base text-slate-900 truncate">
                  ApplianceCare AI
                </h2>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
              <p className="text-xs text-slate-500 truncate">
                Diagnostic Assistant
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Language Toggle */}
            <button
              onClick={handleToggleLanguage}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer border border-slate-200"
              title="Click to toggle language: Auto (Multilingual) 🌐 / தமிழ் 🇮🇳 / हिन्दी 🇮🇳 / English 🇬🇧"
            >
              <Languages className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">
                {language === 'auto' ? 'Auto 🌐' : language === 'ta' ? 'தமிழ் 🇮🇳' : language === 'hi' ? 'हिन्दी 🇮🇳' : 'English 🇬🇧'}
              </span>
            </button>

            {/* Restart Session */}
            <button
              onClick={handleRestart}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Restart Diagnostic Conversation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Toggle Inline Voice Agent */}
            <button
              onClick={toggleVoiceMode}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer ml-1 ${
                isVoiceActive
                  ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white ring-2 ring-rose-400/30'
                  : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white'
              }`}
              title={isVoiceActive ? 'Turn Mic OFF' : 'Turn Mic ON (Voice Agent)'}
            >
              <Mic className="w-3.5 h-3.5 text-white" />
              <span>{isVoiceActive ? 'Mic ON' : 'Voice Agent'}</span>
            </button>

            {/* Book Tech Conversational Trigger */}
            <button
              onClick={() =>
                handleChipClick({
                  label: '📅 Book Technician Visit',
                  value: 'BOOK_TECH',
                })
              }
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-xs cursor-pointer ml-1"
              title="Schedule a certified technician visit"
            >
              <Calendar className="w-3.5 h-3.5 text-teal-400" />
              <span>Book Tech</span>
            </button>

            {/* Mobile More Menu */}
            <div className="relative sm:hidden">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-30">
                  <button
                    onClick={() => {
                      toggleVoiceMode();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs font-semibold text-teal-700 hover:bg-teal-50 flex items-center gap-2"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>{isVoiceActive ? 'Mic OFF' : 'Voice Agent'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleChipClick({
                        label: '📅 Book Technician Visit',
                        value: 'BOOK_TECH',
                      });
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-50 flex items-center gap-2"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Book Tech</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleRestart();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restart Chat</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 2: VERTICALLY SCROLLABLE CONVERSATION HISTORY         */}
        {/* ============================================================== */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#fafbfc] relative"
        >
          {messages.map((msg, index) => {
            const isBot = msg.sender === 'bot';
            const isInitialWelcome = index === 0 && isBot;
            const isLatest = index === messages.length - 1;
            
            // Text to show (compact welcome message for index 0, or standard text)
            let displayText = isInitialWelcome
              ? getWelcomeGreeting()
              : language === 'hi' && msg.textHi
              ? msg.textHi
              : msg.text;

            return (
              <div
                key={msg.id || index}
                className={`flex gap-2.5 ${isBot ? 'justify-start' : 'justify-end'}`}
              >
                {/* Assistant Avatar */}
                {isBot && (
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                {/* Message Content Container */}
                <div className="max-w-[85%] sm:max-w-[80%] flex flex-col">
                  {/* The Message Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all ${
                      isBot
                        ? msg.safetyAlert
                          ? 'bg-red-50 border border-red-200 text-red-950 rounded-tl-xs shadow-2xs'
                          : msg.isResolution
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-tl-xs shadow-2xs'
                          : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-xs shadow-2xs'
                        : 'bg-gradient-to-r from-teal-700 to-teal-600 text-white rounded-tr-xs shadow-xs ml-auto'
                    }`}
                  >
                    {/* Formatted Text Content */}
                    <div className="whitespace-pre-wrap break-words font-normal">
                      {displayText.split('\n').map((line, lIdx) => {
                        if (line.includes('**')) {
                          const parts = line.split('**');
                          return (
                            <p key={lIdx} className={lIdx > 0 ? 'mt-1.5' : ''}>
                              {parts.map((p, pIdx) =>
                                pIdx % 2 === 1 ? (
                                  <strong key={pIdx} className="font-bold text-slate-900">
                                    {p}
                                  </strong>
                                ) : (
                                  p
                                )
                              )}
                            </p>
                          );
                        }
                        return (
                          <p key={lIdx} className={lIdx > 0 ? 'mt-1' : ''}>
                            {line}
                          </p>
                        );
                      })}
                    </div>

                    {/* Secondary English subtitle if in Hindi mode */}
                    {language === 'hi' && msg.textHi && msg.text && msg.text !== msg.textHi && !isInitialWelcome && (
                      <p className="text-[11px] text-slate-400 mt-2 border-t border-slate-100 pt-1.5 italic">
                        EN: {msg.text.split('\n')[0]}
                      </p>
                    )}

                    {/* Embedded Instruction Card */}
                    {msg.instruction && (
                      <div className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                        <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-950">
                          <Wrench className="w-3.5 h-3.5 text-amber-600" />
                          <span>Recommended Action:</span>
                        </div>
                        <p className="font-mono bg-white/80 p-2 rounded-lg border border-amber-200/80 text-amber-900 font-semibold">
                          {msg.instruction.replace(/_/g, ' ')}
                        </p>
                        <p className="mt-1 text-amber-800 text-[11px]">
                          Please verify this check, then choose an answer below.
                        </p>
                      </div>
                    )}

                    {/* Embedded Conclusion Card */}
                    {msg.conclusion && (
                      <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-slate-600">
                            Diagnostic Assessment
                          </span>
                          {msg.safetyAlert ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold text-[10px]">
                              Technician Required
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                              Service Recommended
                            </span>
                          )}
                        </div>

                        <div className="p-2 bg-white rounded-lg border border-slate-200">
                          <div className="font-bold text-slate-800">Likely Root Cause:</div>
                          <div className="text-slate-700 mt-0.5 font-medium">
                            {msg.conclusion.probable_cause}
                          </div>
                        </div>

                        {msg.conclusion.parts && msg.conclusion.parts.length > 0 && (
                          <div className="text-[11px]">
                            <span className="font-semibold text-slate-700">Components to Inspect: </span>
                            <span className="font-mono text-slate-800">
                              {msg.conclusion.parts.join(', ')}
                            </span>
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-500">
                            Certified service recommended.
                          </span>
                          <button
                            onClick={() => handleSendMessage('Schedule service')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors cursor-pointer shadow-2xs text-xs shrink-0"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Schedule Service</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Embedded Booking Confirmation Card */}
                    {(msg.action === 'BOOKING_CONFIRMED' || msg.ticketId) && (
                      <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 text-teal-950 text-xs space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-teal-900">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Appointment Confirmed</span>
                          </div>
                          {msg.ticketId && (
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-white border border-teal-200 text-teal-800 font-bold">
                              {msg.ticketId}
                            </span>
                          )}
                        </div>

                        {msg.ticket && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 bg-white/90 rounded-lg border border-teal-100 text-[11px]">
                            <div>
                              <span className="text-slate-500 block text-[10px]">Assigned Specialist</span>
                              <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                                <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                                {msg.ticket.assignedTechnician?.name || 'Certified Specialist'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Scheduled Slot</span>
                              <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                                <Calendar className="w-3.5 h-3.5 text-teal-600" />
                                {msg.ticket.scheduledDate} ({msg.ticket.scheduledSlot})
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] text-teal-800 flex items-center justify-between pt-1">
                          <span>SMS/Email confirmation with tracking details sent.</span>
                        </div>
                      </div>
                    )}

                    {/* Embedded Resolution Card */}
                    {msg.isResolution && (
                      <div className="mt-2.5 p-3 bg-white/90 rounded-xl border border-emerald-200 text-xs text-emerald-900">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-950 mb-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Self-Fix Successful</span>
                        </div>
                        <p className="text-emerald-800 text-[11px]">
                          No technician visit is needed. Regular maintenance keeps your appliance running efficiently.
                        </p>

                        {!ratingSubmitted ? (
                          <div className="mt-2.5 pt-2 border-t border-emerald-100 flex items-center justify-between">
                            <span className="font-medium text-emerald-900 text-[10px]">
                              Was this diagnosis helpful?
                            </span>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => {
                                    setUserRating(star);
                                    setRatingSubmitted(true);
                                  }}
                                  className="p-0.5 text-slate-300 hover:text-amber-400 transition-colors"
                                  title={`${star} Stars`}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      userRating && userRating >= star
                                        ? 'text-amber-400 fill-amber-400'
                                        : ''
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1.5 text-[10px] font-semibold text-emerald-700">
                            ✓ Thank you for your feedback! ({userRating}/5 stars)
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CONVERSATION ACTION CHIPS (Only for primary flow starters like Start Guided Diagnosis or Booking, NEVER for question options) */}
                  {!isInitialWelcome &&
                    isBot &&
                    msg.chips &&
                    msg.chips.length > 0 &&
                    msg.chips.some((c) =>
                      c.value === 'START_ERROR_DIAG' ||
                      c.value === 'BOOK_TECH' ||
                      c.value === 'NAV_BOOKING' ||
                      c.value === 'RESTART' ||
                      c.value === 'CONFIRM_BOOKING' ||
                      c.value === 'CANCEL_BOOKING' ||
                      c.value.startsWith('EDIT_') ||
                      c.value.startsWith('SLOT_') ||
                      c.value === 'TRACK_TICKET'
                    ) &&
                    isLatest && (
                    <div className="pt-2 flex flex-wrap gap-1.5 sm:gap-2">
                      {msg.chips.map((chip, cIdx) => (
                        <button
                          key={cIdx}
                          disabled={isLoading}
                          onClick={() => handleChipClick(chip)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-500 text-slate-800 hover:text-teal-900 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                        >
                          <span>{language === 'hi' && chip.labelHi ? chip.labelHi : chip.label}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Discreet Timestamp */}
                  <div
                    className={`text-[10px] text-slate-400 mt-1 px-1 ${
                      isBot ? 'text-left' : 'text-right'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {/* User Avatar */}
                {!isBot && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 text-teal-300 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex gap-2.5 items-center">
              <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs px-3.5 py-2.5 shadow-2xs flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-xs text-slate-400 ml-1 font-medium">Assistant is thinking...</span>
              </div>
            </div>
          )}

          {/* Floating Scroll to Latest Button */}
          {showScrollBottomBtn && (
            <div className="sticky bottom-1 flex justify-center pointer-events-none z-20">
              <button
                onClick={() => scrollToBottom(true)}
                className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-semibold shadow-md backdrop-blur-xs transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <ArrowDown className="w-3.5 h-3.5 text-teal-400" />
                <span>Latest messages</span>
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ============================================================== */}
        {/* SECTION 3: FIXED SUGGESTIONS & MESSAGE COMPOSER                */}
        {/* ============================================================== */}
        <div className="shrink-0 bg-white border-t border-slate-200/80">
          {/* A. Compact Suggestions Bar (Single line side-scroll) */}
          <div className="px-3.5 py-2 bg-slate-50/90 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 pr-1">
              <Sparkles className="w-3 h-3 text-teal-600" />
              <span>Suggestions:</span>
            </span>
            {suggestions.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (
                    p.issueId ||
                    p.value === 'ERROR_CODE' ||
                    p.value.startsWith('AC') ||
                    p.value.startsWith('REF') ||
                    p.value === 'CONFIRM_BOOKING' ||
                    p.value === 'CANCEL_BOOKING' ||
                    p.value.startsWith('EDIT_') ||
                    p.value.startsWith('SLOT_') ||
                    p.value === 'NAV_BOOKING' ||
                    p.value === 'BOOK_TECH'
                  ) {
                    handleChipClick(p);
                  } else {
                    handleSendMessage(p.label);
                  }
                }}
                disabled={isLoading}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white hover:bg-teal-50 border border-slate-200/90 hover:border-teal-400 text-slate-700 hover:text-teal-900 shadow-2xs hover:shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <span>{language === 'hi' && p.labelHi ? p.labelHi : p.label}</span>
              </button>
            ))}
          </div>

          {/* B. Message Composer */}
          <div className="p-3 sm:p-3.5">
            {/* Inline Voice Status Banner */}
            {isVoiceActive && (
              <div className="mb-2.5 px-3 py-2 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 rounded-xl flex items-center justify-between text-xs transition-all shadow-2xs">
                <div className="flex items-center gap-2 overflow-hidden mr-2">
                  {voiceStatus === 'listening' && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 h-3.5">
                        <span className="w-1 bg-teal-600 rounded-full animate-bounce h-2.5" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 bg-emerald-500 rounded-full animate-bounce h-3.5" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 bg-teal-600 rounded-full animate-bounce h-2" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="font-semibold text-teal-900 shrink-0">Mic ON:</span>
                      {interimTranscript ? (
                        <span className="text-slate-800 italic font-medium truncate max-w-[200px] sm:max-w-md">
                          "{interimTranscript}"
                        </span>
                      ) : (
                        <span className="text-teal-700 font-medium">Listening... speak your issue</span>
                      )}
                    </div>
                  )}

                  {voiceStatus === 'processing' && (
                    <div className="flex items-center gap-2 text-teal-800 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                      <span>Evon AI orchestrating diagnostic step...</span>
                    </div>
                  )}

                  {(voiceStatus === 'speaking' || isAssistantSpeaking) && (
                    <div className="flex items-center gap-2 text-teal-900 font-semibold">
                      <Volume2 className="w-4 h-4 text-teal-600 animate-pulse" />
                      <span>Assistant speaking...</span>
                      {isEchoGateEnabled && (
                        <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-0.5">
                          <ShieldCheck className="w-3 h-3 text-teal-700" />
                          <span>Echo Gate</span>
                        </span>
                      )}
                    </div>
                  )}

                  {voiceStatus === 'connecting' && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                      <span>Connecting Gnani Voice Agent...</span>
                    </div>
                  )}

                  {voiceStatus === 'error' && (
                    <div className="flex items-center gap-1.5 text-red-600 font-medium text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-xs">{voiceError || 'Voice connection issue'}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Echo Gate Mode Switcher */}
                  <button
                    type="button"
                    onClick={toggleEchoGate}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer shadow-2xs border ${
                      isEchoGateEnabled
                        ? 'bg-white border-teal-300 text-teal-800 hover:bg-teal-50'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                    title={
                      isEchoGateEnabled
                        ? 'Speaker Mode: Mic is gated during bot speech to prevent acoustic echo. Click for Headphones Mode.'
                        : 'Headphones Mode: Full duplex active without gating. Click for Speaker Mode.'
                    }
                  >
                    {isEchoGateEnabled ? (
                      <>
                        <ShieldCheck className="w-3 h-3 text-teal-600" />
                        <span>Speaker Mode</span>
                      </>
                    ) : (
                      <>
                        <Headphones className="w-3 h-3 text-slate-500" />
                        <span>Headphones</span>
                      </>
                    )}
                  </button>

                  {isAssistantSpeaking && (
                    <button
                      type="button"
                      onClick={handleInterruptSpeech}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[10px] font-semibold transition-all cursor-pointer shadow-2xs"
                      title="Interrupt / Stop audio playback"
                    >
                      <VolumeX className="w-3 h-3 text-red-500" />
                      <span>Stop Audio</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={stopVoiceMode}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-600 hover:text-red-700 text-[10px] font-medium transition-all cursor-pointer shadow-2xs"
                    title="Turn Mic OFF"
                  >
                    <MicOff className="w-3 h-3 text-slate-400 hover:text-red-600" />
                    <span>Mic OFF</span>
                  </button>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <div className="flex-1 relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    isVoiceActive && voiceStatus === 'listening'
                      ? (interimTranscript ? `Listening: "${interimTranscript}"` : "🎙️ Mic ON: Speak your AC issue or type...")
                      : (language === 'hi'
                        ? "अपनी समस्या या उत्तर यहाँ लिखें..."
                        : "Describe your issue or enter reply...")
                  }
                  disabled={isLoading}
                  className="w-full h-10 sm:h-11 pl-4 pr-9 rounded-full border border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm outline-hidden transition-all shadow-xs disabled:bg-slate-100"
                />
                {inputText.trim() && (
                  <button
                    type="button"
                    onClick={() => setInputText('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full cursor-pointer"
                    title="Clear input"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Voice Agent Mic Toggle Button */}
              <button
                type="button"
                onClick={toggleVoiceMode}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 relative ${
                  isVoiceActive
                    ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-md ring-4 ring-rose-400/30 animate-pulse hover:brightness-110'
                    : 'bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-700 shadow-2xs hover:shadow-xs'
                }`}
                title={isVoiceActive ? 'Click to turn Mic OFF' : 'Click to turn Mic ON (Voice Agent)'}
              >
                {isVoiceActive ? (
                  <Mic className="w-4 h-4 text-white" />
                ) : (
                  <Mic className="w-4 h-4 text-teal-600" />
                )}
                {isVoiceActive && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-400 rounded-full border-2 border-white animate-ping" />
                )}
              </button>

              {/* Circular Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 text-white disabled:text-slate-400 flex items-center justify-center transition-all shadow-xs hover:shadow-sm disabled:shadow-none cursor-pointer disabled:cursor-not-allowed shrink-0"
                title="Send Message"
              >
                <Send className="w-4 h-4 text-current" />
              </button>
            </form>

            {/* Subtle Helper Text */}
            <div className="flex items-center justify-between mt-1.5 px-2 text-[10px] text-slate-400">
              <span>
                {isVoiceActive ? (
                  <span className="text-teal-700 font-medium">🎙️ Voice Mode Active — Speak naturally or click chips</span>
                ) : (
                  <span>Press <strong>Enter</strong> to send or click <strong>Mic</strong> to talk</span>
                )}
              </span>
              <span className="hidden sm:inline">Voice & Interactive Diagnostic Triage</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
