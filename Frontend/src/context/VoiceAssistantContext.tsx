import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SpeechOptions } from 'expo-speech';

import voiceAssistantService, { type VoiceAssistantCategory } from '../services/voiceAssistantService';
import { useLanguage } from './LanguageContext';
import type { SupportedLanguage } from '../i18n';

const STORAGE_KEY = '@rundi_voice_assistant_settings_v1';

type VoiceAssistantSettings = {
  enabled: boolean;
  locale: string | null;
  rate: number;
  pitch: number;
};

const DEFAULT_SETTINGS: VoiceAssistantSettings = {
  enabled: true,
  locale: 'es-NI',
  rate: 1,
  pitch: 1,
};

const LANGUAGE_TO_VOICE_LOCALE: Record<SupportedLanguage, string> = {
  en: 'en-US',
  es: 'es-NI',
  zh: 'zh-CN',
};

const resolveVoiceLocale = (language: SupportedLanguage): string =>
  LANGUAGE_TO_VOICE_LOCALE[language] ?? DEFAULT_SETTINGS.locale;

type VoiceAssistantContextValue = {
  settings: VoiceAssistantSettings;
  initialized: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  updateSettings: (partial: Partial<Omit<VoiceAssistantSettings, 'enabled'>>) => Promise<void>;
  speak: (
    text: string,
    category?: VoiceAssistantCategory,
    options?: SpeechOptions,
    force?: boolean,
  ) => string | null;
  stopCategory: (category: VoiceAssistantCategory) => void;
  stopAll: () => void;
};

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | undefined>(undefined);

export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [settings, setSettings] = useState<VoiceAssistantSettings>(DEFAULT_SETTINGS);
  const [initialized, setInitialized] = useState(false);
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettings((prev) => ({
            ...prev,
            ...parsed,
          }));
        }
      } catch (error) {
        console.error('❌ VoiceAssistantContext load error:', error);
      } finally {
        setHasLoadedFromStorage(true);
        setInitialized(true);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    voiceAssistantService.setLocale(settings.locale);
    voiceAssistantService.setRate(settings.rate);
    voiceAssistantService.setPitch(settings.pitch);
    voiceAssistantService.setEnabled(settings.enabled);

    if (hasLoadedFromStorage) {
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch((error) => {
        console.error('❌ VoiceAssistantContext persist error:', error);
      });
    }
  }, [settings, initialized, hasLoadedFromStorage]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    const targetLocale = resolveVoiceLocale(language);
    setSettings((prev) => (prev.locale === targetLocale ? prev : { ...prev, locale: targetLocale }));
  }, [language, initialized]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setSettings((prev) => ({ ...prev, enabled }));
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<Omit<VoiceAssistantSettings, 'enabled'>>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  const speak = useCallback(
    (
      text: string,
      category: VoiceAssistantCategory = 'custom',
      options?: SpeechOptions,
      force?: boolean,
    ) => voiceAssistantService.speak(text, category, options, force ?? false),
    [],
  );

  const stopCategory = useCallback((category: VoiceAssistantCategory) => {
    voiceAssistantService.stopByCategory(category);
  }, []);

  const stopAll = useCallback(() => {
    voiceAssistantService.stopAll();
  }, []);

  const value = useMemo<VoiceAssistantContextValue>(
    () => ({ settings, initialized, setEnabled, updateSettings, speak, stopCategory, stopAll }),
    [settings, initialized, setEnabled, updateSettings, speak, stopCategory, stopAll],
  );

  return <VoiceAssistantContext.Provider value={value}>{children}</VoiceAssistantContext.Provider>;
}

export function useVoiceAssistant() {
  const context = useContext(VoiceAssistantContext);
  if (!context) {
    throw new Error('useVoiceAssistant must be used within VoiceAssistantProvider');
  }
  return context;
}
