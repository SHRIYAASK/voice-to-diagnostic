'use client';

import React, { useState } from 'react';
import { 
  User, 
  Wrench, 
  ShieldCheck, 
  Lock, 
  Mail, 
  CheckCircle2, 
  ArrowRight, 
  LogOut,
  Sparkles,
  KeyRound,
  Check,
  Terminal,
  Code
} from 'lucide-react';
import { apiClient, UserProfile } from '../lib/api';

interface CorporateLoginCardProps {
  currentUser: UserProfile;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout: () => void;
  isModal?: boolean;
}

export const CorporateLoginCard: React.FC<CorporateLoginCardProps> = ({
  currentUser,
  onLoginSuccess,
  onLogout,
  isModal = false,
}) => {
  const [email, setEmail] = useState('tech2@lg.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [lastApiResponse, setLastApiResponse] = useState<any>(null);

  const handleLoginSubmit = async (e?: React.FormEvent, customEmail?: string) => {
    if (e) e.preventDefault();
    const loginEmail = customEmail || email;
    if (!loginEmail.trim()) {
      setErrorMsg('Please enter a corporate email address.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setAuthSuccessMsg(null);

      const res = await apiClient.login({
        email: loginEmail.trim(),
        password: password || 'demo123',
      });

      setLastApiResponse(res);

      if (res.success && res.user) {
        setAuthSuccessMsg(
          `Authenticated successfully as ${res.user.role.toUpperCase()}: ${res.user.name}`
        );
        setTimeout(() => {
          onLoginSuccess(res.user);
        }, 500);
      } else {
        setErrorMsg('Authentication failed. Please verify credentials.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Failed to authenticate with /api/auth/login');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (fillEmail: string) => {
    setEmail(fillEmail);
    setPassword('demo123');
    handleLoginSubmit(undefined, fillEmail);
  };

  return (
    <div className={`w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden ${isModal ? '' : 'max-w-3xl mx-auto my-8'}`}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-6 sm:p-8 relative">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#a50034] text-white text-[11px] font-bold uppercase tracking-wider mb-2.5 shadow-sm">
          <Lock className="w-3 h-3" />
          <span>LG Corporate SSO &amp; Role Gateway</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Custom Corporate Login
        </h2>
        <p className="text-slate-300 text-xs sm:text-sm mt-1.5 leading-relaxed">
          Enter any email &amp; password (e.g., <strong className="text-white">tech2@lg.com</strong> or <strong className="text-white">admin@lg.com</strong>), backed by the <code className="bg-slate-800 text-red-300 px-1.5 py-0.5 rounded font-mono text-xs">/api/auth/login</code> endpoint.
        </p>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        {/* Active Session Status Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shrink-0 ${
              currentUser.role === 'admin' 
                ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                : currentUser.role === 'technician'
                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                : 'bg-blue-100 text-blue-700 border border-blue-200'
            }`}>
              {currentUser.role === 'admin' ? '🛡️' : currentUser.role === 'technician' ? '🔧' : '👤'}
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-sm">
                {currentUser.name}
              </div>
              <div className="text-slate-500">
                Active Role: <strong className="text-[#a50034] uppercase font-bold">{currentUser.role}</strong> ({currentUser.email})
                {currentUser.employeeCode && (
                  <span className="ml-1 text-slate-400 font-mono">[{currentUser.employeeCode}]</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Reset Session</span>
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold animate-shake">
            {errorMsg}
          </div>
        )}

        {authSuccessMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{authSuccessMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Corporate Email Address *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="e.g. tech2@lg.com or admin@lg.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-[#a50034] focus:ring-2 focus:ring-red-100 transition-all"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Supports any technician ID (e.g., <code className="text-slate-600 font-mono">tech1@lg.com</code> to <code className="text-slate-600 font-mono">tech10@lg.com</code>), admin (<code className="text-slate-600 font-mono">admin@lg.com</code>), or customer emails.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Password *
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="Enter any corporate password (e.g. password123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-[#a50034] focus:ring-2 focus:ring-red-100 transition-all"
              />
            </div>
          </div>

          {/* Quick Pre-Fill Pills */}
          <div>
            <span className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
              Quick One-Click Test Accounts:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('tech2@lg.com')}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition-all cursor-pointer shadow-2xs hover:scale-102"
              >
                🔧 tech2@lg.com (Tech: Anil Kumar)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('admin@lg.com')}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 transition-all cursor-pointer shadow-2xs hover:scale-102"
              >
                🛡️ admin@lg.com (Supervisor: Service Admin)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('customer@lg.com')}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 transition-all cursor-pointer shadow-2xs hover:scale-102"
              >
                👤 customer@lg.com (Home User)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('tech5@lg.com')}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-all cursor-pointer shadow-2xs hover:scale-102"
              >
                🔧 tech5@lg.com (Tech: Rajesh Sharma)
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-3.5 bg-[#a50034] hover:bg-[#86002a] text-white font-extrabold text-sm rounded-xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <span>{loading ? 'Authenticating via /api/auth/login...' : 'Sign In via /api/auth/login'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Live API Telemetry Preview */}
        {lastApiResponse && (
          <div className="p-4 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono space-y-2 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Terminal className="w-3.5 h-3.5" />
                <span>Response: HTTP 200 OK (/api/auth/login)</span>
              </span>
              <span className="text-[10px] text-slate-500">Live JSON Payload</span>
            </div>
            <pre className="overflow-x-auto text-[11px] text-emerald-300 leading-relaxed">
              {JSON.stringify(lastApiResponse, null, 2)}
            </pre>
          </div>
        )}

        {/* Roles Overview Cards */}
        <div className="pt-4 border-t border-slate-100">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">
            Role Privileges &amp; Portals:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div 
              onClick={() => handleQuickFill('customer@lg.com')}
              className="p-3.5 rounded-2xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/40 cursor-pointer transition-all shadow-2xs group"
            >
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                <span>Customer Portal</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Self-service triage (AC01-AC16), Error code lookup, Booking service.
              </p>
            </div>

            <div 
              onClick={() => handleQuickFill('tech2@lg.com')}
              className="p-3.5 rounded-2xl border border-slate-200 hover:border-amber-400 bg-white hover:bg-amber-50/40 cursor-pointer transition-all shadow-2xs group"
            >
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                <span>Technician Portal</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Assigned jobs, customer Q&amp;A trail, parts list &amp; multimeter specs.
              </p>
            </div>

            <div 
              onClick={() => handleQuickFill('admin@lg.com')}
              className="p-3.5 rounded-2xl border border-slate-200 hover:border-purple-400 bg-white hover:bg-purple-50/40 cursor-pointer transition-all shadow-2xs group"
            >
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
                <span>Admin Command</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                10-technician city fleet oversight, deflection telemetry &amp; dispatch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
