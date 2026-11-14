'use client';

import React, { useState } from 'react';
import { ChevronLeft, Share2, Printer, TriangleAlert, Check, Calendar } from 'lucide-react';
import { JobCardData } from './jobCardData';

interface Props {
  data: JobCardData;
  applianceName: string;
  onBack: () => void;
  onBook: () => void;
}

export const DiagnosisReport: React.FC<Props> = ({ data, applianceName, onBack, onBook }) => {
  const [shared, setShared] = useState(false);
  const c = data.conclusion;
  const title = [data.brand, applianceName].filter(Boolean).join(' ');
  const answered = data.checks.filter((x) => x.status === 'done');

  const summary = [
    `Diagnosis: ${title}`,
    data.problem ? `Problem: ${data.problem}` : '',
    c ? `Most likely cause: ${c.probable_cause}` : 'No conclusion yet',
    c?.parts?.length ? `Parts to check: ${c.parts.join(', ')}` : '',
    ...answered.map((x) => `- ${x.question}: ${x.answer}`),
  ].filter(Boolean).join('\n');

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `Diagnosis: ${title}`, text: summary });
      else {
        await navigator.clipboard.writeText(summary);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* user cancelled */
    }
  };

  const steps: Array<{ t: string; d?: string }> = [];
  if (data.safety) steps.push({ t: 'Switch the appliance off at the mains', d: 'Do this now. Don’t run it until it’s checked.' });
  if (c?.technician_note) steps.push({ t: 'Note for the technician', d: c.technician_note });
  steps.push({ t: c ? 'Book a technician' : 'Finish the remaining checks', d: c ? 'They get this report before arriving.' : undefined });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto">
        <button onClick={onBack} className="no-print inline-flex items-center gap-1 text-accent text-[15px] font-medium cursor-pointer">
          <ChevronLeft className="w-4 h-4" strokeWidth={2} /> Back to conversation
        </button>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[40px] leading-none font-semibold">Diagnosis: {title}</h1>
            <p className="text-muted mt-2">{data.problem || 'No problem described yet'} · {answered.length} checks</p>
          </div>
          <div className="no-print flex gap-2">
            <button onClick={share} className="h-11 px-4 rounded-xl border border-line bg-white text-[15px] font-medium inline-flex items-center gap-2 cursor-pointer">
              <Share2 className="w-4 h-4" strokeWidth={1.75} /> {shared ? 'Copied' : 'Share report'}
            </button>
            <button onClick={() => window.print()} className="h-11 px-4 rounded-xl border border-line bg-white text-[15px] font-medium inline-flex items-center gap-2 cursor-pointer">
              <Printer className="w-4 h-4" strokeWidth={1.75} /> Download PDF
            </button>
          </div>
        </div>

        <div className="mt-6 grid lg:grid-cols-[1fr_340px] gap-6 items-start">
          <div className="space-y-6">
            <section className="rounded-2xl bg-white border border-line p-7">
              <div className="text-[14px] text-muted">Most likely cause</div>
              <h2 className="font-display text-[34px] leading-tight font-semibold mt-1">
                {c ? c.probable_cause : 'Not enough information yet'}
              </h2>
              {c?.parts && c.parts.length > 0 && <p className="mt-3 text-[16px] text-ink/80">Parts to check: {c.parts.join(', ')}.</p>}
              {c?.priority && <p className="mt-1 text-[14px] text-muted">Priority: {c.priority}</p>}
              {data.safety && (
                <div className="mt-5 rounded-xl bg-[#fbf1da] px-4 py-3 flex gap-3 text-[15px]">
                  <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.75} />
                  <p><strong className="font-semibold">Don’t repair this yourself.</strong> This needs a certified technician.</p>
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white border border-line p-7">
              <h2 className="font-display text-[24px] font-semibold">What we checked</h2>
              <p className="text-muted text-[14px]">Your answers, in the order we asked.</p>
              {answered.length === 0 ? (
                <p className="mt-4 text-muted">No checks completed yet.</p>
              ) : (
                <table className="w-full mt-4 text-[15px]">
                  <thead>
                    <tr className="text-left text-[13px] text-muted border-b border-line"><th className="py-2 font-medium">Check</th><th className="py-2 font-medium">You said</th></tr>
                  </thead>
                  <tbody>
                    {answered.map((x, i) => (
                      <tr key={i} className="border-b border-line/70 last:border-0 align-top">
                        <td className="py-3 pr-4 font-medium"><span className="inline-flex items-start gap-2"><Check className="w-4 h-4 mt-1 text-ok shrink-0" strokeWidth={2.5} />{x.question}</span></td>
                        <td className="py-3 text-ink/80">“{x.answer}”</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <aside className="rounded-2xl bg-white border border-line p-6 lg:sticky lg:top-0">
            <h2 className="font-display text-[24px] font-semibold">What to do now</h2>
            <ol className="mt-4 space-y-4">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-ink text-white text-[13px] font-semibold grid place-items-center">{i + 1}</span>
                  <div className="text-[15px] leading-snug"><div className="font-semibold">{s.t}</div>{s.d && <div className="text-muted mt-0.5">{s.d}</div>}</div>
                </li>
              ))}
            </ol>
            <button onClick={onBook} className="no-print mt-6 w-full h-12 rounded-xl bg-accent hover:bg-accent-hover text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
              <Calendar className="w-4 h-4" strokeWidth={1.75} /> Book technician
            </button>
            <p className="mt-3 text-center text-[13px] text-muted">You’ll pick a visit time on the next screen.</p>
          </aside>
        </div>
      </div>
    </div>
  );
};
