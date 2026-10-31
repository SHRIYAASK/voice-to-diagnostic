'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  AlertTriangle, 
  ShieldAlert, 
  Wrench, 
  Calendar, 
  CheckCircle, 
  Info, 
  X, 
  Layers, 
  Cpu, 
  Sparkles,
  ArrowRight,
  Activity
} from 'lucide-react';
import { apiClient, ErrorCode } from '../lib/api';
import { APPLIANCE_CATEGORIES, getApplianceById } from '../lib/appliances';

interface ErrorCodeLookupProps {
  onEscalateToBooking: (context: {
    symptom: string;
    error_code: string;
    probable_cause?: string;
    parts?: string[];
    priority?: string;
  }) => void;
  initialCode?: string;
  selectedAppliance?: string;
  onNavigateToDiagnostic?: () => void;
}

export const ErrorCodeLookup: React.FC<ErrorCodeLookupProps> = ({
  onEscalateToBooking,
  initialCode = '',
  selectedAppliance = 'air-conditioner',
  onNavigateToDiagnostic,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialCode);
  const [allCodes, setAllCodes] = useState<ErrorCode[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<ErrorCode[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCode, setSelectedCode] = useState<ErrorCode | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentAppliance = getApplianceById(selectedAppliance);

  // Load error codes based on selected appliance
  useEffect(() => {
    async function loadCodes() {
      try {
        setLoading(true);
        setErrorMsg(null);
        setSelectedCode(null);

        if (selectedAppliance === 'air-conditioner') {
          // Fetch AC error codes from API
          const data = await apiClient.getAllCodes();
          setAllCodes(data.codes || []);
          setFilteredCodes(data.codes || []);

          if (initialCode) {
            const match = (data.codes || []).find(
              c => c.code.toLowerCase().replace(/\s+/g, '') === initialCode.toLowerCase().replace(/\s+/g, '')
            );
            if (match) setSelectedCode(match);
          }
        } else {
          // Load specific appliance error codes from registry
          const codes = currentAppliance.errorCodes as ErrorCode[];
          setAllCodes(codes);
          setFilteredCodes(codes);

          if (initialCode) {
            const match = codes.find(
              c => c.code.toLowerCase().replace(/\s+/g, '') === initialCode.toLowerCase().replace(/\s+/g, '')
            );
            if (match) setSelectedCode(match);
          }
        }
      } catch (err: any) {
        console.error('Failed to load error codes:', err);
        setErrorMsg('Failed to load error code database.');
      } finally {
        setLoading(false);
      }
    }
    loadCodes();
  }, [selectedAppliance, initialCode]);

  // Extract unique categories
  const categories = ['All', ...Array.from(new Set(allCodes.map(c => c.category).filter(Boolean)))];

  // Handle live search & category filtering
  useEffect(() => {
    let result = allCodes;

    if (selectedCategory !== 'All') {
      result = result.filter(c => c.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim().replace(/\s+/g, '');
      result = result.filter(c => 
        c.code.toLowerCase().replace(/\s+/g, '').includes(q) ||
        c.display.toLowerCase().replace(/\s+/g, '').includes(q) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.customer_action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.aliases && c.aliases.some(a => a.toLowerCase().replace(/\s+/g, '').includes(q)))
      );
    }

    setFilteredCodes(result);
  }, [searchQuery, selectedCategory, allCodes]);

  const getSeverityBadge = (severity: string, code: string) => {
    const isStatus = ['CL', 'FL', 'PO', 'LO', 'HI', 'OD'].includes(code.toUpperCase());
    if (isStatus) {
      return (
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
          Status / Mode
        </span>
      );
    }
    switch (severity?.toLowerCase()) {
      case 'critical':
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-800 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> Critical
          </span>
        );
      case 'high':
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> High
          </span>
        );
      case 'medium':
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800">
            Medium
          </span>
        );
      case 'low':
      default:
        return (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800">
            Low
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>{currentAppliance.name} Diagnostics</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Error Code Lookup
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              Search alphanumeric display codes for verified meanings, safe user troubleshooting, and required spare parts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToDiagnostic && (
              <button
                onClick={onNavigateToDiagnostic}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold shadow-sm cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Start Guided Diagnosis</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${currentAppliance.shortName} error code (e.g. ${currentAppliance.errorCodes[0]?.display || 'OE'}), symptom, or description...`}
            className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-800 focus:outline-hidden focus:border-teal-600 focus:ring-2 focus:ring-teal-100 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold text-slate-400 mr-1 uppercase tracking-wider">
            Category:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* SELECTED ERROR CODE DETAIL MODAL / CARD */}
      {selectedCode && (
        <div className="bg-white rounded-3xl border border-teal-300 shadow-xl p-6 sm:p-8 mb-8 animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-500 to-sky-500" />
          
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 bg-slate-100 px-3.5 py-1 rounded-xl">
                  {selectedCode.display || selectedCode.code}
                </span>
                {getSeverityBadge(selectedCode.severity, selectedCode.code)}
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {selectedCode.category}
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-slate-800">
                {selectedCode.description}
              </h3>
            </div>

            <button
              onClick={() => setSelectedCode(null)}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Safety Flag Alert */}
          {selectedCode.safety_flag && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-amber-950 mb-0.5">High-Voltage / Sealed System Safety Protocol</h4>
                <p className="leading-relaxed">
                  This error code involves internal high-voltage electronics or pressurized components. Disconnect mains power immediately. Never probe live terminal blocks.
                </p>
              </div>
            </div>
          )}

          {/* Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Customer Action */}
            <div className="bg-teal-50/60 border border-teal-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-teal-900 font-bold text-sm mb-2">
                <CheckCircle className="w-4 h-4 text-teal-600" />
                <span>Customer Action (Safe to perform)</span>
              </div>
              <p className="text-xs sm:text-sm text-teal-950 font-medium leading-relaxed whitespace-pre-line">
                {selectedCode.customer_action}
              </p>
            </div>

            {/* Technician Action */}
            {selectedCode.technician_action && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-700 font-bold text-sm mb-2">
                  <Wrench className="w-4 h-4 text-slate-500" />
                  <span>Technician Action (Certified Service)</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {selectedCode.technician_action}
                </p>
              </div>
            )}
          </div>

          {/* Likely Parts */}
          {selectedCode.likely_parts && selectedCode.likely_parts.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Likely Parts / Components Involved:
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedCode.likely_parts.map((part, idx) => (
                  <span
                    key={idx}
                    className="bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold px-3 py-1 rounded-lg"
                  >
                    {part}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action CTAs (No toll-free numbers) */}
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
            {!['CL', 'FL', 'PO', 'LO', 'HI', 'OD'].includes(selectedCode.code.toUpperCase()) && (
              <button
                onClick={() =>
                  onEscalateToBooking({
                    symptom: `Error Code ${selectedCode.code}: ${selectedCode.description}`,
                    error_code: selectedCode.code,
                    probable_cause: selectedCode.description,
                    parts: selectedCode.likely_parts,
                    priority: selectedCode.severity,
                  })
                }
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white py-3 px-6 rounded-xl font-extrabold text-xs shadow-md transition-all cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Submit Service Request for Error {selectedCode.code}</span>
              </button>
            )}

            {onNavigateToDiagnostic && (
              <button
                onClick={onNavigateToDiagnostic}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white py-3 px-5 rounded-xl font-extrabold text-xs transition-colors cursor-pointer"
              >
                <Activity className="w-4 h-4 text-teal-400" />
                <span>View Guided Diagnosis Steps</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* RESULTS LIST / GRID */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-slate-700">
            Showing {filteredCodes.length} {currentAppliance.name} error code{filteredCodes.length === 1 ? '' : 's'}
          </span>
          {searchQuery && (
            <span className="text-xs text-slate-400">
              Matching query &quot;{searchQuery}&quot;
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCodes.map((ec) => {
            return (
              <div
                key={ec.code}
                onClick={() => setSelectedCode(ec)}
                className={`bg-white border rounded-2xl p-5 cursor-pointer hover:border-teal-500 hover:shadow-md transition-all flex flex-col justify-between ${
                  selectedCode?.code === ec.code ? 'border-2 border-teal-600 ring-2 ring-teal-100' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-extrabold text-lg text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                      {ec.display || ec.code}
                    </span>
                    {getSeverityBadge(ec.severity, ec.code)}
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm mt-2 line-clamp-1">
                    {ec.description}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {ec.customer_action}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-teal-700">
                  <span>View Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            );
          })}
        </div>

        {filteredCodes.length === 0 && !loading && (
          <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
            <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h3 className="font-bold text-slate-700 text-base">No Matching Error Code Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Error code &quot;{searchQuery}&quot; was not found in the {currentAppliance.name} database.
            </p>
            <button
              onClick={() =>
                onEscalateToBooking({
                  symptom: `Unlisted error code: ${searchQuery}`,
                  error_code: searchQuery,
                })
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Submit Service Request for Unlisted Code</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
