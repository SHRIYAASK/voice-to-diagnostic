'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Wrench, 
  Calendar, 
  RefreshCw, 
  Filter, 
  ShieldCheck, 
  TrendingUp,
  Award,
  UserPlus,
  Mail,
  KeyRound,
  Phone,
  ArrowRight,
  Check
} from 'lucide-react';
import { apiClient, TicketExtended, TechnicianRecord } from '../lib/api';

export const AdminDashboard: React.FC = () => {
  const [tickets, setTickets] = useState<TicketExtended[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Technician Creation Form State (Admin Only)
  const [techName, setTechName] = useState<string>('');
  const [techEmail, setTechEmail] = useState<string>('');
  const [techPassword, setTechPassword] = useState<string>('password123');
  const [techSpecialization, setTechSpecialization] = useState<string>('Refrigerator & Cooling Systems Lead');
  const [techPhone, setTechPhone] = useState<string>('+91 98110 55000');
  const [creatingTech, setCreatingTech] = useState<boolean>(false);
  const [techSuccessMsg, setTechSuccessMsg] = useState<string | null>(null);
  const [techErrorMsg, setTechErrorMsg] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tRes, techRes] = await Promise.all([
        apiClient.getAllTickets(),
        apiClient.getTechnicians(),
      ]);
      setTickets(tRes.tickets || []);
      setTechnicians(techRes.technicians || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    setTechErrorMsg(null);
    setTechSuccessMsg(null);

    if (!techName.trim() || !techEmail.trim() || !techSpecialization.trim()) {
      setTechErrorMsg('Please fill in technician name, email, and specialization.');
      return;
    }

    try {
      setCreatingTech(true);
      const res = await apiClient.createTechnician({
        name: techName.trim(),
        email: techEmail.trim(),
        password: techPassword.trim() || 'password123',
        specialization: techSpecialization.trim(),
        phone: techPhone.trim() || undefined,
      });

      if (res.success) {
        setTechSuccessMsg(
          `Technician ${techName} provisioned successfully! They can now log in using email: ${techEmail}`
        );
        setTechName('');
        setTechEmail('');
        // Refresh fleet roster immediately
        await fetchData();
      } else {
        setTechErrorMsg(res.message || 'Failed to create technician');
      }
    } catch (err: any) {
      console.error('Create tech error:', err);
      setTechErrorMsg(err.message || 'Failed to provision technician');
    } finally {
      setCreatingTech(false);
    }
  };

  const totalTickets = tickets.length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const assignedCount = tickets.filter((t) => t.status === 'assigned' || t.status === 'open').length;

  const filteredTickets = filterStatus === 'ALL'
    ? tickets
    : tickets.filter((t) => t.status === filterStatus);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 mb-8 border border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-bold uppercase tracking-wider">
              Service Operations Command Center
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-sky-900/60 text-sky-300 text-xs font-bold">
              Fleet of {technicians.length} Technicians
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            ApplianceCare AI &bull; Fleet &amp; Dispatch Oversight
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Real-time deflection telemetry, technician roster management, and field ticket dispatch control.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Fleet Data</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Self-Service Deflection</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">68.4%</div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">
            &uarr; Exceeds target goal of &gt;= 60%
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Field Tickets</span>
            <Activity className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{totalTickets}</div>
          <p className="text-[11px] text-slate-500 mt-1">
            Recorded through diagnostic portal
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Active Technicians</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{technicians.length} / {technicians.length}</div>
          <p className="text-[11px] text-sky-600 font-semibold mt-1">
            100% City Fleet Available
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Resolved Jobs</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">{resolvedCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">
            {inProgressCount} in progress &bull; {assignedCount} assigned
          </p>
        </div>
      </div>

      {/* CREATE NEW TECHNICIAN FORM (ADMIN-ONLY FEATURE) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-4 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold uppercase tracking-wider mb-1">
              <UserPlus className="w-3.5 h-3.5 text-teal-600" />
              <span>Admin Authority Only</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Provision New Field Service Technician
            </h3>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Technicians can only be created by the Admin. Created technicians can immediately sign in to their dedicated portal.
            </p>
          </div>
        </div>

        {techSuccessMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 mb-5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{techSuccessMsg}</span>
          </div>
        )}

        {techErrorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold mb-5">
            {techErrorMsg}
          </div>
        )}

        <form onSubmit={handleCreateTechnician} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Technician Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Anand Vardhan"
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Login Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="e.g. anand@appliancecare.ai"
              value={techEmail}
              onChange={(e) => setTechEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Initial Password *
            </label>
            <input
              type="password"
              required
              placeholder="e.g. password123"
              value={techPassword}
              onChange={(e) => setTechPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Primary Appliance Specialization *
            </label>
            <select
              value={techSpecialization}
              onChange={(e) => setTechSpecialization(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 bg-white"
            >
              <option value="Inverter Compressor & Sealed System Specialist">Inverter AC & Sealed System Specialist</option>
              <option value="Refrigerator Defrost & Cooling Systems Lead">Refrigerator Defrost & Cooling Systems Lead</option>
              <option value="Washing Machine Direct Drive Motor Specialist">Washing Machine Direct Drive Motor Specialist</option>
              <option value="Microwave High-Voltage Magnetron Lead">Microwave High-Voltage Magnetron Lead</option>
              <option value="Dishwasher Sump & Aqua-Stop Leak Specialist">Dishwasher Sump & Aqua-Stop Leak Specialist</option>
              <option value="Multi-Appliance Electronic Control Boards">Multi-Appliance Electronic Control Boards</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Contact Phone Number
            </label>
            <input
              type="tel"
              placeholder="+91 98110 55000"
              value={techPhone}
              onChange={(e) => setTechPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-100"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={creatingTech}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{creatingTech ? 'Provisioning...' : 'Provision Technician'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* TECHNICIANS WORKLOAD ROSTER */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 mb-8">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-teal-600" />
            <span>Active Technician Roster ({technicians.length} Certified Engineers)</span>
          </h3>
          <span className="text-xs font-bold text-slate-400">Live Workload Distribution</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {technicians.map((t) => (
            <div
              key={t.id}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between hover:border-teal-400 hover:bg-teal-50/20 transition-all shadow-2xs"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] font-bold text-slate-500 px-2 py-0.5 rounded bg-slate-200">{t.employeeCode}</span>
                  <span className="text-xs font-bold text-amber-600">&starf; {t.rating}</span>
                </div>
                <h4 className="font-extrabold text-slate-900 text-xs">{t.name}</h4>
                <p className="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">{t.specialization}</p>
              </div>

              <div className="mt-3.5 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">Active Jobs:</span>
                <span className="font-extrabold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {t.activeTickets}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DISPATCH TICKETS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Field Service Dispatch Queue
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">
              Real-time customer service tickets and assigned technician telemetry.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Filter:</span>
            {['ALL', 'assigned', 'in_progress', 'resolved'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  filterStatus === s
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[11px] border-b border-slate-200">
              <tr>
                <th className="p-3">Ticket Reference</th>
                <th className="p-3">Customer &amp; Phone</th>
                <th className="p-3">Appliance Model</th>
                <th className="p-3">Assigned Technician</th>
                <th className="p-3">Appointment Slot</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTickets.map((t) => (
                <tr key={t.ticketId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-mono font-bold text-slate-900">{t.ticketId}</td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{t.customerName}</div>
                    <div className="text-[11px] text-slate-500">{t.contactNumber}</div>
                  </td>
                  <td className="p-3 font-medium text-slate-800">{t.acModel}</td>
                  <td className="p-3">
                    <span className="font-bold text-teal-800">
                      {t.assignedTechnician?.name || 'Unassigned'}
                    </span>
                  </td>
                  <td className="p-3 font-medium">
                    {t.scheduledDate || 'Today'} &bull; {t.scheduledSlot || 'Standard'}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase ${
                        t.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.status === 'in_progress'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No tickets found matching the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
