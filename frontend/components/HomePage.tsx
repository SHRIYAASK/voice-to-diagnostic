'use client';

import React from 'react';
import { ArrowRight, ArrowUpRight, Check, Mic, ShieldAlert } from 'lucide-react';
import { APPLIANCE_CATEGORIES } from '../lib/appliances';
import { UserProfile } from '../lib/api';
import { ApplianceGlyph } from './diagnose/ApplianceGlyph';

interface HomePageProps {
  currentUser: UserProfile | null;
  onOpenAuth: (role?: 'customer' | 'technician' | 'admin') => void;
  onSelectAppliance: (applianceId: string) => void;
  onNavigateToTab: (tabId: string) => void;
}

// Static bar heights for the illustrative waveform in the preview (not live audio)
const BARS = [4, 9, 6, 14, 22, 12, 28, 18, 34, 20, 30, 14, 24, 10, 18, 8, 12, 5, 8, 4];

const STEPS = [
  { n: '01', t: 'Say what’s wrong', d: 'Talk or type, in English, Hindi or Tamil. No forms, no menus to dig through.' },
  { n: '02', t: 'We check it with you', d: 'One simple question at a time, taken from the manufacturer’s own troubleshooting steps.' },
  { n: '03', t: 'You decide what’s next', d: 'Fix it yourself if it’s safe. If it isn’t, a technician gets your job card, so you never explain twice.' },
];

export const HomePage: React.FC<HomePageProps> = ({ currentUser, onOpenAuth, onSelectAppliance, onNavigateToTab }) => {
  const primary = () => (currentUser ? onNavigateToTab('diagnostic') : onOpenAuth('customer'));

  return (
    <div className="w-full text-ink">
      {/* HERO */}
      <section className="px-6 sm:px-10 lg:px-14 pt-12 sm:pt-16 pb-16 max-w-7xl mx-auto grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-12 lg:gap-16 items-center">
        <div>
          <p className="text-[14px] font-semibold text-accent tracking-wide uppercase">ApplianceCare</p>
          <h1 className="font-display font-semibold text-[48px] sm:text-[68px] leading-[0.98] mt-4">
            Tell us what’s wrong.
            <br />
            <span className="text-ink/55">We’ll work out why.</span>
          </h1>
          <p className="mt-6 text-[19px] leading-relaxed text-ink/75 max-w-xl">
            Diagnose your air conditioner, fridge, washing machine, microwave or dishwasher by talking to it like you would a technician. If it needs a visit, they arrive already knowing the problem.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={primary} className="px-6 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-[16px] font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors">
              {currentUser ? 'Start a diagnosis' : 'Sign in to start'}
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
            <button onClick={() => onNavigateToTab('error-codes')} className="px-6 py-3.5 rounded-xl border border-ink/20 hover:border-ink text-[16px] font-semibold cursor-pointer transition-colors">
              Look up an error code
            </button>
          </div>
          <p className="mt-4 text-[14px] text-muted">Error codes and care guides are open to everyone. Diagnosis needs a free account.</p>
        </div>

        {/* Product preview with sample content */}
        <div className="relative" aria-hidden="true">
          <div className="rounded-3xl bg-white border border-line p-6 shadow-[0_30px_60px_-30px_rgba(20,26,34,0.35)]">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[26px] font-semibold">Job card</span>
              <span className="text-[12px] px-2.5 py-1 rounded-full bg-paper text-muted font-medium">Draft</span>
            </div>
            <dl className="mt-4 pt-3 border-t border-line text-[15px] space-y-1.5">
              <div className="flex gap-4"><dt className="w-24 text-muted">Appliance</dt><dd className="font-medium">Split AC</dd></div>
              <div className="flex gap-4"><dt className="w-24 text-muted">Brand</dt><dd className="font-medium">Samsung</dd></div>
              <div className="flex gap-4"><dt className="w-24 text-muted">Problem</dt><dd className="font-medium">Not cooling, room stays warm</dd></div>
            </dl>
            <ul className="mt-4 pt-3 border-t border-line space-y-3 text-[15px]">
              <li className="flex gap-3"><span className="mt-0.5 w-5 h-5 rounded-full bg-[#e2f3e8] text-ok grid place-items-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} /></span><div><div className="font-medium">Power and display</div><div className="text-[13px] text-muted">On, showing 24 °C</div></div></li>
              <li className="flex gap-3"><span className="mt-0.5 w-5 h-5 rounded-full bg-[#e2f3e8] text-ok grid place-items-center shrink-0"><Check className="w-3 h-3" strokeWidth={3} /></span><div><div className="font-medium">Air filter</div><div className="text-[13px] text-muted">Cleaned 2 to 3 months ago</div></div></li>
              <li className="flex gap-3"><span className="mt-0.5 w-5 h-5 rounded-full border-2 border-accent grid place-items-center shrink-0"><span className="w-2 h-2 rounded-full bg-accent" /></span><div><div className="font-medium">Outdoor unit fan</div><div className="text-[13px] text-accent">Asking now</div></div></li>
            </ul>
          </div>
          <div className="mt-4 ml-6 sm:ml-12 rounded-2xl bg-ink text-white px-5 py-4 flex items-center gap-4 shadow-[0_20px_40px_-20px_rgba(20,26,34,0.6)]">
            <div className="flex items-center gap-[3px] h-9 shrink-0">
              {BARS.map((h, i) => (
                <span key={i} className="w-[3px] rounded-full bg-voice" style={{ height: h }} />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[15px]">Speaking</div>
              <div className="text-[13px] text-[#9da8b6] truncate">Is the big fan on the side spinning?</div>
            </div>
            <span className="w-11 h-11 rounded-full border border-voice/50 grid place-items-center shrink-0"><Mic className="w-5 h-5" strokeWidth={1.75} /></span>
          </div>
          <p className="mt-3 text-right text-[12px] text-muted">Sample conversation</p>
        </div>
      </section>

      {/* APPLIANCES */}
      <section className="bg-white border-y border-line">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 py-16 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)] gap-10">
          <div>
            <h2 className="font-display text-[36px] font-semibold leading-tight">What needs fixing?</h2>
            <p className="mt-3 text-muted text-[16px] leading-relaxed">Pick an appliance. We’ll load its troubleshooting steps and error codes.</p>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {APPLIANCE_CATEGORIES.map((a) => (
              <li key={a.id}>
                <button onClick={() => onSelectAppliance(a.id)} className="group w-full flex items-center gap-5 py-5 text-left cursor-pointer">
                  <span className="w-12 h-12 rounded-xl bg-paper text-ink grid place-items-center shrink-0 group-hover:bg-accent-soft group-hover:text-accent transition-colors">
                    <ApplianceGlyph id={a.id} className="w-6 h-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[24px] font-semibold leading-tight">{a.name}</span>
                    <span className="block text-[15px] text-muted truncate">{a.description}</span>
                  </span>
                  <span className="hidden sm:block text-[14px] text-muted shrink-0">{a.errorCodes.length} error codes</span>
                  <ArrowUpRight className="w-5 h-5 text-muted group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 py-16">
        <h2 className="font-display text-[36px] font-semibold">How it works</h2>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] md:grid-cols-3 gap-x-10 gap-y-8">
          {STEPS.map((s) => (
            <div key={s.n} className="border-t-2 border-ink pt-4">
              <div className="font-display text-[15px] font-semibold text-accent">{s.n}</div>
              <h3 className="font-display text-[26px] font-semibold leading-tight mt-1">{s.t}</h3>
              <p className="mt-2 text-[16px] text-ink/70 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SAFETY */}
      <section className="px-6 sm:px-10 lg:px-14 pb-16 max-w-7xl mx-auto">
        <div className="rounded-3xl bg-ink text-white p-8 sm:p-12 grid grid-cols-[minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)] gap-6 md:gap-10 items-start">
          <ShieldAlert className="w-10 h-10 text-[#f2b84b]" strokeWidth={1.5} />
          <div>
            <h2 className="font-display text-[34px] font-semibold leading-tight">We’ll tell you when to stop.</h2>
            <p className="mt-3 text-[17px] text-[#c4ccd6] leading-relaxed max-w-3xl">
              Some repairs are not for the home. Mains wiring, refrigerant gas and a microwave’s capacitor can hurt you. When a check points there, we say so plainly, switch you to a certified technician and pass them everything you’ve told us.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={primary} className="h-11 px-5 rounded-xl bg-white text-ink text-[15px] font-semibold cursor-pointer hover:bg-[#f1f3f6]">
                {currentUser ? 'Go to diagnosis' : 'Create a free account'}
              </button>
              <button onClick={() => onNavigateToTab('maintenance')} className="h-11 px-5 rounded-xl border border-white/25 text-[15px] font-semibold cursor-pointer hover:border-white">
                Read the care guide
              </button>
            </div>
          </div>
        </div>
        <p className="mt-6 text-[14px] text-muted">
          Service team?{' '}
          <button onClick={() => onOpenAuth('technician')} className="underline underline-offset-2 hover:text-ink cursor-pointer">Technician sign in</button>
          {' · '}
          <button onClick={() => onOpenAuth('admin')} className="underline underline-offset-2 hover:text-ink cursor-pointer">Admin sign in</button>
        </p>
      </section>
    </div>
  );
};
