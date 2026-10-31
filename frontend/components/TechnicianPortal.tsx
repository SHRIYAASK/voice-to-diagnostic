'use client';

import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  User, 
  Phone, 
  MapPin, 
  Layers, 
  Zap, 
  Cpu, 
  FileText, 
  RefreshCw, 
  Check, 
  SlidersHorizontal,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { apiClient, TicketExtended, TechnicianRecord, UserProfile } from '../lib/api';

interface TechnicianPortalProps {
  currentUser?: UserProfile;
}

export const TechnicianPortal: React.FC<TechnicianPortalProps> = ({ currentUser }) => {
  const [technicians, setTechnicians] = useState<TechnicianRecord[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>(
    currentUser?.role === 'technician' && currentUser.id ? currentUser.id : 'tech-001'
  );

  // Sync when logged in user changes
  useEffect(() => {
    if (currentUser?.role === 'technician' && currentUser.id) {
      setSelectedTechId(currentUser.id);
    }
  }, [currentUser]);
  const [tickets, setTickets] = useState<TicketExtended[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'specs'>('tickets');
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [techNotes, setTechNotes] = useState<Record<string, string>>({});

  // Load 10 technicians list
  useEffect(() => {
    async function loadTechs() {
      try {
        const res = await apiClient.getTechnicians();
        setTechnicians(res.technicians || []);
      } catch (err) {
        console.error('Error loading technicians:', err);
      }
    }
    loadTechs();
  }, []);

  // Load tickets for selected technician
  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getAllTickets({ 
        technicianId: selectedTechId,
        role: currentUser?.role,
      });
      setTickets(res.tickets || []);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [selectedTechId]);

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    try {
      setStatusUpdating(ticketId);
      const notes = techNotes[ticketId];
      await apiClient.updateTicketStatus(ticketId, newStatus, notes);
      await fetchTickets();
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setStatusUpdating(null);
    }
  };

  const currentTech = technicians.find((t) => t.id === selectedTechId) || ({
    id: currentUser?.id || selectedTechId,
    name: currentUser?.name || 'Technician',
    specialization: currentUser?.specialization || 'Appliance Diagnostics Specialist',
    employeeCode: currentUser?.employeeCode || 'AC-EMP-9101',
    rating: 4.9,
  } as TechnicianRecord);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8">
      {/* Technician Profile Card */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 mb-8 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-bold uppercase tracking-wider">
              ApplianceCare Certified Field Service
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-xs font-bold">
              Active Shift
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {currentTech?.name || 'Technician Workspace'}
          </h2>
          <p className="text-slate-300 text-sm mt-1">
            {currentTech?.specialization} &bull; Emp Code: <strong className="text-white font-mono">{currentTech?.employeeCode}</strong> &bull; Rating: <strong className="text-amber-400">&starf; {currentTech?.rating}</strong>
          </p>
        </div>

        {/* Technician Selector Dropdown (Admin Only) */}
        {currentUser?.role === 'admin' && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs w-full sm:w-auto">
            <label className="block text-slate-400 font-bold mb-1">Admin Fleet Switcher ({technicians.length} Fleet):</label>
            <select
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
              className="w-full bg-slate-900 text-white font-semibold px-3 py-2 rounded-lg border border-slate-700 focus:outline-hidden"
            >
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.employeeCode}) - {t.specialization}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* View Tabs */}
      <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'tickets'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Assigned Tickets ({tickets.length})
          </button>
          <button
            onClick={() => setActiveTab('specs')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
              activeTab === 'specs'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Electrical Specs &amp; Multimeter Guide
          </button>
        </div>

        <button
          onClick={fetchTickets}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* TAB 1: TICKETS VIEW */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          {tickets.length > 0 ? (
            tickets.map((t) => (
              <div
                key={t.ticketId}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-base text-slate-900">
                        {t.ticketId}
                      </span>
                      {t.errorCode && (
                        <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                          {t.errorCode}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 font-medium">
                      Reported: {t.reportedIssue}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span
                      className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
                        t.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Customer & Appointment Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold">{t.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <a href={`tel:${t.contactNumber}`} className="text-blue-600 hover:underline font-semibold">
                        {t.contactNumber}
                      </a>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{t.serviceAddress}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      <span><strong>Slot:</strong> {t.scheduledDate || 'Today'} ({t.scheduledSlot || 'Morning'})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span><strong>Model:</strong> {t.acModel}</span>
                    </div>
                  </div>
                </div>

                {/* Diagnostic Findings */}
                {t.diagnosticSummary && (
                  <div className="mb-4 p-3 bg-teal-50/40 border border-teal-100 rounded-xl text-xs text-slate-700">
                    <span className="font-bold text-teal-800">Preliminary Diagnostic Finding: </span>
                    <span>{t.diagnosticSummary}</span>
                  </div>
                )}

                {/* Status Update & Technician Notes */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-auto flex-1">
                    <input
                      type="text"
                      placeholder="Add technician field note (e.g. replaced thermistor, tested 24V)..."
                      value={techNotes[t.ticketId] || t.technicianNotes || ''}
                      onChange={(e) => setTechNotes({ ...techNotes, [t.ticketId]: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:border-teal-600"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {t.status !== 'in_progress' && t.status !== 'resolved' && (
                      <button
                        disabled={statusUpdating === t.ticketId}
                        onClick={() => handleUpdateStatus(t.ticketId, 'in_progress')}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
                      >
                        Start Work
                      </button>
                    )}

                    {t.status !== 'resolved' && (
                      <button
                        disabled={statusUpdating === t.ticketId}
                        onClick={() => handleUpdateStatus(t.ticketId, 'resolved')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
                      >
                        Mark Completed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
              <Wrench className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <h3 className="font-bold text-slate-800 text-base">No Tickets Currently Assigned</h3>
              <p className="text-xs text-slate-500 mt-1">
                Technician {currentTech?.name} is available for new assignments from the smart dispatcher.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ELECTRICAL SPECS REFERENCE */}
      {activeTab === 'specs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">Field Service Manual Reference</span>
            <h3 className="text-xl font-bold text-slate-900">
              Model UW-Q18WUZA & Dual Inverter Electrical Reference Specifications
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Verify multimeter calibration before probing live boards. Always discharge 380V DC filter capacitors before resistance measurements.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px]">
                <tr>
                  <th className="p-3 rounded-l-lg">Component / Measurement</th>
                  <th className="p-3">Reference Nominal Value</th>
                  <th className="p-3">Allowable Tolerance</th>
                  <th className="p-3 rounded-r-lg">Technician Test Procedure</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-700">
                <tr>
                  <td className="p-3 font-bold text-slate-900">Indoor Room Thermistor (RT)</td>
                  <td className="p-3 font-mono font-bold text-teal-700">10.0 k&Omega; @ 25&deg;C</td>
                  <td className="p-3">&plusmn; 5%</td>
                  <td className="p-3">Disconnect CN-TH. Measure pin-to-pin. Resistance decreases as temp rises (NTC).</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">Indoor Coil Pipe Thermistor (IPT)</td>
                  <td className="p-3 font-mono font-bold text-teal-700">5.0 k&Omega; @ 25&deg;C</td>
                  <td className="p-3">&plusmn; 5%</td>
                  <td className="p-3">Disconnect CN-TH. Detects coil frosting / defrosting boundary.</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">Compressor Inverter Motor Windings</td>
                  <td className="p-3 font-mono font-bold text-teal-700">1.2 &Omega; &ndash; 2.5 &Omega; (Balanced)</td>
                  <td className="p-3">U-V = V-W = W-U (&plusmn;0.1&Omega;)</td>
                  <td className="p-3">Disconnect 3-pin compressor plug. Measure U-V, V-W, W-U. Must be equal. Check ground &gt;50M&Omega;.</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">DC Link Bus Voltage (IPM)</td>
                  <td className="p-3 font-mono font-bold text-teal-700">310V &ndash; 380V DC</td>
                  <td className="p-3">&gt; 280V DC under load</td>
                  <td className="p-3">Measure across main electrolytic capacitor terminals P (+) and N (-). Watch for high voltage.</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">Communication Signal (CH 05)</td>
                  <td className="p-3 font-mono font-bold text-teal-700">0V &ndash; 24V DC (Pulsing)</td>
                  <td className="p-3">Rapid fluctuation</td>
                  <td className="p-3">Measure DC volts between Neutral (terminal 2) and Comm Wire (terminal 3). Constant 0V or 24V = open wire.</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">Main Power Board Ceramic Fuse</td>
                  <td className="p-3 font-mono font-bold text-teal-700">250V / 3.15A (Indoor) & 20A (Outdoor)</td>
                  <td className="p-3">0 &Omega; (Continuity)</td>
                  <td className="p-3">Audible beep continuity test with power isolated. If blown, inspect varistor & bridge rectifier.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
