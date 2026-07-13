'use client';

import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from './AuthContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import EmailVerificationRequired from '../components/auth/EmailVerificationRequired';

interface AppSettingsContextType {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

function EmailVerificationGate() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [showEmailVerification, setShowEmailVerification] = useState(false);

  useEffect(() => {
    const protectedPaths = ['/app', '/workspaces', '/workspace', '/notifications'];
    const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
    const isDevelopment = process.env.NODE_ENV === 'development';
    const skipEmailVerification = localStorage.getItem('skipEmailVerification') === 'true';

    if (user && !user.emailVerified && isProtectedPath && !(isDevelopment && skipEmailVerification)) {
      setShowEmailVerification(true);
    } else {
      setShowEmailVerification(false);
    }
  }, [pathname, user]);

  if (loading || !showEmailVerification) {
    return null;
  }

  return <EmailVerificationRequired onClose={() => setShowEmailVerification(false)} />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <AuthProvider>
      <AppSettingsContext.Provider value={{ darkMode, setDarkMode }}>
        {children}
        <EmailVerificationGate />
      </AppSettingsContext.Provider>
    </AuthProvider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error('useAppSettings must be used within AppProviders');
  }
  return context;
}
