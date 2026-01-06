import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
let Localization: typeof import('expo-localization') | null = null;
try {
  Localization = require('expo-localization');
} catch (error) {
  console.warn('⚠️ ExpoLocalization module not available. Falling back to default language.', error);
}
import i18n, { SupportedLanguage, supportedLanguages } from '../i18n';

type LanguagePreference = SupportedLanguage | 'device';

interface LanguageContextValue {
  language: SupportedLanguage;
  deviceLanguage: SupportedLanguage;
  preference: LanguagePreference;
  changeLanguage: (value: LanguagePreference) => Promise<void>;
  isReady: boolean;
}

const LANGUAGE_STORAGE_KEY = '@rundi_language';

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const normalizeLanguage = (code?: string): SupportedLanguage => {
  const normalized = (code || '').toLowerCase();

  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('zh')) return 'zh';
  return 'en';
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [deviceLanguage, setDeviceLanguage] = useState<SupportedLanguage>('es');
  const [language, setLanguage] = useState<SupportedLanguage>('es');
  const [preference, setPreference] = useState<LanguagePreference>('device');
  const [isReady, setIsReady] = useState(false);

  // Cargar idioma del dispositivo y preferencia guardada
  useEffect(() => {
    const load = async () => {
      try {
        const locales = Localization?.getLocales?.();
        const detected =
          (locales && locales.length > 0 && normalizeLanguage(locales[0].languageCode || locales[0].languageTag)) ||
          'es';
        setDeviceLanguage(detected);

        const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const savedPreference: LanguagePreference =
          saved === 'device' || supportedLanguages.includes(saved as SupportedLanguage)
            ? (saved as LanguagePreference)
            : 'device';

        const nextLanguage = savedPreference === 'device' ? detected : (savedPreference as SupportedLanguage);
        setPreference(savedPreference);
        setLanguage(nextLanguage);
        await i18n.changeLanguage(nextLanguage);
      } catch (error) {
        console.error('Error loading language preference:', error);
      } finally {
        setIsReady(true);
      }
    };

    load();
  }, []);

  const changeLanguage = async (value: LanguagePreference) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, value);
      setPreference(value);
      const nextLanguage = value === 'device' ? deviceLanguage : (value as SupportedLanguage);
      setLanguage(nextLanguage);
      await i18n.changeLanguage(nextLanguage);
      console.log(`🌐 Idioma cambiado a: ${nextLanguage} (preferencia: ${value})`);
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  };

  const value = useMemo(
    () => ({
      language,
      deviceLanguage,
      preference,
      changeLanguage,
      isReady,
    }),
    [language, deviceLanguage, preference, isReady],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
