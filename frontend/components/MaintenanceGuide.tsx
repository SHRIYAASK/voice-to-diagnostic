'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  Wind, 
  Droplets, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  Calendar, 
  Clock, 
  Wrench, 
  Check, 
  Printer, 
  ExternalLink 
} from 'lucide-react';

interface MaintenanceGuideProps {
  onEscalateToBooking: (context: { symptom: string }) => void;
}

export const MaintenanceGuide: React.FC<MaintenanceGuideProps> = ({ onEscalateToBooking }) => {
  const [activeSection, setActiveSection] = useState<'filter' | 'outdoor' | 'drain' | 'schedule'>('filter');
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  const toggleTask = (taskId: string) => {
    setCompletedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-2">
            <Wrench className="w-3.5 h-3.5" />
            <span>Preventive Maintenance Manual</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Appliance Maintenance & Preventive Care Guide
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Proper cleaning preserves energy efficiency by up to 25% and extends compressor lifespan.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-6 pt-6 border-t border-slate-100">
          <button
            onClick={() => setActiveSection('filter')}
            className={`flex items-center gap-2 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-colors ${
              activeSection === 'filter'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Air Filter Cleaning (15 Days)</span>
          </button>

          <button
            onClick={() => setActiveSection('outdoor')}
            className={`flex items-center gap-2 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-colors ${
              activeSection === 'outdoor'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Wind className="w-4 h-4" />
            <span>Outdoor Condenser Care</span>
          </button>

          <button
            onClick={() => setActiveSection('drain')}
            className={`flex items-center gap-2 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-colors ${
              activeSection === 'drain'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Droplets className="w-4 h-4" />
            <span>Drain Hose & Anti-Leak</span>
          </button>

          <button
            onClick={() => setActiveSection('schedule')}
            className={`flex items-center gap-2 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-colors ${
              activeSection === 'schedule'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Maintenance Schedule & Safety</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: FILTER CLEANING */}
      {activeSection === 'filter' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">Crucial Routine</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Air Filter Cleaning Procedure (Every 2 Weeks)
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                User-Safe DIY
              </span>
            </div>

            {/* Critical Warning */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm font-medium">
                <span className="font-bold">Important Safety Rule: </span>
                Always turn off AC power and unplug / trip the MCB before removing the filter.
                Never re-insert a wet filter into the unit, as moisture can cause mold growth or electrical short circuits.
              </div>
            </div>

            {/* Steps Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                  1
                </div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Open Front Panel</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Grasp both side tabs of the front intake grille and gently lift upwards until it clicks into position.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                  2
                </div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Slide Out Filter</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Press the center filter tab slightly upwards to disengage the hook, then slide the mesh filter downwards.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                  3
                </div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Wash with Water</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Use lukewarm water (&lt;40&deg;C) and a soft brush. For grease, use mild neutral detergent. Avoid hot water.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                  4
                </div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Shade Dry & Reinstall</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Dry completely in a well-ventilated shade (away from direct sunlight). Re-insert into original slots and close grille.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: OUTDOOR CONDENSER CARE */}
      {activeSection === 'outdoor' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-[#a50034] uppercase tracking-wider">Heat Dissipation</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Outdoor Unit Clearance & Fin Care
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                Visual Inspection
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                <h4 className="font-bold text-slate-900 text-base mb-2">
                  Clearance Requirements
                </h4>
                <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Rear side:</strong> Keep at least 30 cm (1 foot) clearance from wall.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Front discharge:</strong> Keep at least 70 cm clear of obstructions.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Ensure bird nests, plastic bags, and dry leaves are cleared away.</span>
                  </li>
                </ul>
              </div>

              <div className="border border-slate-200 rounded-xl p-5 bg-amber-50/50 border-amber-200">
                <h4 className="font-bold text-amber-900 text-base mb-2">
                  What NOT To Do
                </h4>
                <ul className="space-y-2 text-xs sm:text-sm text-amber-800">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span><strong>No pressure washers:</strong> High pressure will bend fragile aluminum fins.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span><strong>No harsh chemicals:</strong> Acidic cleaners corrode Gold Fin protection.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Do not attempt to open the electrical casing or service valves.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: DRAIN PIPE */}
      {activeSection === 'drain' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-[#a50034] uppercase tracking-wider">Water Management</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Drain Hose Maintenance & Leak Prevention
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full bg-cyan-100 text-cyan-800 text-xs font-bold">
                Anti-Leak Protocol
              </span>
            </div>

            <div className="space-y-4 text-sm text-slate-700">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Ensure Continuous Downward Slope</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    The drain hose must always slope downwards without any upward kinks, U-traps, or dips that cause water to back up into the indoor tray.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Never Submerge Drain Outlet in Water</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    If the hose drains into a bucket or drain, ensure the tip is above water level. Submerging causes surface tension airlocks that stop water from exiting.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Check for Window Unit Rear Tilt</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    For Window AC model UW-Q18WUZA, the unit frame must be installed with a gentle 1/4&quot; to 1/2&quot; downward tilt toward the outside for proper gravity drainage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: MAINTENANCE SCHEDULE & SAFETY BOUNDARIES */}
      {activeSection === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xs font-bold text-[#a50034] uppercase tracking-wider">Service Protocols</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  User-Safe vs. Authorized Technician Boundaries
                </h3>
              </div>
            </div>

            {/* Checklist comparison table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* User Safe Tasks */}
              <div className="border border-emerald-200 rounded-xl p-5 bg-emerald-50/40">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <h4 className="font-bold text-emerald-900 text-base">User-Safe DIY Maintenance</h4>
                </div>
                <div className="space-y-3">
                  {[
                    { id: 't1', text: 'Cleaning nylon mesh air filter every 15 days' },
                    { id: 't2', text: 'Wiping external cabinet with soft, dry cloth' },
                    { id: 't3', text: 'Replacing remote AAA batteries annually' },
                    { id: 't4', text: 'Visual check of outdoor unit clearance' },
                    { id: 't5', text: 'Ensuring drain hose tip is not submerged' },
                  ].map(task => (
                    <div
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-emerald-200 cursor-pointer hover:bg-emerald-50/80 transition-colors"
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                        completedTasks[task.id] ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
                      }`}>
                        {completedTasks[task.id] && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-slate-800">{task.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technician Only Tasks */}
              <div className="border border-red-200 rounded-xl p-5 bg-red-50/40">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <h4 className="font-bold text-red-900 text-base">Authorized Technician Only (Do Not DIY)</h4>
                </div>
                <div className="space-y-3 text-xs sm:text-sm text-slate-800">
                  {[
                    'Annual deep chemical foam coil wash with wash bag',
                    'Checking operating refrigerant pressures (R32 / R410A)',
                    'Capacitor and Inverter IPM board testing with multimeter',
                    'Compressor winding resistance measurement (U-V-W terminals)',
                    'Disassembling blower fan assembly or motor replacement',
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-red-200">
                      <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      <span className="font-medium text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Need Professional Service CTA */}
            <div className="mt-8 p-6 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-base">Need an Annual Deep Service or Coil Cleaning?</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Request a certified service technician for preventive maintenance and inspection.
                </p>
              </div>
              <button
                onClick={() => onEscalateToBooking({ symptom: 'Routine Maintenance / Annual Deep Service' })}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs sm:text-sm shadow-md transition-colors whitespace-nowrap cursor-pointer"
              >
                Request Maintenance Visit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
