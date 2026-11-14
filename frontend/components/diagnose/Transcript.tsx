'use client';

import React from 'react';
import { CheckCircle2, Star, Wrench, FileText, Calendar, UserCheck } from 'lucide-react';
import { ChatMessageItem } from '../../lib/api';

interface TranscriptProps {
  messages: ChatMessageItem[];
  language: 'auto' | 'ta' | 'hi' | 'en';
  welcomeText: string;
  isLoading: boolean;
  interimTranscript: string;
  userRating: number | null;
  ratingSubmitted: boolean;
  onRate: (n: number) => void;
  onSchedule: () => void;
  onOpenReport: () => void;
}

function renderLines(text: string) {
  return text.split('\n').filter((l) => l.trim()).map((line, i) => {
    const parts = line.split('**');
    return (
      <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
        {parts.map((p, j) => (j % 2 === 1 ? <strong key={j} className="font-semibold text-ink">{p}</strong> : p))}
      </p>
    );
  });
}

export const Transcript: React.FC<TranscriptProps> = ({
  messages, language, welcomeText, isLoading, interimTranscript, userRating, ratingSubmitted, onRate, onSchedule, onOpenReport,
}) => {
  return (
    <div className="space-y-1">
      {messages.map((msg, index) => {
        const isBot = msg.sender !== 'user';
        const prev = messages[index - 1];
        const startsRun = !prev || (prev.sender === 'user') !== !isBot;
        const text = index === 0 && isBot ? welcomeText : language === 'hi' && msg.textHi ? msg.textHi : msg.text;
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={msg.id || index} className={`group grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)] gap-x-4 ${startsRun ? 'pt-5' : 'pt-1'}`}>
            <div className={`text-[13px] font-semibold leading-7 ${startsRun ? '' : 'hidden sm:block'} ${isBot ? 'text-accent' : 'text-muted'}`}>
              {startsRun ? (isBot ? 'ApplianceCare' : 'You') : <span className="text-[11px] font-normal text-muted opacity-0 group-hover:opacity-100 transition-opacity">{time}</span>}
            </div>
            <div className="min-w-0">
              <div
                title={time}
                className={`text-[17px] leading-7 break-words ${
                  isBot ? (msg.safetyAlert ? 'text-bad' : 'text-ink') : 'text-ink font-medium'
                }`}
              >
                {renderLines(text)}
              </div>

              {language === 'hi' && msg.textHi && msg.text && msg.text !== msg.textHi && index > 0 && (
                <p className="text-[13px] text-muted mt-1">EN: {msg.text.split('\n')[0]}</p>
              )}

              {msg.instruction && (
                <div className="mt-3 rounded-xl bg-[#fbf1da] px-4 py-3 text-[14px] text-ink">
                  <div className="font-semibold flex items-center gap-2"><Wrench className="w-4 h-4" strokeWidth={1.75} /> Try this</div>
                  <p className="mt-1">{msg.instruction.replace(/_/g, ' ')}</p>
                </div>
              )}

              {msg.conclusion && (
                <div className="mt-3 rounded-xl border border-line bg-white px-4 py-4">
                  <div className="text-[13px] text-muted">Most likely cause</div>
                  <div className="font-display text-[22px] font-semibold leading-tight mt-0.5">{msg.conclusion.probable_cause}</div>
                  {msg.conclusion.parts && msg.conclusion.parts.length > 0 && (
                    <p className="text-[14px] text-muted mt-2">Parts to check: {msg.conclusion.parts.join(', ')}</p>
                  )}
                  {msg.safetyAlert && (
                    <p className="mt-3 rounded-lg bg-[#fbf1da] px-3 py-2 text-[14px]"><strong className="font-semibold">Don’t repair this yourself.</strong> A technician should handle it.</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={onSchedule} className="h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
                      <Calendar className="w-4 h-4" strokeWidth={1.75} /> Book a technician
                    </button>
                    <button onClick={onOpenReport} className="h-10 px-4 rounded-lg border border-line bg-white hover:bg-paper text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
                      <FileText className="w-4 h-4" strokeWidth={1.75} /> See full report
                    </button>
                  </div>
                </div>
              )}

              {(msg.action === 'BOOKING_CONFIRMED' || msg.ticketId) && (
                <div className="mt-3 rounded-xl border border-line bg-white px-4 py-4 text-[14px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-ok" strokeWidth={1.75} /> Visit booked</span>
                    {msg.ticketId && <span className="font-mono text-[12px] text-muted">{msg.ticketId}</span>}
                  </div>
                  {msg.ticket && (
                    <dl className="mt-3 grid sm:grid-cols-2 gap-3">
                      <div><dt className="text-muted text-[12px]">Technician</dt><dd className="font-medium flex items-center gap-1.5"><UserCheck className="w-4 h-4" strokeWidth={1.75} />{msg.ticket.assignedTechnician?.name || 'Assigned shortly'}</dd></div>
                      <div><dt className="text-muted text-[12px]">When</dt><dd className="font-medium">{msg.ticket.scheduledDate} ({msg.ticket.scheduledSlot})</dd></div>
                    </dl>
                  )}
                  <p className="mt-3 text-muted text-[13px]">A confirmation with tracking details has been sent.</p>
                </div>
              )}

              {msg.isResolution && (
                <div className="mt-3 rounded-xl border border-line bg-white px-4 py-4 text-[14px]">
                  <div className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-ok" strokeWidth={1.75} /> Fixed. No visit needed.</div>
                  {!ratingSubmitted ? (
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-muted">Was this helpful?</span>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button key={s} onClick={() => onRate(s)} className="p-1 cursor-pointer" aria-label={`${s} out of 5`}>
                            <Star className={`w-5 h-5 ${userRating && userRating >= s ? 'text-amber-500 fill-amber-500' : 'text-line'}`} strokeWidth={1.75} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-ok font-medium">Thanks for the feedback ({userRating}/5).</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {interimTranscript && (
        <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)] gap-x-4 pt-5">
          <div className="text-[13px] font-semibold leading-7 text-muted">You</div>
          <p className="text-[17px] leading-7 vd-interim">{interimTranscript}</p>
        </div>
      )}

      {isLoading && !interimTranscript && (
        <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)] gap-x-4 pt-5" aria-live="polite">
          <div className="text-[13px] font-semibold leading-7 text-accent">ApplianceCare</div>
          <div className="flex items-center gap-1.5 h-7" aria-label="Working on it">
            <span className="vd-dots-inline"><i /><i /><i /></span>
          </div>
        </div>
      )}
    </div>
  );
};
