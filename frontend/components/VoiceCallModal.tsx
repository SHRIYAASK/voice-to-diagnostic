'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  Languages,
  Activity,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { AudioRecorder } from '../lib/audioRecorder';
import { AudioQueuePlayer } from '../lib/audioPlayer';
import { ChatMessageItem } from '../lib/api';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  selectedModel: string;
  selectedAppliance?: string;
  initialLanguage?: string;
  onLanguageDetected?: (lang: string) => void;
  onMessageReceived?: (msg: ChatMessageItem) => void;
  onTurnCompleted?: (userText: string, botMsg: ChatMessageItem) => void;
}

type VoiceStatus = 'connecting' | 'listening' | 'processing' | 'speaking' | 'idle' | 'error';

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  selectedModel,
  selectedAppliance = 'air-conditioner',
  initialLanguage = 'en',
  onLanguageDetected,
  onMessageReceived,
  onTurnCompleted,
}) => {
  const [status, setStatus] = useState<VoiceStatus>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>(initialLanguage || 'en');
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [isInterim, setIsInterim] = useState(false);
  const [assistantText, setAssistantText] = useState<string>('');
  const [currentChips, setCurrentChips] = useState<Array<{ label: string; value: string; optionIndex?: number; issueId?: string }>>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioQueuePlayer | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeTurnIdRef = useRef<number>(1);
  const lastUserTextRef = useRef<string>('');
  const isMutedRef = useRef<boolean>(false); // ref so onAudioData closure always reads current mute state
  const playbackStartTimeRef = useRef<number>(0);
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const processedChunksRef = useRef<Set<string>>(new Set());

  // Call timer effect
  useEffect(() => {
    if (isOpen) {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // Main Voice Session lifecycle
  useEffect(() => {
    if (!isOpen) {
      cleanupSession();
      return;
    }

    startVoiceSession();

    return () => {
      cleanupSession();
    };
  }, [isOpen]);

  const cleanupSession = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.close();
      playerRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'end_session' }));
          wsRef.current.close();
        }
      } catch {}
      wsRef.current = null;
    }
  };

  const startVoiceSession = async () => {
    try {
      setStatus('connecting');
      setErrorMessage(null);

      // Initialize audio player
      playerRef.current = new AudioQueuePlayer((isPlaying) => {
        if (isPlaying) {
          playbackStartTimeRef.current = Date.now();
          consecutiveSpeechFramesRef.current = 0;
          setStatus('speaking');
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'playback_state', isPlaying: true }));
          }
        } else {
          consecutiveSpeechFramesRef.current = 0;
          setStatus('listening');
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'playback_state', isPlaying: false }));
          }
        }
      });
      await playerRef.current.unlock();

      // Connect to backend Voice WebSocket
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/api/voice';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send initial handshake
        ws.send(
          JSON.stringify({
            type: 'start_session',
            sessionId,
            language: detectedLanguage || initialLanguage || 'en',
            model: selectedModel,
            appliance: selectedAppliance,
          })
        );
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch {}
      };

      ws.onerror = (e) => {
        console.error('[VoiceWS Error]', e);
        setStatus('error');
        setErrorMessage('Unable to connect to Voice Diagnostic Server. Please verify the backend is running.');
      };

      ws.onclose = () => {
        if (isOpen) {
          setStatus('idle');
        }
      };

      // Initialize microphone recorder with acoustic echo suppression & instant VAD barge-in
      const recorder = new AudioRecorder({
        sampleRate: 16000,
        onAudioData: (buffer) => {
          if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
            const isPlaying = playerRef.current?.playing || (typeof window !== 'undefined' && window.speechSynthesis?.speaking);

            // Compute real-time RMS energy of the incoming 16-bit linear PCM frame
            const int16 = new Int16Array(buffer);
            let sumSquares = 0;
            for (let i = 0; i < int16.length; i++) {
              const norm = int16[i] / 32768;
              sumSquares += norm * norm;
            }
            const rms = Math.sqrt(sumSquares / int16.length);

            // Acoustic Echo Gating & Barge-In Detection
            if (isPlaying) {
              const timeSincePlaybackStart = Date.now() - playbackStartTimeRef.current;
              // Ignore initial acoustic transients for the first 300ms of playback unless loud deliberate speech
              if (timeSincePlaybackStart < 300 && rms < 0.085) {
                return;
              }

              // Normal human conversational speech into laptop microphone typically has RMS 0.045 - 0.100
              // Laptop speaker leakage is typically < 0.035
              if (rms > 0.048) {
                consecutiveSpeechFramesRef.current++;
              } else {
                consecutiveSpeechFramesRef.current = 0;
              }

              // Confirmed user interruption: sustained voiced speech (>= 2 frames ~80ms) or loud burst (rms > 0.085)
              if (consecutiveSpeechFramesRef.current >= 2 || rms > 0.085) {
                console.log(`[VoiceModal BargeIn] Genuine user interruption confirmed (RMS=${rms.toFixed(4)}, frames=${consecutiveSpeechFramesRef.current}). Halting playback.`);
                consecutiveSpeechFramesRef.current = 0;

                // 1. Immediately halt all browser audio playback (< 50ms)
                if (playerRef.current) {
                  playerRef.current.stop();
                }
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                }
                setStatus('listening');

                // 2. Notify backend to abort TTS streaming & cancel turn
                ws.send(JSON.stringify({ type: 'barge_in', reason: 'client_vad' }));

                // 3. Immediately forward this voiced frame so STT does not lose initial syllables!
                ws.send(buffer);
                return;
              }

              // During playback, gate speaker leakage so it does not feed into STT
              return;
            }

            // Normal listening: forward audio frame to WebSocket
            ws.send(buffer);
          }
        },
        onError: (err) => {
          console.error('[AudioRecorder Error]', err);
          setStatus('error');
          setErrorMessage('Microphone access was denied or not available. Please allow microphone permissions.');
        },
      });

      recorderRef.current = recorder;
      await recorder.start();
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to start voice call');
    }
  };

  const handleServerMessage = (data: any) => {
    switch (data.type) {
      case 'session_ready':
        setStatus('listening');
        activeTurnIdRef.current = data.turnId || 1;
        break;

      case 'language_detected': {
        const lang = data.detectedLanguage || data.language;
        if (lang) {
          const clean = lang.toLowerCase().split(/[-_]/)[0];
          setDetectedLanguage(clean);
          onLanguageDetected?.(clean);
        }
        break;
      }

      case 'interim_transcript':
        if (data.turnId >= activeTurnIdRef.current && data.text) {
          const isPlaying = playerRef.current?.playing || (typeof window !== 'undefined' && window.speechSynthesis?.speaking);
          // If assistant is actively playing, don't trigger barge-in on short acoustic echo
          if (isPlaying) {
            const trimmed = data.text.trim().toLowerCase();
            if (trimmed.length > 5 && !assistantText.toLowerCase().includes(trimmed)) {
              if (playerRef.current) playerRef.current.stop();
              if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
                window.speechSynthesis.cancel();
              }
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'interrupt', reason: 'speech_transcript' }));
              }
              setStatus('listening');
            }
          }
          setUserTranscript(data.text);
          setIsInterim(true);
          if (data.detectedLanguage) {
            const clean = data.detectedLanguage.toLowerCase().split(/[-_]/)[0];
            setDetectedLanguage(clean);
            onLanguageDetected?.(clean);
          }
        }
        break;

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
          setUserTranscript(data.text);
          setIsInterim(false);
          lastUserTextRef.current = data.text;
          setStatus('processing');
          if (data.detectedLanguage) {
            const clean = data.detectedLanguage.toLowerCase().split(/[-_]/)[0];
            setDetectedLanguage(clean);
            onLanguageDetected?.(clean);
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
        // Player's onStateChange callback handles setting status to 'speaking' once audio actually plays
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
          setUserTranscript(data.text);
          setIsInterim(false);
          lastUserTextRef.current = data.text;
        }
        setStatus('processing');
        break;

      case 'assistant_message':
        if (data.turnId >= activeTurnIdRef.current && data.message) {
          const msg: ChatMessageItem = data.message;
          setAssistantText(msg.text);
          if (msg.chips) {
            setCurrentChips(msg.chips);
          }
          if (onMessageReceived) {
            onMessageReceived(msg);
          }
          if (onTurnCompleted && lastUserTextRef.current) {
            onTurnCompleted(lastUserTextRef.current, msg);
          }
        }
        break;

      case 'audio_chunk':
      case 'tts_audio_chunk': {
        // If audio chunk from a NEW turn arrives, immediately purge residual audio from old turn!
        const chunkTurn = data.turnId || activeTurnIdRef.current;
        const seq = data.sequenceNumber || data.chunkIndex || 0;
        const chunkKey = `${chunkTurn}:${seq}`;

        // Deduplicate if backend sent both tts_audio_chunk and legacy audio_chunk
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
        const b64Payload = data.audioBase64 || data.audio;
        if (chunkTurn >= activeTurnIdRef.current && b64Payload) {
          if (playerRef.current) {
            playerRef.current.enqueueBase64(b64Payload, chunkTurn);
          }
        }
        break;
      }

      case 'stop_playback':
        if (playerRef.current) {
          playerRef.current.stop();
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        setStatus('listening');
        break;

      case 'state_change':
        if (data.currentState === 'SPEAKING') {
          if (playerRef.current?.playing) {
            setStatus('speaking');
          }
        } else if (data.currentState === 'PROCESSING' || data.currentState === 'REASONING') {
          setStatus('processing');
        } else if (data.currentState === 'LISTENING') {
          if (!playerRef.current?.playing) {
            setStatus('listening');
          }
        } else if (data.currentState === 'RECONNECTING') {
          setStatus('connecting');
        }
        break;

      case 'audio_done':
        // If external TTS streamed no chunks or player is idle, fallback to browser SpeechSynthesis
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && assistantText) {
          setTimeout(() => {
            if (playerRef.current && playerRef.current.playing) return;
            window.speechSynthesis.cancel();
            const clean = assistantText.replace(/[*#`_📋⚠️🚨]/g, '').trim();
            const utterance = new SpeechSynthesisUtterance(clean);
            utterance.lang = 'en-IN';
            utterance.onstart = () => {
              setStatus('speaking');
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'playback_state', isPlaying: true }));
              }
            };
            utterance.onend = () => {
              setStatus('listening');
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'playback_state', isPlaying: false }));
              }
            };
            window.speechSynthesis.speak(utterance);
          }, 250);
        }
        break;

      case 'interrupted':
        activeTurnIdRef.current = data.turnId;
        recorderRef.current?.setMuted(false);
        if (playerRef.current) {
          playerRef.current.stop();
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        setStatus('listening');
        break;

      case 'error':
        console.warn('[Server voice error]', data.message);
        break;

      default:
        break;
    }
  };

  // Barge-in / Interrupt assistant playback
  const handleInterrupt = () => {
    if (playerRef.current) {
      playerRef.current.stop();
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
    setStatus('listening');
  };

  // Toggle microphone mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted; // keep ref in sync for the audio closure
    if (recorderRef.current) {
      recorderRef.current.setMuted(nextMuted);
    }
  };

  // Click an interactive chip option during voice call
  const handleChipClick = (chip: { label: string; value: string; optionIndex?: number; issueId?: string }) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      handleInterrupt();
      setUserTranscript(chip.label);
      setIsInterim(false);
      setStatus('processing');

      wsRef.current.send(
        JSON.stringify({
          type: 'select_option',
          optionIndex: chip.optionIndex,
          issueId: chip.issueId,
          specialAction: chip.value,
        })
      );
    }
  };

  const handleSwitchLanguage = (targetLang?: string) => {
    const nextLang =
      targetLang ||
      (detectedLanguage === 'auto' ? 'ta' : detectedLanguage === 'ta' ? 'hi' : detectedLanguage === 'hi' ? 'en' : 'auto');
    setDetectedLanguage(nextLang);
    onLanguageDetected?.(nextLang);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'set_language',
          language:
            nextLang === 'auto' ? 'AUTO_DETECT' : nextLang === 'ta' ? 'ta-IN' : nextLang === 'hi' ? 'hi-IN' : 'en-IN',
        })
      );
    }
  };

  if (!isOpen) return null;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Glow ambient background element */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Zap className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-wide">AI Voice Diagnostic</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-900/60 text-teal-300 font-mono border border-teal-700/50">
                  LIVE
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                {selectedModel} • Dual Inverter AC
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Call duration timer */}
            <span className="text-xs font-mono text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/50">
              {formatTimer(callDuration)}
            </span>

            {/* Multilingual Language selector / indicator */}
            <button
              onClick={() => handleSwitchLanguage()}
              className="text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 bg-teal-950/70 text-teal-300 border-teal-500/50 hover:bg-teal-900/80 cursor-pointer transition-colors"
              title="Click to toggle language: Auto (Multilingual) 🌐 / தமிழ் 🇮🇳 / हिन्दी 🇮🇳 / English 🇬🇧"
            >
              <Languages className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-medium">
                {detectedLanguage === 'auto' ? 'Auto 🌐' :
                 detectedLanguage === 'ta' ? 'தமிழ் (ta-IN)' :
                 detectedLanguage === 'hi' ? 'हिन्दी (hi-IN)' :
                 detectedLanguage === 'te' ? 'తెలుగు (te-IN)' :
                 detectedLanguage === 'kn' ? 'ಕನ್ನಡ (kn-IN)' :
                 detectedLanguage === 'ml' ? 'മലയാളം (ml-IN)' :
                 detectedLanguage === 'bn' ? 'বাংলা (bn-IN)' :
                 detectedLanguage === 'mr' ? 'मराठी (mr-IN)' :
                 detectedLanguage === 'gu' ? 'ગુજરાતી (gu-IN)' :
                 detectedLanguage === 'pa' ? 'ਪੰਜਾਬੀ (pa-IN)' :
                 detectedLanguage && detectedLanguage !== 'en' ? `${detectedLanguage.toUpperCase()}` : 'English (en-IN)'}
              </span>
            </button>
          </div>
        </div>

        {/* Voice Visualizer Orb & State Indicator */}
        <div className="relative z-10 py-8 flex flex-col items-center justify-center">
          {/* Animated Orb */}
          <div className="relative flex items-center justify-center w-36 h-36">
            {/* Outer pulse rings */}
            {status === 'speaking' && (
              <>
                <div className="absolute inset-0 rounded-full bg-teal-500/20 animate-ping opacity-75" />
                <div className="absolute -inset-3 rounded-full border-2 border-teal-400/40 animate-pulse" />
              </>
            )}
            {status === 'listening' && !isMuted && (
              <div className="absolute -inset-2 rounded-full border border-teal-400/30 animate-pulse" />
            )}

            {/* Core Orb */}
            <div
              className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl border ${
                status === 'speaking'
                  ? 'bg-gradient-to-tr from-teal-600 via-teal-500 to-emerald-400 border-teal-300 shadow-teal-500/30 scale-105'
                  : status === 'processing'
                  ? 'bg-gradient-to-tr from-amber-600 to-orange-500 border-amber-300 shadow-amber-500/20 animate-spin'
                  : status === 'listening'
                  ? isMuted
                    ? 'bg-slate-800 border-slate-700 text-slate-500'
                    : 'bg-gradient-to-tr from-teal-700 to-slate-800 border-teal-500/50 shadow-teal-500/20 scale-100'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              {status === 'speaking' ? (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-7 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-11 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <div className="w-1.5 h-9 bg-white rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                </div>
              ) : status === 'processing' ? (
                <Sparkles className="w-9 h-9 text-white animate-pulse" />
              ) : isMuted ? (
                <MicOff className="w-9 h-9 text-slate-400" />
              ) : (
                <Mic className="w-9 h-9 text-teal-300 animate-pulse" />
              )}
            </div>
          </div>

          {/* Status Label & Language Hint */}
          <div className="mt-4 text-center flex flex-col items-center gap-1.5">
            <span
              className={`text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full border ${
                status === 'speaking'
                  ? 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                  : status === 'processing'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : status === 'listening'
                  ? isMuted
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-teal-900/30 text-teal-400 border-teal-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {status === 'speaking'
                ? 'Assistant is Speaking...'
                : status === 'processing'
                ? 'Synthesizing with HF Evon...'
                : status === 'listening'
                ? isMuted
                  ? 'Microphone Muted'
                  : 'Listening to your voice...'
                : status === 'connecting'
                ? 'Connecting pipeline...'
                : 'Ready'}
            </span>

            <span className="text-[11px] text-teal-400/90 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-teal-400" />
              English Voice Diagnostic (en-IN)
            </span>
          </div>
        </div>

        {/* Live Conversation Transcript Panel */}
        <div className="relative z-10 px-6 py-3 flex-1 flex flex-col gap-3 min-h-[160px] max-h-[220px] overflow-y-auto border-t border-b border-slate-800/80 bg-slate-950/40">
          {/* User Transcript */}
          {userTranscript && (
            <div className="flex items-start gap-2 bg-slate-800/50 p-2.5 rounded-2xl border border-slate-700/60">
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider shrink-0 mt-0.5">
                You:
              </span>
              <p className={`text-xs ${isInterim ? 'text-slate-400 italic' : 'text-slate-100 font-medium'}`}>
                {userTranscript}
                {isInterim && <span className="inline-block w-1 h-3 ml-1 bg-teal-400 animate-pulse" />}
              </p>
            </div>
          )}

          {/* Assistant Response */}
          {assistantText ? (
            <div className="flex items-start gap-2 bg-teal-950/30 p-2.5 rounded-2xl border border-teal-800/40">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider shrink-0 mt-0.5">
                AI:
              </span>
              <div className="text-xs text-slate-200 space-y-2">
                <p className="line-clamp-4">{assistantText}</p>

                {/* Interactive Chips if provided */}
                {currentChips && currentChips.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {currentChips.slice(0, 4).map((chip, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleChipClick(chip)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-teal-700/50 border border-slate-700 hover:border-teal-400 text-teal-200 transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>{chip.label}</span>
                        <ChevronRight className="w-3 h-3 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : !userTranscript ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 py-6">
              <p className="text-xs">Speak naturally in English (e.g. &ldquo;AC is not cooling&rdquo; or &ldquo;Water is leaking from indoor unit&rdquo;)</p>
              <p className="text-[11px] text-slate-600 mt-1">Gnani Prisma STT (English) • HF Evon 30B • Gnani Timbre TTS</p>
            </div>
          ) : null}

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="relative z-10 px-6 py-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between">
          {/* Barge-in Stop Button */}
          {status === 'speaking' ? (
            <button
              onClick={handleInterrupt}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition cursor-pointer"
              title="Interrupt assistant speech"
            >
              <VolumeX className="w-4 h-4" />
              <span>Stop Speaking</span>
            </button>
          ) : (
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
              <span>Verified LG Diagnostic Pipeline</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Mic Mute / Unmute */}
            <button
              onClick={handleToggleMute}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition border cursor-pointer ${
                isMuted
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* End Call Button */}
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/30 transition transform hover:scale-105 active:scale-95 cursor-pointer"
              title="End Voice Call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
