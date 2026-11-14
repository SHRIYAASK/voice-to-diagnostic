'use client';

import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { HomePage } from '../components/HomePage';
import { AuthModal } from '../components/AuthModal';
import { DiagnosticEngine } from '../components/DiagnosticEngine';
import { ErrorCodeLookup } from '../components/ErrorCodeLookup';
import { MaintenanceGuide } from '../components/MaintenanceGuide';
import { WarrantyChecker } from '../components/WarrantyChecker';
import { ServiceBooking, BookingContext } from '../components/ServiceBooking';
import { TrackTicket } from '../components/TrackTicket';
import { TechnicianPortal } from '../components/TechnicianPortal';
import { AdminDashboard } from '../components/AdminDashboard';
import { UserProfile } from '../lib/api';
import { APPLIANCE_CATEGORIES } from '../lib/appliances';
import { 
  ShieldCheck, 
  Wrench, 
  Search, 
  Calendar, 
  FileSearch, 
  Sparkles, 
  Lock, 
  UserCheck,
  CheckCircle2,
  Cpu,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function Home() {
  const [requestedTab, setActiveTab] = useState<string>('home');
  const [selectedAppliance, setSelectedAppliance] = useState<string>('air-conditioner');
  const [selectedModel, setSelectedModel] = useState<string>('UW-Q18WUZA');
  const [bookingContext, setBookingContext] = useState<BookingContext>({});
  const [prefilledErrorCode, setPrefilledErrorCode] = useState<string>('');
  const [lastCreatedTicketId, setLastCreatedTicketId] = useState<string>('');

  // Authentication State (Customer, Technician, Admin)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  // The chat/voice diagnosis page is only available after login; guests always see the Home page instead
  const activeTab = requestedTab === 'diagnostic' && !currentUser ? 'home' : requestedTab;

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authInitialRole, setAuthInitialRole] = useState<'customer' | 'technician' | 'admin'>('customer');

  const handleOpenAuth = (role: 'customer' | 'technician' | 'admin' = 'customer') => {
    setAuthInitialRole(role);
    setIsAuthModalOpen(true);
  };

  const handleSelectAppliance = (applianceId: string) => {
    setSelectedAppliance(applianceId);
    const cat = APPLIANCE_CATEGORIES.find((c) => c.id === applianceId);
    if (cat && cat.models.length > 0) {
      setSelectedModel(cat.models[0].name);
    }
  };

  // Escalation callback from DiagnosticEngine, ErrorCodeLookup, WarrantyChecker, MaintenanceGuide
  const handleEscalateToBooking = (context: BookingContext) => {
    setBookingContext(context);
    setActiveTab('book-service');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTicketCreated = (ticketId: string) => {
    setLastCreatedTicketId(ticketId);
  };

  // Route to corresponding dashboard immediately upon login
  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);

    if (user.role === 'technician') {
      setActiveTab('technician');
    } else if (user.role === 'admin') {
      setActiveTab('admin');
    } else {
      setActiveTab('diagnostic');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`min-h-screen ${activeTab === 'diagnostic' ? 'h-dvh overflow-hidden' : ''} flex md:flex-row flex-col bg-paper text-ink antialiased selection:bg-accent selection:text-white pb-16 md:pb-0`}>
      {/* Universal Sidebar Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedAppliance={selectedAppliance}
        setSelectedAppliance={handleSelectAppliance}
        currentUser={currentUser}
        onOpenAuthModal={handleOpenAuth}
        onLogout={handleLogout}
      />

      {/* Main Content & Views Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
        {/* Main View Router */}
        <main className={`flex-1 flex flex-col min-h-0 ${activeTab === 'diagnostic' ? 'overflow-hidden' : 'overflow-y-auto pb-16'}`}>
        {/* TAB 1: HOME PAGE */}
        {activeTab === 'home' && (
          <HomePage
            currentUser={currentUser}
            onOpenAuth={handleOpenAuth}
            onSelectAppliance={(id) => {
              handleSelectAppliance(id);
              if (currentUser) setActiveTab('diagnostic');
              else handleOpenAuth('customer');
            }}
            onNavigateToTab={(tabId) => {
              setActiveTab(tabId);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* TAB 2: GUIDED DIAGNOSIS */}
        {activeTab === 'diagnostic' && (
          <DiagnosticEngine
            onEscalateToBooking={handleEscalateToBooking}
            onTicketCreated={handleTicketCreated}
            selectedModel={selectedModel}
            selectedAppliance={selectedAppliance}
            currentUser={currentUser}
          />
        )}

        {/* TAB 3: ERROR CODE LOOKUP */}
        {activeTab === 'error-codes' && (
          <ErrorCodeLookup
            onEscalateToBooking={handleEscalateToBooking}
            initialCode={prefilledErrorCode}
            selectedAppliance={selectedAppliance}
          />
        )}

        {/* TAB 4: PREVENTIVE MAINTENANCE */}
        {activeTab === 'maintenance' && (
          <MaintenanceGuide
            onEscalateToBooking={handleEscalateToBooking}
          />
        )}

        {/* TAB 5: WARRANTY CHECKER */}
        {activeTab === 'warranty' && (
          <WarrantyChecker
            onEscalateToBooking={handleEscalateToBooking}
            selectedModel={selectedModel}
          />
        )}

        {/* TAB 6: REQUEST SERVICE */}
        {activeTab === 'book-service' && (
          <ServiceBooking
            bookingContext={bookingContext}
            selectedModel={selectedModel}
            onTicketCreated={handleTicketCreated}
            currentUser={currentUser}
            onUpdateUser={setCurrentUser}
          />
        )}

        {/* TAB 7: TRACK REQUEST */}
        {activeTab === 'track-ticket' && (
          <TrackTicket
            initialTicketId={lastCreatedTicketId}
            currentUser={currentUser}
            onNavigateToBooking={() => setActiveTab('book-service')}
          />
        )}

        {/* TAB 8: TECHNICIAN WORKSPACE */}
        {activeTab === 'technician' && (
          <div>
            {currentUser?.role === 'technician' ? (
              <TechnicianPortal currentUser={currentUser} />
            ) : (
              <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Wrench className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                  Field Technician Portal Authentication Required
                </h2>
                <p className="text-slate-600 text-sm max-w-md mx-auto mb-6">
                  This workspace is restricted to certified ApplianceCare AI service personnel. Technician accounts are provisioned exclusively by Service Administrators.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => handleOpenAuth('technician')}
                    className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Log In to Technician Portal</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('home')}
                    className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
                  >
                    Return to Home
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 9: OPERATIONS ADMIN COMMAND */}
        {activeTab === 'admin' && (
          <div>
            {currentUser?.role === 'admin' ? (
              <AdminDashboard />
            ) : (
              <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                  Service Operations Admin Authorization Required
                </h2>
                <p className="text-slate-600 text-sm max-w-md mx-auto mb-6">
                  Access to technician fleet provisioning, telemetry KPIs, and the national ticket dispatch roster requires Administrator credentials.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => handleOpenAuth('admin')}
                    className="px-6 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Log In with Admin Account</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('home')}
                    className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
                  >
                    Return to Home
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Role-based Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialRole={authInitialRole}
      />

      </div>
    </div>
  );
}
