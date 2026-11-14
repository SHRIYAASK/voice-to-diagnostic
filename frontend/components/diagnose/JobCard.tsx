'use client';

import React from 'react';
import { Check, Calendar, FileText } from 'lucide-react';
import { JobCardData } from './jobCardData';

interface JobCardProps {
  data: JobCardData;
  applianceName: string;
  onBook: () => void;
  onOpenReport: () => void;
}

const Row = ({ k, v }: { k: string; v?: string }) => (
  <div className="flex gap-4 py-1.5 text-[15px]">
    <dt className="w-24 shrink-0 text-muted">{k}</dt>
    <dd className={v ? 'text-ink font-medium' : 'text-muted/80'}>{v || 'Not added'}</dd>
  </div>
);

export const JobCard: React.FC<JobCardProps> = ({ data, applianceName, onBook, onOpenReport }) => {
  const done = data.checks.filter((c) => c.status === 'done').length;
  return (
    <div className="rounded-2xl bg-white border border-line p-6 h-full overflow-y-auto">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[28px] font-semibold">Job card</h2>
        <span className="text-[12px] px-2.5 py-1 rounded-full bg-paper text-muted font-medium">{data.conclusion ? 'Ready' : 'Draft'}</span>
      </div>
      <p className="text-[14px] text-muted mt-1">Fills in as you talk. If you book a technician, they get this card, so you won’t explain twice.</p>

      <dl className="mt-5 pt-4 border-t border-line">
        <Row k="Appliance" v={applianceName} />
        <Row k="Brand" v={data.brand} />
        <Row k="Model" v={data.model} />
        <Row k="Problem" v={data.problem} />
      </dl>

      <div className="mt-5 pt-4 border-t border-line">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-[19px] font-semibold">Checks</h3>
          {data.checks.length > 0 && <span className="text-[13px] text-muted">{done} done</span>}
        </div>
        {data.checks.length === 0 ? (
          <p className="text-[14px] text-muted mt-2">Checks appear here as we go through them.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {data.checks.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center ${
                    c.status === 'done' ? 'bg-[#e2f3e8] text-ok' : 'border-2 border-accent'
                  }`}
                >
                  {c.status === 'done' ? <Check className="w-3 h-3" strokeWidth={3} /> : <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <div className="min-w-0 text-[15px] leading-snug">
                  <div className="font-medium text-ink">{c.question}</div>
                  <div className={`text-[13px] ${c.status === 'asking' ? 'text-accent' : 'text-muted'}`}>
                    {c.status === 'asking' ? 'Asking now' : c.answer}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {data.conclusion && (
        <div className="mt-5 pt-4 border-t border-line">
          <h3 className="font-display text-[19px] font-semibold">Likely cause</h3>
          <p className="text-[15px] mt-1.5 font-medium">{data.conclusion.probable_cause}</p>
          {data.conclusion.parts && data.conclusion.parts.length > 0 && (
            <p className="text-[13px] text-muted mt-1">Parts to check: {data.conclusion.parts.join(', ')}</p>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        <button onClick={onBook} className="w-full h-11 rounded-xl bg-accent hover:bg-accent-hover text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
          <Calendar className="w-4 h-4" strokeWidth={1.75} /> Book a technician now
        </button>
        {data.conclusion && (
          <button onClick={onOpenReport} className="w-full h-11 rounded-xl border border-line hover:bg-paper text-[15px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
            <FileText className="w-4 h-4" strokeWidth={1.75} /> See full report
          </button>
        )}
        <p className="text-center text-[13px] text-muted">You can skip the remaining checks.</p>
      </div>
    </div>
  );
};
