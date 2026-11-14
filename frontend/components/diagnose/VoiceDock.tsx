'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff, X, ArrowUp } from 'lucide-react';
import { VoiceWave, VoiceState } from './VoiceWave';
import { deriveDockState, dockCopy, DockInput } from './deriveDockState';
import './voice-dock.css';

interface VoiceDockProps extends DockInput {
  getMicAnalyser: () => AnalyserNode | null;
  getPlaybackAnalyser: () => AnalyserNode | null;
  onToggleVoice: () => void;
  onInterrupt: () => void;
  onTypeInstead: () => void;
  /** Text composer (used when hands-free is off, or when the keyboard button is toggled). */
  inputText: string;
  setInputText: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSend: () => void;
  isLoading: boolean;
  typing: boolean;
  placeholder: string;
}

export const VoiceDock: React.FC<VoiceDockProps> = (props) => {
  const { isVoiceActive, voiceStatus, isAssistantSpeaking, interimTranscript, voiceError } = props;
  const base = deriveDockState({ isVoiceActive, voiceStatus, isAssistantSpeaking, interimTranscript, voiceError });

  // Transient "you cut in": the engine's barge-in path flips straight to 'listening' while audio was playing.
  // A natural end of reply keeps voiceStatus 'speaking' for 400 ms first, so the two are distinguishable.
  const [cutIn, setCutIn] = useState(false);
  const wasSpeakingRef = useRef(false);
  useEffect(() => {
    if (wasSpeakingRef.current && !isAssistantSpeaking && voiceStatus === 'listening') {
      setCutIn(true);
      const t = setTimeout(() => setCutIn(false), 1400);
      wasSpeakingRef.current = false;
      return () => clearTimeout(t);
    }
    wasSpeakingRef.current = isAssistantSpeaking;
  }, [isAssistantSpeaking, voiceStatus]);
  const state: VoiceState | null = cutIn && base === 'ready' ? 'bargein' : base;

  // "Still on it" after 2.5 s of thinking
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (state !== 'thinking') return;
    const t = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(t);
  }, [state]);

  // Analysers appear shortly after the recorder / player start
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  useEffect(() => {
    if (!state || state === 'thinking' || state === 'blocked') {
      setAnalyser(null);
      return;
    }
    const pick = () => (state === 'speaking' ? props.getPlaybackAnalyser() : props.getMicAnalyser());
    let a = pick();
    setAnalyser(a);
    if (a) return;
    const id = setInterval(() => {
      a = pick();
      if (a) {
        setAnalyser(a);
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const levelRef = useRef<HTMLDivElement>(null);

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSend();
      }}
      className="flex items-center gap-2"
    >
      <input
        ref={props.inputRef}
        type="text"
        value={props.inputText}
        onChange={(e) => props.setInputText(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.isLoading}
        aria-label="Your answer"
        className="flex-1 h-12 px-4 rounded-xl border border-line bg-white text-[15px] text-ink placeholder:text-muted/70 focus:border-accent outline-none disabled:bg-paper"
      />
      <button
        type="submit"
        disabled={!props.inputText.trim() || props.isLoading}
        className="h-12 w-12 rounded-xl bg-accent hover:bg-accent-hover disabled:bg-line disabled:text-muted text-white grid place-items-center cursor-pointer disabled:cursor-not-allowed"
        aria-label="Send"
      >
        <ArrowUp className="w-5 h-5" strokeWidth={2} />
      </button>
    </form>
  );

  // Hands-free off: plain composer plus a single "talk" button
  if (!state) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1">{composer}</div>
        <button
          type="button"
          onClick={props.onToggleVoice}
          className="h-12 px-4 rounded-xl bg-ink text-white inline-flex items-center gap-2 text-sm font-semibold hover:bg-ink-2 cursor-pointer"
        >
          <Mic className="w-4 h-4" strokeWidth={2} />
          Talk
        </button>
      </div>
    );
  }

  const copy = dockCopy(state, { interim: interimTranscript, error: voiceError, connecting: voiceStatus === 'connecting', slow });
  const lit = state === 'listening' || state === 'bargein';

  const micAction = () => {
    if (state === 'speaking') return props.onInterrupt();
    if (state === 'blocked') return props.onTypeInstead();
    props.onToggleVoice();
  };
  const micLabel =
    state === 'speaking' ? 'Interrupt and talk' : state === 'blocked' ? 'Type instead' : state === 'thinking' ? 'Stop hands-free' : 'Turn hands-free off';

  return (
    <div className="space-y-2">
      {(props.typing || state === 'blocked') && composer}
      <div
        className="rounded-2xl bg-ink text-white px-5 py-3.5 flex items-center gap-4 min-h-[84px]"
        role="status"
        aria-live="polite"
      >
        <div className="hidden sm:block shrink-0 w-[141px]">
          <VoiceWave state={state} analyser={analyser} levelTarget={levelRef} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${state === 'listening' ? 'text-[11px] text-[#9da8b6]' : 'text-[15px]'}`}>
            {state === 'blocked' && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2 align-middle" />}
            {copy.title}
          </div>
          {copy.sub && (
            <div className={`${state === 'listening' ? 'text-[15px] text-white vd-interim-wrap' : 'text-[13px] text-[#9da8b6]'} ${state === 'blocked' ? '' : 'truncate'}`}>
              {copy.sub}
            </div>
          )}
        </div>
        {state === 'blocked' ? (
          <button
            type="button"
            onClick={props.onTypeInstead}
            className="shrink-0 h-10 px-4 rounded-xl bg-white text-ink text-sm font-semibold cursor-pointer"
          >
            Type instead
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onTypeInstead}
            className="shrink-0 w-10 h-10 grid place-items-center rounded-lg text-[#9da8b6] hover:text-white cursor-pointer"
            aria-label="Type instead"
            aria-pressed={props.typing}
          >
            <Keyboard className="w-5 h-5" strokeWidth={1.75} />
          </button>
        )}
        <div ref={levelRef} className="vd-mic shrink-0">
          <button
            type="button"
            onClick={micAction}
            aria-label={micLabel}
            title={micLabel}
            className={`relative z-10 w-14 h-14 rounded-full grid place-items-center cursor-pointer transition-colors ${
              lit ? 'bg-[#f1f3f6] text-ink' : state === 'blocked' ? 'bg-ink-2 text-amber-400 border border-transparent' : state === 'thinking' ? 'bg-ink-2 text-white' : 'bg-transparent text-white border border-[#8ea3ff]/50'
            }`}
          >
            {state === 'blocked' ? (
              <MicOff className="w-5 h-5" strokeWidth={1.75} />
            ) : state === 'thinking' ? (
              <X className="w-5 h-5" strokeWidth={1.75} />
            ) : (
              <Mic className="w-5 h-5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
