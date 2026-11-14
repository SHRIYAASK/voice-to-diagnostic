'use client';

import React, { useMemo, useState } from 'react';
import { ArrowDown, Headphones, RotateCcw, ClipboardList, X, Loader2 } from 'lucide-react';
import { ChatMessageItem, ChatSessionData } from '../../lib/api';
import { VoiceDock } from './VoiceDock';
import { Transcript } from './Transcript';
import { AnswerChoices, Choice, plainLabel } from './AnswerChoices';
import { JobCard } from './JobCard';
import { DiagnosisReport } from './DiagnosisReport';
import { ApplianceGlyph } from './ApplianceGlyph';
import { buildJobCard } from './jobCardData';
import type { EngineVoiceStatus } from './deriveDockState';

type Lang = 'auto' | 'ta' | 'hi' | 'en';

export interface DiagnoseLayoutProps {
  applianceId: string;
  applianceName: string;
  selectedModel: string;
  session: ChatSessionData | null;
  messages: ChatMessageItem[];
  isLoading: boolean;
  language: Lang;
  welcomeText: string;
  suggestions: Choice[];
  isNavigatingToBooking: boolean;

  isVoiceActive: boolean;
  voiceStatus: EngineVoiceStatus;
  isAssistantSpeaking: boolean;
  interimTranscript: string;
  voiceError: string | null;
  isEchoGateEnabled: boolean;

  inputText: string;
  setInputText: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  showScrollBottomBtn: boolean;
  scrollToBottom: (smooth?: boolean) => void;

  userRating: number | null;
  ratingSubmitted: boolean;
  onRate: (n: number) => void;

  onSend: (text?: string) => void;
  onChip: (c: Choice) => void;
  onRestart: () => void;
  onSetLanguage: (l: Lang) => void;
  onToggleVoice: () => void;
  onInterrupt: () => void;
  onToggleEchoGate: () => void;
  getMicAnalyser: () => AnalyserNode | null;
  getPlaybackAnalyser: () => AnalyserNode | null;
}

const ACTION_VALUES = ['START_ERROR_DIAG', 'BOOK_TECH', 'NAV_BOOKING', 'RESTART', 'CONFIRM_BOOKING', 'CANCEL_BOOKING', 'TRACK_TICKET'];
const isActionChip = (c: Choice) =>
  ACTION_VALUES.includes(c.value) || c.value.startsWith('EDIT_') || c.value.startsWith('SLOT_') || c.optionIndex !== undefined;
const isChipValue = (p: Choice) =>
  !!p.issueId || p.value === 'ERROR_CODE' || p.value.startsWith('AC') || p.value.startsWith('REF') || isActionChip(p);

export const DiagnoseLayout: React.FC<DiagnoseLayoutProps> = (p) => {
  const [showReport, setShowReport] = useState(false);
  const [typing, setTyping] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  const card = useMemo(() => buildJobCard(p.messages, p.selectedModel), [p.messages, p.selectedModel]);
  const book = () => p.onChip({ label: 'Book Technician', value: 'NAV_BOOKING' });

  const lastBot = [...p.messages].reverse().find((m) => m.sender === 'bot');
  const lastIsBot = p.messages.length > 0 && p.messages[p.messages.length - 1].sender !== 'user';
  const bookingActive = !!p.session?.bookingState && !['IDLE', 'COMPLETED'].includes(p.session.bookingState.step);
  const freshStart = p.messages.length <= 1;

  let choices: Choice[] = [];
  if (lastIsBot && lastBot?.chips && lastBot.chips.some(isActionChip)) choices = lastBot.chips.filter(isActionChip);
  else if (bookingActive) choices = p.suggestions;
  else if (freshStart) choices = p.suggestions;
  const numbered = choices.some((c) => c.optionIndex !== undefined);
  const isQuestion = !!lastBot?.stepInfo && !lastBot.conclusion && lastIsBot && !bookingActive;

  const pick = (c: Choice) => (isChipValue(c) ? p.onChip(c) : p.onSend(c.label));

  const typeInstead = () => {
    setTyping((t) => !t);
    setTimeout(() => p.inputRef.current?.focus(), 50);
  };

  if (showReport) {
    return <DiagnosisReport data={card} applianceName={p.applianceName} onBack={() => setShowReport(false)} onBook={book} />;
  }

  const placeholder =
    p.language === 'hi' ? 'अपनी समस्या या उत्तर यहाँ लिखें...' : 'Describe the problem, or type your answer';
  const title = [card.brand, p.applianceName].filter(Boolean).join(' ');

  return (
    <div className="flex-1 min-h-0 h-full flex relative">
      {p.isNavigatingToBooking && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-ink text-white px-5 py-2.5 rounded-full flex items-center gap-2.5 text-sm font-medium">
          <Loader2 className="w-4 h-4 animate-spin" /> Opening the booking form…
        </div>
      )}

      <section className="flex-1 min-w-0 w-full flex flex-col px-4 sm:px-8 pb-4 sm:pb-6">
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 pt-5 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0">
              <ApplianceGlyph id={p.applianceId} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-[22px] font-semibold leading-tight truncate">{title}</h1>
              <p className="text-[14px] text-muted truncate">{card.problem || 'Tell me what’s wrong'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={p.isVoiceActive}
              onClick={p.onToggleVoice}
              className="inline-flex items-center gap-2.5 text-[15px] font-medium cursor-pointer"
            >
              Hands-free
              <span className={`relative w-11 h-6 rounded-full transition-colors ${p.isVoiceActive ? 'bg-accent' : 'bg-[#b8c0cb]'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.isVoiceActive ? 'translate-x-5' : ''}`} />
              </span>
            </button>
            {p.isVoiceActive && (
              <button
                type="button"
                onClick={p.onToggleEchoGate}
                aria-pressed={!p.isEchoGateEnabled}
                title="Turn this on if you’re wearing headphones"
                className={`hidden md:inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-[14px] font-medium cursor-pointer ${!p.isEchoGateEnabled ? 'border-accent text-accent bg-accent-soft' : 'border-line bg-white text-ink'}`}
              >
                <Headphones className="w-4 h-4" strokeWidth={1.75} /> I’m using headphones
              </button>
            )}
            <select
              value={p.language}
              onChange={(e) => p.onSetLanguage(e.target.value as Lang)}
              aria-label="Language"
              className="h-10 pl-3 pr-8 rounded-xl border border-line bg-white text-[15px] font-medium cursor-pointer"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="ta">தமிழ்</option>
              <option value="auto">Auto-detect</option>
            </select>
            <button type="button" onClick={p.onRestart} className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink/80 hover:text-ink cursor-pointer">
              <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> <span className="hidden sm:inline">Start over</span>
            </button>
            <button type="button" onClick={() => setCardOpen(true)} className="lg:hidden inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-line bg-white text-[15px] font-medium cursor-pointer">
              <ClipboardList className="w-4 h-4" strokeWidth={1.75} /> Job card
            </button>
          </div>
        </header>

        <div className="relative flex-1 min-h-0">
          <div ref={p.scrollContainerRef} onScroll={p.onScroll} className="absolute inset-0 overflow-y-auto pb-4">
            <div className="max-w-3xl mx-auto">
              <Transcript
                messages={p.messages}
                language={p.language}
                welcomeText={p.welcomeText}
                isLoading={p.isLoading}
                interimTranscript={p.isVoiceActive ? p.interimTranscript : ''}
                userRating={p.userRating}
                ratingSubmitted={p.ratingSubmitted}
                onRate={p.onRate}
                onSchedule={() => p.onSend('Schedule service')}
                onOpenReport={() => setShowReport(true)}
              />
            </div>
          </div>
          {p.showScrollBottomBtn && (
            <button
              onClick={() => p.scrollToBottom(true)}
              className="absolute -bottom-1 right-2 sm:right-6 z-10 h-9 px-3 rounded-full bg-ink text-white text-[13px] font-medium inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
            >
              <ArrowDown className="w-3.5 h-3.5" strokeWidth={2} /> Jump to latest
            </button>
          )}
        </div>

        <div className="shrink-0 max-w-3xl w-full mx-auto pt-3 space-y-3">
          <AnswerChoices
            choices={choices.map((c) => ({ ...c, label: plainLabel(c.label) || c.label }))}
            language={p.language}
            disabled={p.isLoading}
            numbered={numbered}
            onPick={pick}
            onNotSure={isQuestion ? () => p.onSend('I’m not sure') : undefined}
          />
          <VoiceDock
            isVoiceActive={p.isVoiceActive}
            voiceStatus={p.voiceStatus}
            isAssistantSpeaking={p.isAssistantSpeaking}
            interimTranscript={p.interimTranscript}
            voiceError={p.voiceError}
            getMicAnalyser={p.getMicAnalyser}
            getPlaybackAnalyser={p.getPlaybackAnalyser}
            onToggleVoice={p.onToggleVoice}
            onInterrupt={p.onInterrupt}
            onTypeInstead={typeInstead}
            inputText={p.inputText}
            setInputText={p.setInputText}
            inputRef={p.inputRef}
            onSend={() => p.onSend()}
            isLoading={p.isLoading}
            typing={typing}
            placeholder={placeholder}
          />
        </div>
      </section>

      <aside className="hidden lg:block w-[380px] shrink-0 py-5 pr-6 min-h-0">
        <JobCard data={card} applianceName={p.applianceName} onBook={book} onOpenReport={() => setShowReport(true)} />
      </aside>

      {cardOpen && (
        <div className="lg:hidden absolute inset-0 z-40 bg-paper p-4 overflow-y-auto">
          <button onClick={() => setCardOpen(false)} className="mb-3 inline-flex items-center gap-1 text-[15px] font-medium cursor-pointer">
            <X className="w-4 h-4" /> Close
          </button>
          <JobCard data={card} applianceName={p.applianceName} onBook={book} onOpenReport={() => { setCardOpen(false); setShowReport(true); }} />
        </div>
      )}
    </div>
  );
};
