'use client';

import React, { useEffect } from 'react';

export interface Choice {
  label: string;
  labelHi?: string;
  value: string;
  optionIndex?: number;
  issueId?: string;
}

interface AnswerChoicesProps {
  choices: Choice[];
  language: 'auto' | 'ta' | 'hi' | 'en';
  disabled: boolean;
  numbered: boolean;
  onPick: (c: Choice) => void;
  /** Quiet escape hatch under a question: "I'm not sure". */
  onNotSure?: () => void;
}

/** Remove leading emoji / symbols so chip labels read as plain words. */
export const plainLabel = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();

export const AnswerChoices: React.FC<AnswerChoicesProps> = ({ choices, language, disabled, numbered, onPick, onNotSure }) => {
  // Keys 1-9 pick an answer, unless the user is typing
  useEffect(() => {
    if (!numbered) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || disabled) return;
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) onPick(choices[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, numbered, disabled, onPick]);

  if (choices.length === 0 && !onNotSure) return null;

  return (
    <div>
      {choices.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 gap-2.5">
          {choices.map((c, i) => (
            <button
              key={`${c.value}-${i}`}
              type="button"
              disabled={disabled}
              onClick={() => onPick(c)}
              className="min-h-[52px] px-4 py-2.5 rounded-xl border border-line bg-white hover:border-accent hover:bg-accent-soft text-left text-[15px] font-medium text-ink flex items-center justify-between gap-3 disabled:opacity-50 cursor-pointer transition-colors"
            >
              <span>{plainLabel(language === 'hi' && c.labelHi ? c.labelHi : c.label)}</span>
              {numbered && i < 9 && (
                <kbd className="shrink-0 text-[12px] font-medium text-muted border border-line rounded px-1.5 py-0.5 hidden sm:inline">{i + 1}</kbd>
              )}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[13px] text-muted">
        {numbered && choices.length > 0 ? 'Say it, tap it, or press a number. ' : ''}
        {onNotSure && (
          <button type="button" onClick={onNotSure} disabled={disabled} className="underline underline-offset-2 hover:text-ink cursor-pointer disabled:opacity-50">
            I’m not sure
          </button>
        )}
      </p>
    </div>
  );
};
