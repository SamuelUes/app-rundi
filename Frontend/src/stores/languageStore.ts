/**
 * Language Store (Zustand)
 * Replaces LanguageContext with a simpler, provider-free store.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { SupportedLanguage, supportedLanguages } from '../i18n';

let Localization: typeof import('expo-localization') | null = null;
try {
  Localization = require('expo-localization');
} catch (error) {
  console.warn('⚠️ ExpoLocalization module not available. Falling back to default language.', error);
}

type LanguagePreference = SupportedLanguage | 'device';

const LANGUAGE_STORAGE_KEY = '@rundi_language';

const normalizeLanguage = (code?: string): SupportedLanguage => {
  const normalized = (code || '').toLowerCase();
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('zh')) return 'zh';
  return 'en';
};

interface LanguageState {
  language: SupportedLanguage;
  deviceLanguage: SupportedLanguage;
  preference: LanguagePreference;
  isReady: boolean;
  changeLanguage: (value: LanguagePreference) => Promise<void>;
  loadLanguage: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'es',
  deviceLanguage: 'es',
  preference: 'device',
  isReady: false,

  loadLanguage: async () => {
    try {
      const locales = Localization?.getLocales?.();
      const detected =
        (locales && locales.length > 0 && normalizeLanguage(locales[0].languageCode || locales[0].languageTag)) ||
        'es';

      const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      const savedPreference: LanguagePreference =
        saved === 'device' || supportedLanguages.includes(saved as SupportedLanguage)
          ? (saved as LanguagePreference)
          : 'device';

      const nextLanguage = savedPreference === 'device' ? detected : (savedPreference as SupportedLanguage);
      set({ deviceLanguage: detected, preference: savedPreference, language: nextLanguage });
      await i18n.changeLanguage(nextLanguage);
    } catch (error) {
      console.error('Error loading language preference:', error);
    } finally {
      set({ isReady: true });
    }
  },

  changeLanguage: async (value: LanguagePreference) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, value);
      const { deviceLanguage } = useLanguageStore.getState();
      const nextLanguage = value === 'device' ? deviceLanguage : (value as SupportedLanguage);
      set({ preference: value, language: nextLanguage });
      await i18n.changeLanguage(nextLanguage);
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  },
}));
