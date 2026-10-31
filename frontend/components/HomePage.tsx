'use client';

import React from 'react';
import { 
  Sparkles, 
  Wrench, 
  Search, 
  ShieldCheck, 
  Calendar, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  Layers, 
  Cpu, 
  Activity,
  UserCheck,
  AlertTriangle
} from 'lucide-react';
import { APPLIANCE_CATEGORIES, ApplianceCategory } from '../lib/appliances';
import { UserProfile } from '../lib/api';

interface HomePageProps {
  currentUser: UserProfile | null;
  onOpenAuth: (role?: 'customer' | 'technician' | 'admin') => void;
  onSelectAppliance: (applianceId: string) => void;
  onNavigateToTab: (tabId: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  currentUser,
  onOpenAuth,
  onSelectAppliance,
  onNavigateToTab,
}) => {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-850 to-slate-900 text-white py-16 sm:py-24 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/15 border border-teal-400/30 text-teal-300 text-xs font-bold uppercase tracking-wider mb-6 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>Multi-Appliance Diagnostic Engine</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-4">
            ApplianceCare AI
          </h1>
          <p className="text-xl sm:text-2xl font-semibold text-teal-300 mb-4">
            Smart Appliance Diagnostics &amp; Troubleshooting
          </p>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto mb-8 leading-relaxed">
            Diagnose smarter. Troubleshoot confidently. Get the right support. An independent intelligent troubleshooting prototype across five core household appliances.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {currentUser ? (
              <button
                onClick={() => onNavigateToTab('diagnostic')}
                className="px-6 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-sm transition-all shadow-lg hover:shadow-teal-900/40 hover:scale-105 cursor-pointer flex items-center gap-2"
              >
                <span>Go to Guided Diagnosis</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => onOpenAuth('customer')}
                  className="px-6 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-sm transition-all shadow-lg hover:shadow-teal-900/40 hover:scale-105 cursor-pointer flex items-center gap-2"
                >
                  <span>Sign In / Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onNavigateToTab('diagnostic')}
                  className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-sm border border-slate-700 transition-all hover:scale-105 cursor-pointer"
                >
                  Explore Diagnostics as Guest
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Five-Appliance Category Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Select Your Appliance Category
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Choose an appliance to load its tailored diagnostic decision trees, model specs, and error codes.
              </p>
            </div>
            <span className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200 self-start sm:self-auto">
              5 Appliances Supported
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {APPLIANCE_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                onClick={() => onSelectAppliance(cat.id)}
                className="group p-5 rounded-2xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 transition-all cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">
                    {cat.icon}
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-base mb-1 group-hover:text-teal-700 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-4">
                    {cat.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-bold text-teal-700">
                  <span>{cat.errorCodes.length} Codes &bull; Models</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Value Props */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Independent Intelligent Troubleshooting Architecture
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Engineered to prioritize safe customer self-resolution while seamlessly escalating hardware faults to certified technicians.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold mb-4">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base mb-2">
              Bilingual Decision Trees
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Step-by-step interactive branching in English and Hindi. Guides users to clean filters, check drains, and resolve common faults safely in under 3 minutes.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold mb-4">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base mb-2">
              Multi-Appliance Error Code Database
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Instantly look up alphanumeric error codes across ACs, Refrigerators, Washing Machines, Microwaves, and Dishwashers with clear severity ratings and parts checklists.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base mb-2">
              High-Voltage Safety Gates
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Strictly halts dangerous customer self-repair on 230V circuits, high-pressure refrigerants, or microwave capacitors, enforcing certified technician dispatch.
            </p>
          </div>
        </div>
      </section>

      {/* Role Navigation Portal CTA Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-8 sm:p-12 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
              Role-Based Workspaces
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 mb-2">
              Ready to Troubleshoot or Manage Service Requests?
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Customers can register for personalized tracking. Technicians and Administrators have dedicated operational dashboards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onOpenAuth('customer')}
              className="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs transition-all shadow-md cursor-pointer"
            >
              Customer Portal
            </button>
            <button
              onClick={() => onOpenAuth('technician')}
              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs border border-slate-700 transition-all cursor-pointer"
            >
              Technician Portal
            </button>
            <button
              onClick={() => onOpenAuth('admin')}
              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs border border-slate-700 transition-all cursor-pointer"
            >
              Admin Command
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
