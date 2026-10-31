'use client';

import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Phone, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  FileText, 
  ShieldAlert, 
  PhoneCall, 
  MessageSquare, 
  RefreshCw 
} from 'lucide-react';
import { apiClient, UserProfile } from '../lib/api';

export interface BookingContext {
  symptom?: string;
  error_code?: string;
  probable_cause?: string;
  parts?: string[];
  priority?: string;
}

interface ServiceBookingProps {
  bookingContext: BookingContext;
  selectedModel: string;
  onTicketCreated?: (ticketId: string) => void;
  currentUser?: UserProfile | null;
  onUpdateUser?: (user: UserProfile) => void;
}

export const ServiceBooking: React.FC<ServiceBookingProps> = ({
  bookingContext,
  selectedModel,
  onTicketCreated,
  currentUser,
  onUpdateUser,
}) => {
  const [customerName, setCustomerName] = useState(currentUser?.name || '');
  const [contactNumber, setContactNumber] = useState(currentUser?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [address, setAddress] = useState(currentUser?.address || '');
  const [city, setCity] = useState(currentUser?.city || 'New Delhi');
  const [pincode, setPincode] = useState(currentUser?.pincode || '');

  React.useEffect(() => {
    if (currentUser) {
      if (currentUser.name && !customerName) setCustomerName(currentUser.name);
      if (currentUser.phone && !contactNumber) setContactNumber(currentUser.phone);
      if (currentUser.email && !email) setEmail(currentUser.email);
      if (currentUser.address && !address) setAddress(currentUser.address);
      if (currentUser.city && !city) setCity(currentUser.city);
      if (currentUser.pincode && !pincode) setPincode(currentUser.pincode);
    }
  }, [currentUser]);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('Morning (09:00 AM - 01:00 PM)');
  const [problemDescription, setProblemDescription] = useState(
    bookingContext.probable_cause
      ? `Preliminary Diagnosis: ${bookingContext.probable_cause}. Symptom: ${bookingContext.symptom || ''}`
      : bookingContext.symptom || ''
  );
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successTicket, setSuccessTicket] = useState<{
    ticketId: string;
    message: string;
    createdAt: string;
    assignedTechnician?: { id: string; name: string };
    scheduledDate?: string;
    scheduledSlot?: string;
    isAlternativeSlot?: boolean;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!customerName || !contactNumber || !address || !pincode) {
      setErrorMsg('Please fill in all mandatory contact & address fields.');
      return;
    }

    try {
      setLoading(true);
      const fd = new FormData();
      if (currentUser?.id) {
        fd.append('customerId', currentUser.id);
      }
      if (currentUser?.email || email) {
        fd.append('customerEmail', currentUser?.email || email);
      }
      fd.append('customerName', customerName);
      fd.append('contactNumber', contactNumber);
      fd.append('email', email || currentUser?.email || 'not-provided@customer.com');
      fd.append('address', address);
      fd.append('city', city);
      fd.append('pincode', pincode);
      fd.append('acModel', selectedModel);
      fd.append('errorCode', bookingContext.error_code || '');
      fd.append('reportedIssue', bookingContext.symptom || 'Unspecified cooling issue');
      fd.append('probableCause', bookingContext.probable_cause || '');
      fd.append('predictedParts', JSON.stringify(bookingContext.parts || []));
      fd.append('priority', bookingContext.priority || 'Medium');
      fd.append('preferredDate', preferredDate || new Date().toISOString().split('T')[0]);
      fd.append('preferredTime', preferredTime);
      fd.append('problemDescription', problemDescription);

      if (file) {
        fd.append('invoiceFile', file);
      }

      const res = await apiClient.bookService(fd);
      if (res.error) {
        throw new Error(res.error);
      }

      setSuccessTicket({
        ticketId: res.ticketId,
        message: res.message,
        createdAt: res.createdAt,
        assignedTechnician: res.assignedTechnician,
        scheduledDate: res.scheduledDate,
        scheduledSlot: res.scheduledSlot,
        isAlternativeSlot: res.isAlternativeSlot,
      });

      // Automatically update user profile with latest details
      if (currentUser) {
        try {
          const profileRes = await apiClient.updateProfile({
            userId: currentUser.id,
            name: customerName,
            phone: contactNumber,
            address: address,
            city: city,
            pincode: pincode,
          });
          if (profileRes.success && profileRes.user && onUpdateUser) {
            onUpdateUser(profileRes.user);
          }
        } catch (updateErr) {
          console.warn('Auto-update profile failed:', updateErr);
        }
      }

      if (onTicketCreated) {
        onTicketCreated(res.ticketId);
      }
    } catch (err: any) {
      console.error('Service booking failed:', err);
      setErrorMsg(err.message || 'Failed to submit service booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      {/* SUCCESS TICKET CARD */}
      {successTicket ? (
        <div className="bg-white rounded-3xl border-2 border-emerald-500 shadow-2xl p-8 sm:p-12 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <span className="text-xs font-extrabold uppercase tracking-widest text-teal-700 bg-teal-100 px-3 py-1 rounded-full">
            ApplianceCare AI Service Request Recorded
          </span>

          <h2 className="text-3xl font-black text-slate-900 mt-3 mb-2">
            Service Booking Confirmed!
          </h2>

          <p className="text-slate-600 text-sm max-w-lg mx-auto mb-8">
            A certified ApplianceCare AI field technician has been assigned to your request and will contact you shortly to confirm the appointment.
          </p>

          {/* Ticket ID Box */}
          <div className="max-w-md mx-auto bg-slate-900 text-white rounded-2xl p-6 shadow-inner text-left mb-8">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-3 mb-3">
              <span>SERVICE TICKET NUMBER</span>
              <span className="font-semibold text-teal-400">STATUS: ASSIGNED</span>
            </div>
            <div className="font-mono text-2xl font-black tracking-wider text-white">
              {successTicket.ticketId}
            </div>

            {/* Assigned Technician Banner */}
            {successTicket.assignedTechnician && (
              <div className="mt-3 p-3 bg-slate-800 rounded-xl border border-slate-700 text-xs">
                <div className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mb-1">
                  Assigned Field Technician
                </div>
                <div className="font-extrabold text-sm text-teal-400">
                  {successTicket.assignedTechnician.name}
                </div>
                <div className="text-slate-300 mt-1">
                  Scheduled for: <strong>{successTicket.scheduledDate}</strong> ({successTicket.scheduledSlot})
                  {successTicket.isAlternativeSlot && (
                    <span className="text-amber-400 text-[10px] block mt-0.5">* Adjusted to nearest available slot due to peak demand</span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-1">
              <div><strong>Customer Name:</strong> {customerName}</div>
              <div><strong>Contact Mobile:</strong> {contactNumber}</div>
              <div><strong>Service Address:</strong> {address}, {city} - {pincode}</div>
              <div><strong>Target Model:</strong> {selectedModel}</div>
              <div><strong>Reported Problem:</strong> {bookingContext.symptom || 'General Diagnostic Escalation'}</div>
              {bookingContext.probable_cause && (
                <div><strong>Diagnostic Finding:</strong> {bookingContext.probable_cause}</div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-md">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Reference Saved in System</span>
            </div>

            <button
              onClick={() => {
                setSuccessTicket(null);
                setCustomerName('');
                setContactNumber('');
                setAddress('');
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Book Another Request</span>
            </button>
          </div>
        </div>
      ) : (
        /* BOOKING FORM */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700">Verified Dispatch</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              Request a Certified Field Technician
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Our certified field technicians follow factory repair protocols and use verified replacement parts.
            </p>
          </div>

          {/* Pre-filled Diagnostic Summary Card if coming from Diagnostic */}
          {(bookingContext.symptom || bookingContext.probable_cause || bookingContext.error_code) && (
            <div className="mb-8 p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
                  Pre-filled Diagnostic Findings
                </span>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                  Priority: {bookingContext.priority || 'High'}
                </span>
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                {bookingContext.probable_cause || bookingContext.symptom}
              </h3>
              {bookingContext.error_code && (
                <div className="mt-1 text-xs text-slate-600 font-mono">
                  Error Code: <strong>{bookingContext.error_code}</strong>
                </div>
              )}
              {bookingContext.parts && bookingContext.parts.length > 0 && (
                <div className="mt-2 text-xs text-slate-500">
                  <span>Anticipated Parts: </span>
                  <span className="font-medium text-slate-700">{bookingContext.parts.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contact details */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-600" />
                  <span>Customer Contact Information</span>
                </h3>
                {currentUser?.phone && (
                  <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                    ✨ Auto-filled from your profile
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="10-digit mobile"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-teal-600" />
                  <span>Service Location Address</span>
                </h3>
                {currentUser?.address && (
                  <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                    ✨ Auto-filled from your profile
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">House / Flat / Street Address *</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Complete address for home visit"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">PIN Code *</label>
                  <input
                    type="text"
                    required
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="6-digit pincode"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600"
                  />
                </div>
              </div>
            </div>

            {/* Preferred Slot */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>Preferred Date & Time</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Date</label>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Time Slot</label>
                  <select
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600 bg-white"
                  >
                    <option value="Morning (09:00 AM - 01:00 PM)">Morning (09:00 AM - 01:00 PM)</option>
                    <option value="Afternoon (01:00 PM - 05:00 PM)">Afternoon (01:00 PM - 05:00 PM)</option>
                    <option value="Evening (05:00 PM - 08:00 PM)">Evening (05:00 PM - 08:00 PM)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Problem Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Additional Notes / Problem Description
              </label>
              <textarea
                rows={3}
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                placeholder="Mention any specific symptoms or convenient directions..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-teal-600"
              />
            </div>

            {/* Optional File Upload */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Attach Invoice or Photo of Error Display (Optional)
              </label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-slate-300 transition-colors">
                <input
                  type="file"
                  id="fileUpload"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label htmlFor="fileUpload" className="cursor-pointer">
                  <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <span className="text-xs font-bold text-slate-700">
                    {file ? file.name : 'Click to select invoice or photo (Max 10MB)'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Supports JPG, PNG, PDF</p>
                </label>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-base rounded-xl shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Submitting Service Request...' : 'Confirm & Request Service Technician'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
