'use client';

import React, { useState } from 'react';
import { Home, MessagesSquare, ScanLine, Wrench, ClipboardList, ShieldCheck, Gauge, User, LogOut, Check } from 'lucide-react';
import { UserProfile } from '../lib/api';
import { APPLIANCE_CATEGORIES } from '../lib/appliances';
import { ApplianceGlyph } from './diagnose/ApplianceGlyph';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedAppliance: string;
  setSelectedAppliance: (applianceId: string) => void;
  currentUser: UserProfile | null;
  onOpenAuthModal: (role?: 'customer' | 'technician' | 'admin') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  selectedAppliance,
  setSelectedAppliance,
  currentUser,
  onOpenAuthModal,
  onLogout,
}) => {
  const [menu, setMenu] = useState<null | 'appliance' | 'user'>(null);

  const items: Array<{ id: string; label: string; icon: React.ElementType; also?: string[] }> = [
    ...(currentUser ? [{ id: 'diagnostic', label: 'Diagnose', icon: MessagesSquare }] : [{ id: 'home', label: 'Home', icon: Home }]),
    { id: 'error-codes', label: 'Error codes', icon: ScanLine },
    { id: 'maintenance', label: 'Care guide', icon: Wrench },
    { id: 'track-ticket', label: 'Requests', icon: ClipboardList, also: ['book-service'] },
  ];
  if (currentUser?.role === 'technician') items.push({ id: 'technician', label: 'Workspace', icon: Wrench });
  if (currentUser?.role === 'admin') items.push({ id: 'admin', label: 'Admin', icon: ShieldCheck });

  const go = (id: string) => {
    setActiveTab(id);
    setMenu(null);
  };
  const active = (it: (typeof items)[number]) => activeTab === it.id || !!it.also?.includes(activeTab);

  const popover = (
    <>
      {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />}
      {menu === 'appliance' && (
        <div className="fixed z-50 left-24 top-24 max-md:left-4 max-md:top-16 w-60 rounded-xl bg-white border border-line shadow-lg p-1.5">
          <div className="px-3 py-2 text-[12px] text-muted">Appliance</div>
          {APPLIANCE_CATEGORIES.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setSelectedAppliance(a.id);
                setMenu(null);
                setActiveTab('diagnostic');
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-paper text-[15px] font-medium text-left cursor-pointer"
            >
              <ApplianceGlyph id={a.id} className="w-5 h-5 text-muted" />
              <span className="flex-1">{a.name}</span>
              {a.id === selectedAppliance && <Check className="w-4 h-4 text-accent" />}
            </button>
          ))}
        </div>
      )}
      {menu === 'user' && (
        <div className="fixed z-50 left-24 bottom-6 max-md:left-auto max-md:right-4 max-md:bottom-20 w-64 rounded-xl bg-white border border-line shadow-lg p-2">
          {currentUser ? (
            <>
              <div className="px-3 py-2">
                <div className="text-[12px] text-muted capitalize">{currentUser.role}</div>
                <div className="font-semibold truncate">{currentUser.name}</div>
              </div>
              <button
                id="btn-nav-logout"
                onClick={() => {
                  setMenu(null);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-paper text-[15px] font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} /> Sign out
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-2 text-[12px] text-muted">Sign in as</div>
              {([
                ['customer', 'Customer', 'btn-sidebar-signin', 'Track requests and save your details'],
                ['technician', 'Technician', 'btn-sidebar-technician', 'Field workspace'],
                ['admin', 'Admin', 'btn-sidebar-admin', 'Operations dashboard'],
              ] as const).map(([role, label, id, hint]) => (
                <button
                  key={role}
                  id={id}
                  onClick={() => {
                    setMenu(null);
                    onOpenAuthModal(role);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-paper cursor-pointer"
                >
                  <div className="text-[15px] font-semibold">{label}</div>
                  <div className="text-[12px] text-muted">{hint}</div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="no-print hidden md:flex w-[88px] shrink-0 h-screen sticky top-0 z-30 flex-col items-center pt-5 pb-16 gap-1 bg-[#e4e8ee] border-r border-line">
        <button onClick={() => go(currentUser ? 'diagnostic' : 'home')} aria-label="ApplianceCare home" className="w-11 h-11 rounded-xl bg-ink text-white grid place-items-center cursor-pointer mb-4">
          <Gauge className="w-6 h-6" strokeWidth={1.75} />
        </button>

        <button
          onClick={() => setMenu(menu === 'appliance' ? null : 'appliance')}
          aria-label="Change appliance"
          title="Change appliance"
          className="w-14 h-12 mb-2 rounded-xl border border-line bg-white grid place-items-center text-accent cursor-pointer"
        >
          <ApplianceGlyph id={selectedAppliance} />
        </button>

        <nav className="flex flex-col gap-1 w-full px-2">
          {items.map((it) => {
            const Icon = it.icon;
            const on = active(it);
            return (
              <button
                key={it.id}
                id={`nav-${it.id}`}
                onClick={() => go(it.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[12px] font-medium cursor-pointer transition-colors ${on ? 'bg-accent-soft text-accent' : 'text-ink/70 hover:bg-white/60'}`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
                {it.label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => setMenu(menu === 'user' ? null : 'user')}
          aria-label={currentUser ? 'Account' : 'Sign in'}
          className="mt-auto flex flex-col items-center gap-1 text-[12px] font-medium text-ink cursor-pointer"
        >
          <span className="w-11 h-11 rounded-full bg-white border border-line grid place-items-center">
            <User className="w-5 h-5" strokeWidth={1.75} />
          </span>
          {currentUser ? currentUser.name.split(' ')[0] : 'Sign in'}
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="no-print md:hidden shrink-0 h-14 px-4 flex items-center justify-between bg-[#e4e8ee] border-b border-line z-30">
        <button onClick={() => go(currentUser ? 'diagnostic' : 'home')} className="flex items-center gap-2 cursor-pointer">
          <span className="w-8 h-8 rounded-lg bg-ink text-white grid place-items-center"><Gauge className="w-5 h-5" strokeWidth={1.75} /></span>
          <span className="font-display font-semibold text-[18px]">ApplianceCare</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setMenu(menu === 'appliance' ? null : 'appliance')} aria-label="Change appliance" className="w-10 h-10 rounded-xl border border-line bg-white grid place-items-center text-accent cursor-pointer">
            <ApplianceGlyph id={selectedAppliance} />
          </button>
          <button onClick={() => setMenu(menu === 'user' ? null : 'user')} aria-label={currentUser ? 'Account' : 'Sign in'} className="h-10 px-3 rounded-full bg-white border border-line inline-flex items-center gap-1.5 text-[14px] font-medium cursor-pointer">
            <User className="w-4 h-4" strokeWidth={1.75} /> {currentUser ? currentUser.name.split(' ')[0] : 'Sign in'}
          </button>
        </div>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-[#e4e8ee] border-t border-line flex">
        {items.map((it) => {
          const Icon = it.icon;
          const on = active(it);
          return (
            <button key={it.id} onClick={() => go(it.id)} aria-current={on ? 'page' : undefined} className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${on ? 'text-accent' : 'text-ink/70'}`}>
              <Icon className="w-5 h-5" strokeWidth={1.75} />
              {it.label}
            </button>
          );
        })}
      </nav>

      {popover}
    </>
  );
};
