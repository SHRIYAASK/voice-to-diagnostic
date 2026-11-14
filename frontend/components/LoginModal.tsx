'use client';

import React from 'react';
import { X } from 'lucide-react';
import { UserProfile } from '../lib/api';
import { CorporateLoginCard } from './CorporateLoginCard';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-2xl bg-transparent">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-20 p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <CorporateLoginCard
          currentUser={currentUser}
          onLoginSuccess={(user) => {
            onLoginSuccess(user);
            setTimeout(onClose, 300);
          }}
          onLogout={onLogout}
          isModal={true}
        />
      </div>
    </div>
  );
};

