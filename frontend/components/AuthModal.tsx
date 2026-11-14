'use client';

import React, { useState } from 'react';
import { 
  X, 
  User, 
  Wrench, 
  ShieldCheck, 
  Lock, 
  Mail, 
  CheckCircle2, 
  ArrowRight, 
  KeyRound, 
  Phone,
  MapPin,
  Sparkles,
  Info
} from 'lucide-react';
import { apiClient, UserProfile } from '../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
  initialRole?: 'customer' | 'technician' | 'admin';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialRole = 'customer',
}) => {
  const [selectedRole, setSelectedRole] = useState<'customer' | 'technician' | 'admin'>(initialRole);
  const [isSignUp, setIsSignUp] = useState<boolean>(false);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('customer@appliancecare.ai');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('New Delhi');
  const [pincode, setPincode] = useState<string>('');
  const [password, setPassword] = useState<string>('password123');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRoleChange = (role: 'customer' | 'technician' | 'admin') => {
    setSelectedRole(role);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (role === 'admin') {
      setIsSignUp(false);
      setEmail('admin@appliancecare.ai');
      setPassword('admin123');
    } else if (role === 'technician') {
      setIsSignUp(false);
      setEmail('tech2@appliancecare.ai');
      setPassword('password123');
    } else {
      setEmail('customer@appliancecare.ai');
      setPassword('password123');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      setLoading(true);

      if (selectedRole === 'customer' && isSignUp) {
        // Customer Registration
        if (!name.trim()) {
          setErrorMsg('Please enter your full name.');
          setLoading(false);
          return;
        }
        if (!phone.trim()) {
          setErrorMsg('Please enter your contact mobile number.');
          setLoading(false);
          return;
        }
        if (!address.trim()) {
          setErrorMsg('Please enter your service address.');
          setLoading(false);
          return;
        }
        if (!pincode.trim()) {
          setErrorMsg('Please enter your PIN code.');
          setLoading(false);
          return;
        }

        const res = await apiClient.register({
          name: name.trim(),
          email: email.trim(),
          password: password,
          phone: phone.trim(),
          address: address.trim(),
          city: city.trim() || 'New Delhi',
          pincode: pincode.trim(),
        });

        if (res.success && res.user) {
          setSuccessMsg(`Account created! Welcome, ${res.user.name}. Your details will auto-fill technician bookings.`);
          setTimeout(() => {
            onLoginSuccess(res.user);
            onClose();
          }, 600);
        }
      } else {
        // Sign In (Customer, Technician, or Admin)
        const res = await apiClient.login({
          email: email.trim(),
          password: password,
          role: selectedRole,
        });

        if (res.success && res.user) {
          setSuccessMsg(`Signed in successfully as ${res.user.role.toUpperCase()}: ${res.user.name}`);
          setTimeout(() => {
            onLoginSuccess(res.user);
            onClose();
          }, 500);
        } else {
          setErrorMsg('Authentication failed. Please verify credentials.');
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (fillEmail: string, fillPwd: string) => {
    setEmail(fillEmail);
    setPassword(fillPwd);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white p-6 sm:p-7 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-[11px] font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3 h-3 text-teal-400" />
            <span>ApplianceCare AI Access</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {selectedRole === 'customer'
              ? isSignUp ? 'Create Customer Account' : 'Customer Sign In'
              : selectedRole === 'technician'
              ? 'Technician Workspace Access'
              : 'Admin Command Login'}
          </h3>
          <p className="text-slate-300 text-xs sm:text-sm mt-1">
            {selectedRole === 'customer'
              ? 'Access guided diagnostics, error lookups, and service tracking.'
              : selectedRole === 'technician'
              ? 'Sign in to review assigned job cards, multimeter specs, and updates.'
              : 'Manage service requests, 10-tech fleet dispatch, and system KPIs.'}
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50/60 p-2 gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => handleRoleChange('customer')}
            className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              selectedRole === 'customer'
                ? 'bg-white text-teal-700 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Customer</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleChange('technician')}
            className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              selectedRole === 'technician'
                ? 'bg-white text-teal-700 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Technician</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleChange('admin')}
            className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              selectedRole === 'admin'
                ? 'bg-white text-teal-700 shadow-xs border border-slate-200 font-extrabold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>

        <div className="p-6 sm:p-7 space-y-5">
          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Customer Sign In / Sign Up Mode Switcher */}
          {selectedRole === 'customer' && (
            <div className="flex items-center justify-between bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setErrorMsg(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  !isSignUp ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setErrorMsg(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  isSignUp ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'hover:text-slate-900'
                }`}
              >
                Sign Up (New Account)
              </button>
            </div>
          )}

          {/* Technician Notice: Created by Admin Only */}
          {selectedRole === 'technician' && (
            <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Technician Account Notice:</strong> Field technician accounts are created exclusively by the Administrator. If you are newly appointed, contact your service supervisor.
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {selectedRole === 'customer' && isSignUp && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {selectedRole === 'admin' ? 'Admin Username / Email *' : 'Email Address *'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={selectedRole === 'admin' ? 'text' : 'email'}
                  required
                  placeholder={
                    selectedRole === 'admin'
                      ? 'admin@appliancecare.ai or admin'
                      : selectedRole === 'technician'
                      ? 'tech2@appliancecare.ai'
                      : 'customer@appliancecare.ai'
                  }
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
                />
              </div>
            </div>

            {selectedRole === 'customer' && isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contact Mobile Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Service Address (Street / Area) *
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. B-42, Mayur Vihar Phase 1"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="New Delhi"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      PIN Code *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="110091"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-teal-700 font-medium bg-teal-50 border border-teal-200/80 rounded-lg p-2 leading-relaxed">
                  💡 These details will automatically auto-fill your technician booking certificate so you don't need to retype them.
                </p>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Password *
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
                />
              </div>
            </div>

            {/* Quick Demo Pre-Fill Badges */}
            <div className="pt-1">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Quick Test Credentials:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedRole === 'customer' && (
                  <button
                    type="button"
                    onClick={() => setDemoCredentials('customer@appliancecare.ai', 'password123')}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors cursor-pointer"
                  >
                    👤 customer@appliancecare.ai (password123)
                  </button>
                )}
                {selectedRole === 'technician' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDemoCredentials('tech2@appliancecare.ai', 'password123')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors cursor-pointer"
                    >
                      🔧 tech2@appliancecare.ai (Anil Kumar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoCredentials('tech1@appliancecare.ai', 'password123')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                    >
                      🔧 tech1@appliancecare.ai (Vikram)
                    </button>
                  </>
                )}
                {selectedRole === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setDemoCredentials('admin@appliancecare.ai', 'admin123')}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors cursor-pointer"
                  >
                    🛡️ admin@appliancecare.ai (admin123)
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-sm rounded-xl shadow-md transition-all hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-3"
            >
              <span>
                {loading
                  ? 'Verifying...'
                  : selectedRole === 'customer' && isSignUp
                  ? 'Complete Customer Registration'
                  : `Sign In to ${selectedRole === 'admin' ? 'Admin Dashboard' : selectedRole === 'technician' ? 'Technician Portal' : 'Customer Workspace'}`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
