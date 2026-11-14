'use client';

import React, { useState } from 'react';
import { 
  Home,
  Wrench, 
  Search, 
  ShieldCheck, 
  Calendar, 
  FileSearch, 
  Activity, 
  User, 
  LogOut,
  Cpu,
  ChevronDown,
  Menu,
  X
} from 'lucide-react';
import { UserProfile } from '../lib/api';
import { APPLIANCE_CATEGORIES } from '../lib/appliances';

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
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const currentApplianceObj = APPLIANCE_CATEGORIES.find((a) => a.id === selectedAppliance) || APPLIANCE_CATEGORIES[0];

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'diagnostic', label: 'Guided Diagnosis', icon: Activity },
    { id: 'error-codes', label: 'Error Code Lookup', icon: Search },
    { id: 'maintenance', label: 'Maintenance Guide', icon: Wrench },
    { id: 'book-service', label: 'Request Service', icon: Calendar },
    { id: 'track-ticket', label: 'Track Request', icon: FileSearch },
  ];

  // Role-specific tabs
  if (currentUser?.role === 'technician') {
    navItems.push({ id: 'technician', label: 'Technician Workspace', icon: Wrench });
  } else if (currentUser?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin Command', icon: ShieldCheck });
  }

  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId);
    setIsMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none">
      {/* 1. Header & Branding */}
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div 
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2.5 cursor-pointer group min-w-0"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-sky-600 text-white flex items-center justify-center font-bold text-lg shadow-md group-hover:scale-105 transition-transform shrink-0">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-slate-900 text-[15px] tracking-tight whitespace-nowrap">
                ApplianceCare AI
              </span>
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 whitespace-nowrap shrink-0">
                Smart Triage
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-tight mt-0.5 truncate">
              Smart Diagnostics &amp; Repair
            </p>
          </div>
        </div>

        {/* Mobile close button */}
        <button 
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Appliance Selector Dropdown */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
          Active Appliance
        </label>
        <div className="relative">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs shadow-2xs">
            <span className="text-base shrink-0">{currentApplianceObj.icon}</span>
            <select
              value={selectedAppliance}
              onChange={(e) => setSelectedAppliance(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer text-xs w-full pr-5 appearance-none"
            >
              {APPLIANCE_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-3" />
          </div>
        </div>
      </div>

      {/* 3. Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-teal-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. Auth & User Profile (Bottom of Sidebar) */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        {currentUser ? (
          <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div 
              onClick={() => {
                if (currentUser.role === 'admin') handleNavClick('admin');
                else if (currentUser.role === 'technician') handleNavClick('technician');
                else handleNavClick('diagnostic');
              }}
              className="flex items-center gap-2.5 cursor-pointer min-w-0"
            >
              <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.role === 'admin' ? '🛡️' : currentUser.role === 'technician' ? '🔧' : '👤'}
              </div>
              <div className="min-w-0">
                <div className="text-[9px] uppercase font-bold text-slate-400 leading-tight">
                  {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'technician' ? 'Technician' : 'Customer'}
                </div>
                <div className="font-bold text-xs text-slate-800 truncate">
                  {currentUser.name}
                </div>
              </div>
            </div>

            <button
              id="btn-nav-logout"
              onClick={onLogout}
              className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-400 transition-colors cursor-pointer shrink-0 ml-1"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div>
            <button
              id="btn-sidebar-signin"
              onClick={() => {
                setIsMobileOpen(false);
                onOpenAuthModal('customer');
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span>Sign In / Register</span>
            </button>
            <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-slate-400">
              <button
                id="btn-sidebar-technician"
                onClick={() => {
                  setIsMobileOpen(false);
                  onOpenAuthModal('technician');
                }}
                className="hover:text-teal-700 transition-colors cursor-pointer"
              >
                Technician
              </button>
              <span>&bull;</span>
              <button
                id="btn-sidebar-admin"
                onClick={() => {
                  setIsMobileOpen(false);
                  onOpenAuthModal('admin');
                }}
                className="hover:text-teal-700 transition-colors cursor-pointer"
              >
                Admin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Vertical Sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Top App Bar with Drawer Toggle */}
      <div className="md:hidden shrink-0 h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-30">
        <div 
          onClick={() => setActiveTab('home')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-teal-600 to-sky-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-slate-900 text-sm tracking-tight">ApplianceCare AI</span>
        </div>

        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Slide-out Drawer Overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div 
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
