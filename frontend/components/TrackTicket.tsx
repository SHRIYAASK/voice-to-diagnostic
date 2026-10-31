'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileSearch, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  PhoneCall, 
  Calendar, 
  User, 
  MapPin, 
  Layers,
  Wrench,
  Check,
  ShieldCheck,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { apiClient, TicketExtended, UserProfile } from '../lib/api';

const DEMO_TICKETS = [
  { id: 'AC-SVC-20261010-001', label: 'CH 05 Comm Error (Tech: Anil Kumar - Assigned)' },
  { id: 'AC-SVC-20261010-002', label: 'Water Dripping (Tech: Rajesh Sharma - In Progress)' },
  { id: 'AC-SVC-20261009-088', label: 'CH 38 Refrigerant Leak (Tech: Vikram Malhotra - Resolved)' },
];

interface TrackTicketProps {
  initialTicketId?: string;
  currentUser?: UserProfile | null;
  onNavigateToBooking?: () => void;
}

export const TrackTicket: React.FC<TrackTicketProps> = ({ 
  initialTicketId = '',
  currentUser,
  onNavigateToBooking,
}) => {
  const [ticketId, setTicketId] = useState<string>(initialTicketId || '');
  const [ticketData, setTicketData] = useState<TicketExtended | null>(null);
  const [userTickets, setUserTickets] = useState<TicketExtended[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchTicket = async (idToFetch: string) => {
    if (!idToFetch.trim()) return;

    try {
      setLoading(true);
      setErrorMsg(null);
      setTicketData(null);

      const res = await apiClient.getTicket(idToFetch.trim(), {
        role: currentUser?.role,
        userId: currentUser?.id,
        userEmail: currentUser?.email,
      });

      if (res.ticket) {
        setTicketData(res.ticket);
      } else {
        setErrorMsg('Ticket not found. Please verify the ticket number.');
      }
    } catch (err: any) {
      console.error('Track error:', err);
      setErrorMsg(err.message || 'Ticket not found. Please verify your reference number.');
    } finally {
      setLoading(false);
    }
  };

  // Load role-specific tickets
  useEffect(() => {
    async function loadRoleTickets() {
      if (!currentUser) {
        // Guest mode default ticket
        if (initialTicketId) {
          setTicketId(initialTicketId);
          fetchTicket(initialTicketId);
        } else {
          setTicketId('AC-SVC-20261010-001');
          fetchTicket('AC-SVC-20261010-001');
        }
        return;
      }

      try {
        setLoadingList(true);
        if (currentUser.role === 'customer') {
          const res = await apiClient.getAllTickets({
            role: 'customer',
            customerId: currentUser.id,
            customerEmail: currentUser.email,
          });
          const list = res.tickets || [];
          setUserTickets(list);

          const targetId = initialTicketId || (list.length > 0 ? list[0].ticketId : '');
          if (targetId) {
            setTicketId(targetId);
            fetchTicket(targetId);
          }
        } else if (currentUser.role === 'technician') {
          const res = await apiClient.getAllTickets({
            role: 'technician',
            technicianId: currentUser.id,
          });
          const list = res.tickets || [];
          setUserTickets(list);

          const targetId = initialTicketId || (list.length > 0 ? list[0].ticketId : '');
          if (targetId) {
            setTicketId(targetId);
            fetchTicket(targetId);
          }
        } else if (currentUser.role === 'admin') {
          const res = await apiClient.getAllTickets();
          setUserTickets(res.tickets || []);
          const targetId = initialTicketId || 'AC-SVC-20261011-003';
          setTicketId(targetId);
          fetchTicket(targetId);
        }
      } catch (err) {
        console.error('Failed to load tickets for user:', err);
      } finally {
        setLoadingList(false);
      }
    }

    loadRoleTickets();
  }, [currentUser, initialTicketId]);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTicket(ticketId);
  };

  const handleQuickSelect = (id: string) => {
    setTicketId(id);
    fetchTicket(id);
  };

  // Status Stepper calculation
  const getStepState = (targetStep: string, currentStatus: string) => {
    const steps = ['open', 'assigned', 'in_progress', 'resolved'];
    const currentIdx = steps.indexOf(currentStatus.toLowerCase());
    const targetIdx = steps.indexOf(targetStep.toLowerCase());

    if (currentIdx > targetIdx) return 'completed';
    if (currentIdx === targetIdx) return 'current';
    return 'upcoming';
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 mb-8 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold uppercase tracking-wider mb-2.5">
          <FileSearch className="w-3.5 h-3.5" />
          <span>Real-time Field Service Telemetry</span>
        </div>
        
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {currentUser?.role === 'customer'
            ? 'My Service Requests'
            : currentUser?.role === 'technician'
            ? 'Technician Service Orders'
            : 'Track Service Request'}
        </h2>

        {/* Role Scope Notice */}
        {currentUser && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {currentUser.role === 'customer' && (
              <>
                <User className="w-3.5 h-3.5 text-teal-600" />
                <span>Showing tickets created by: <strong>{currentUser.name}</strong> ({currentUser.email})</span>
              </>
            )}
            {currentUser.role === 'technician' && (
              <>
                <Wrench className="w-3.5 h-3.5 text-teal-600" />
                <span>Showing tickets assigned to: <strong>{currentUser.name}</strong></span>
              </>
            )}
            {currentUser.role === 'admin' && (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>Administrator Mode: Global Fleet Telemetry (All Tickets)</span>
              </>
            )}
          </div>
        )}

        <p className="text-slate-500 text-xs sm:text-sm mt-2 max-w-lg mx-auto">
          {currentUser?.role === 'customer'
            ? 'Inspect real-time dispatch status, assigned certified field technician, and diagnostic notes for your appliances.'
            : 'Enter a service ticket reference to inspect assigned technician status, scheduled slot, and diagnostic findings.'}
        </p>

        {/* Search bar */}
        <form onSubmit={handleTrack} className="max-w-md mx-auto mt-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="e.g. AC-SVC-20261011-003"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition-all font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
          >
            <span>{loading ? 'Searching...' : 'Track'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* 1. CUSTOMER ONLY: Personal Tickets List */}
        {currentUser?.role === 'customer' && (
          <div className="mt-6 pt-5 border-t border-slate-100 text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-600" />
                <span>Your Active Requests ({userTickets.length})</span>
              </span>
              {onNavigateToBooking && (
                <button
                  type="button"
                  onClick={onNavigateToBooking}
                  className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>+ Book New Service</span>
                </button>
              )}
            </div>

            {loadingList ? (
              <p className="text-xs text-slate-400 py-3 text-center">Loading your tickets...</p>
            ) : userTickets.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {userTickets.map((t) => (
                  <div
                    key={t.ticketId}
                    onClick={() => handleQuickSelect(t.ticketId)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      ticketId === t.ticketId
                        ? 'bg-teal-50/80 border-teal-500 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-extrabold text-slate-900">
                        {t.ticketId}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        t.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium truncate mb-2">
                      {t.reportedIssue}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60">
                      <span>Tech: <strong>{t.assignedTechnician?.name || 'Unassigned'}</strong></span>
                      <span>{t.scheduledDate || new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <p className="text-xs text-slate-500 mb-3">
                  No service tickets found under your account (<strong>{currentUser.email}</strong>).
                </p>
                {onNavigateToBooking && (
                  <button
                    type="button"
                    onClick={onNavigateToBooking}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>Request Technician Service</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. TECHNICIAN ONLY: Assigned Tickets List */}
        {currentUser?.role === 'technician' && (
          <div className="mt-6 pt-5 border-t border-slate-100 text-left">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-3">
              Assigned Service Calls for {currentUser.name} ({userTickets.length}):
            </span>
            {userTickets.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {userTickets.map((t) => (
                  <div
                    key={t.ticketId}
                    onClick={() => handleQuickSelect(t.ticketId)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      ticketId === t.ticketId
                        ? 'bg-teal-50 border-teal-500 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-extrabold text-slate-900">{t.ticketId}</span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 truncate">{t.customerName} &bull; {t.reportedIssue}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No active tickets assigned to you currently.</p>
            )}
          </div>
        )}

        {/* 3. ADMIN / GUEST: Demo or System Tickets */}
        {(!currentUser || currentUser.role === 'admin') && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <span className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
              {currentUser?.role === 'admin' ? 'Quick-Select Fleet Tickets:' : 'Quick-Select Active Demo Tickets:'}
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              {(currentUser?.role === 'admin' && userTickets.length > 0 ? userTickets.slice(0, 4).map(t => ({ id: t.ticketId, label: `${t.ticketId} (${t.customerName})` })) : DEMO_TICKETS).map((dt) => (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => handleQuickSelect(dt.id)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    ticketId === dt.id
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {dt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-semibold flex items-center gap-2 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Ticket Result Details */}
      {ticketData && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-8 animate-fade-in">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                Ticket Reference
              </span>
              <h3 className="text-xl sm:text-2xl font-mono font-extrabold text-slate-900 mt-0.5">
                {ticketData.ticketId}
              </h3>
            </div>

            <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${
              ticketData.status === 'resolved'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : ticketData.status === 'in_progress'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-blue-100 text-blue-800 border border-blue-300'
            }`}>
              <CheckCircle2 className="w-4 h-4" />
              <span>Status: {ticketData.status.replace('_', ' ')}</span>
            </div>
          </div>

          {/* 4-Step Visual Progress Stepper */}
          <div className="py-2">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { key: 'open', label: '1. Registered' },
                { key: 'assigned', label: '2. Assigned' },
                { key: 'in_progress', label: '3. In Progress' },
                { key: 'resolved', label: '4. Resolved' },
              ].map((step, idx) => {
                const state = getStepState(step.key, ticketData.status);
                return (
                  <div key={step.key} className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 transition-all ${
                      state === 'completed'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : state === 'current'
                        ? 'bg-teal-600 text-white ring-4 ring-teal-100 shadow-xs'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}>
                      {state === 'completed' ? <Check className="w-4 h-4" /> : idx + 1}
                    </div>
                    <span className={`text-[11px] font-bold ${
                      state === 'current' ? 'text-teal-700' : state === 'completed' ? 'text-emerald-700' : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assigned Technician Card */}
          {ticketData.assignedTechnician && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-700 shadow-lg">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-bold text-xl shrink-0 shadow-md">
                  🔧
                </div>
                <div>
                  <div className="text-[11px] uppercase font-bold text-teal-400 tracking-wider">
                    Assigned ApplianceCare AI Field Technician
                  </div>
                  <div className="text-lg font-extrabold text-white">
                    {ticketData.assignedTechnician.name}
                  </div>
                  <div className="text-xs text-slate-300 font-mono">
                    ID: {ticketData.assignedTechnician.id}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                <div className="bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Scheduled Date</div>
                  <div className="text-white font-bold">{ticketData.scheduledDate || 'Today'}</div>
                </div>
                <div className="bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Time Window</div>
                  <div className="text-white font-bold">{ticketData.scheduledSlot || 'Standard Slot'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Ticket Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Customer & Appliance Details */}
            <div className="space-y-4 text-xs">
              <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-xs border-b border-slate-100 pb-2">
                Customer &amp; Location
              </h4>
              <div className="flex items-start gap-2.5">
                <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500 font-medium">Customer Name: </span>
                  <span className="font-bold text-slate-900">{ticketData.customerName}</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500 font-medium">Service Address: </span>
                  <span className="font-bold text-slate-900">{ticketData.serviceAddress}</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Layers className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500 font-medium">Appliance Model: </span>
                  <span className="font-bold text-slate-900">{ticketData.acModel}</span>
                  {ticketData.serialNumber && (
                    <span className="text-slate-500 ml-1">({ticketData.serialNumber})</span>
                  )}
                </div>
              </div>
            </div>

            {/* Diagnostic Findings */}
            <div className="space-y-4 text-xs">
              <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-xs border-b border-slate-100 pb-2">
                Pre-Diagnostic Telemetry
              </h4>
              <div>
                <span className="text-slate-500 font-medium">Reported Issue: </span>
                <span className="font-bold text-slate-900 block mt-0.5">{ticketData.reportedIssue}</span>
              </div>
              {ticketData.errorCode && (
                <div>
                  <span className="text-slate-500 font-medium">Error Code: </span>
                  <span className="inline-block px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-extrabold font-mono ml-1 border border-teal-200">
                    {ticketData.errorCode}
                  </span>
                </div>
              )}
              {ticketData.diagnosticSummary && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 font-medium block text-[11px] mb-1">
                    Probable Cause &amp; Technical Summary:
                  </span>
                  <p className="text-slate-800 font-semibold leading-relaxed">
                    {ticketData.diagnosticSummary}
                  </p>
                </div>
              )}
              {ticketData.technicianNotes && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-amber-700 font-medium block text-[11px] mb-1">
                    Field Notes from Technician:
                  </span>
                  <p className="text-amber-900 font-semibold">
                    {ticketData.technicianNotes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer Callout */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span>Need to update appointment details or add diagnostic notes?</span>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-extrabold rounded-xl text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Status Verified Online</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
