'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Calendar, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  FileText, 
  HelpCircle, 
  PhoneCall, 
  ExternalLink 
} from 'lucide-react';
import { apiClient, WarrantyResponse } from '../lib/api';

interface WarrantyCheckerProps {
  onEscalateToBooking: (context: {
    symptom: string;
    probable_cause?: string;
  }) => void;
  selectedModel: string;
}

export const WarrantyChecker: React.FC<WarrantyCheckerProps> = ({
  onEscalateToBooking,
  selectedModel,
}) => {
  const [model, setModel] = useState<string>(selectedModel);
  const [serialNumber, setSerialNumber] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [warrantyResult, setWarrantyResult] = useState<{
    comprehensiveActive: boolean;
    compressorActive: boolean;
    comprehensiveExpiry: string;
    compressorExpiry: string;
  } | null>(null);

  const [warrantyData, setWarrantyData] = useState<WarrantyResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPolicy() {
      try {
        const data = await apiClient.getWarranty();
        setWarrantyData(data);
      } catch (err) {
        console.warn('Could not load server warranty text:', err);
      }
    }
    fetchPolicy();
  }, []);

  const handleCheckWarranty = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!purchaseDate) {
      setErrorMsg('Please select your purchase date.');
      return;
    }

    const pDate = new Date(purchaseDate);
    const today = new Date();

    if (pDate > today) {
      setErrorMsg('Purchase date cannot be in the future.');
      return;
    }

    // 1-year comprehensive
    const compExp = new Date(pDate);
    compExp.setFullYear(compExp.getFullYear() + 1);

    // 10-year compressor
    const comp10Exp = new Date(pDate);
    comp10Exp.setFullYear(comp10Exp.getFullYear() + 10);

    setWarrantyResult({
      comprehensiveActive: today <= compExp,
      compressorActive: today <= comp10Exp,
      comprehensiveExpiry: compExp.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      compressorExpiry: comp10Exp.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    });
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
        <div className="max-w-2xl mx-auto text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Coverage Verification</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Appliance Warranty Verification
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Check your standard 1-year comprehensive and extended inverter component warranty status.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleCheckWarranty} className="max-w-2xl mx-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Appliance Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm text-slate-800 bg-slate-50 focus:outline-hidden focus:border-teal-600"
              >
                <option value="UW-Q18WUZA">AC: UW-Q18WUZA (1.5T Window Dual Inverter)</option>
                <option value="MS-Q18YNZA">AC: MS-Q18YNZA (1.5T Split Dual Inverter)</option>
                <option value="GL-T432APZY">Refrigerator: GL-T432APZY (Double Door Frost-Free)</option>
                <option value="FHM1408BDW">Washing Machine: FHM1408BDW (8kg Front Load)</option>
                <option value="MC2886BRUM">Microwave: MC2886BRUM (28L Convection)</option>
                <option value="DFB424FP">Dishwasher: DFB424FP (14 Place QuadWash)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Purchase Date *
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm text-slate-800 bg-white focus:outline-hidden focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Serial Number (Optional)
            </label>
            <input
              type="text"
              placeholder="Found on the appliance barcode sticker (e.g. 102KRAL12345)"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm text-slate-800 bg-white focus:outline-hidden focus:border-teal-600"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors"
          >
            Calculate Warranty Coverage
          </button>
        </form>
      </div>

      {/* Warranty Results */}
      {warrantyResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 mb-8">
          <h3 className="text-xl font-bold text-slate-900 mb-4">
            Warranty Status for Model: {model}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* 1 Year Standard */}
            <div
              className={`p-5 rounded-2xl border ${
                warrantyResult.comprehensiveActive
                  ? 'bg-emerald-50/70 border-emerald-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Comprehensive Warranty (1 Year)
                </span>
                {warrantyResult.comprehensiveActive ? (
                  <span className="flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3.5 h-3.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-extrabold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                    <XCircle className="w-3.5 h-3.5" /> Expired
                  </span>
                )}
              </div>
              <p className="text-lg font-extrabold text-slate-900">
                {warrantyResult.comprehensiveActive ? 'Covered' : 'Expired'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Expiry Date: <strong>{warrantyResult.comprehensiveExpiry}</strong>
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Covers all electrical parts, PCB, sensor, and fan motor for manufacturing defects.
              </p>
            </div>

            {/* 10 Year Inverter Compressor */}
            <div
              className={`p-5 rounded-2xl border ${
                warrantyResult.compressorActive
                  ? 'bg-blue-50/70 border-blue-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Inverter Compressor / Motor (10 Years)
                </span>
                {warrantyResult.compressorActive ? (
                  <span className="flex items-center gap-1 text-xs font-extrabold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3.5 h-3.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-extrabold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                    <XCircle className="w-3.5 h-3.5" /> Expired
                  </span>
                )}
              </div>
              <p className="text-lg font-extrabold text-slate-900">
                {warrantyResult.compressorActive ? 'Covered' : 'Expired'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Expiry Date: <strong>{warrantyResult.compressorExpiry}</strong>
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Covers compressor replacement parts (gas charging & labor may be chargeable after year 1).
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span>Have an issue while under warranty? Book a certified technician with your invoice.</span>
            <button
              onClick={() =>
                onEscalateToBooking({
                  symptom: `Warranty Service Request (${model})`,
                  probable_cause: warrantyResult.comprehensiveActive
                    ? 'Under 1-Year Comprehensive Warranty'
                    : 'Compressor / Out-of-warranty Service',
                })
              }
              className="px-4 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 whitespace-nowrap"
            >
              Book Service Under Warranty
            </button>
          </div>
        </div>
      )}

      {/* Policy Exclusions & Guidelines */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <h3 className="text-lg font-bold text-slate-900 mb-4">
          Key Warranty Terms & Exclusions
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm text-slate-700">
          <div>
            <h4 className="font-bold text-slate-900 mb-2">What Is Covered:</h4>
            <ul className="space-y-1.5 list-disc pl-4 text-slate-600">
              <li>Defects in manufacturing materials or factory assembly.</li>
              <li>Functional breakdown of internal electronics under normal residential usage.</li>
              <li>Compressor failure within 10-year period from purchase date.</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-red-800 mb-2">Non-Covered Exclusions:</h4>
            <ul className="space-y-1.5 list-disc pl-4 text-slate-600">
              <li>Damage resulting from voltage fluctuations or failure to use a voltage stabilizer.</li>
              <li>Pest intrusion, rodent damage to internal wiring, or insect infestations.</li>
              <li>Unauthorized repairs, third-party dismantling, or non-genuine spare parts.</li>
              <li>Normal wear and tear, cosmetic plastic discoloration, or missing filters.</li>
            </ul>
          </div>
        </div>

        {warrantyData?.disclaimer && (
          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 italic">
            <strong>Official Notice: </strong>
            {warrantyData.disclaimer}
          </div>
        )}
      </div>
    </div>
  );
};
