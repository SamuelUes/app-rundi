/**
 * Language Context - Backward-compatible wrapper around languageStore (Zustand)
 * Use useLanguageStore directly in new code. This wrapper exists for legacy imports.
 */

import React, { ReactNode, useEffect } from 'react';
import { useLanguageStore } from '../stores/languageStore';
import { SupportedLanguage } from '../i18n';

type LanguagePreference = SupportedLanguage | 'device';

interface LanguageContextValue {
  language: SupportedLanguage;
  deviceLanguage: SupportedLanguage;
  preference: LanguagePreference;
  changeLanguage: (value: LanguagePreference) => Promise<void>;
  isReady: boolean;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const loadLanguage = useLanguageStore((s) => s.loadLanguage);

  useEffect(() => {
    loadLanguage();
  }, []);

  return <>{children}</>;
}

export function useLanguage(): LanguageContextValue {
  const language = useLanguageStore((s) => s.language);
  const deviceLanguage = useLanguageStore((s) => s.deviceLanguage);
  const preference = useLanguageStore((s) => s.preference);
  const isReady = useLanguageStore((s) => s.isReady);
  const changeLanguage = useLanguageStore((s) => s.changeLanguage);

  return { language, deviceLanguage, preference, changeLanguage, isReady };
}
