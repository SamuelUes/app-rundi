import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { es } from './es';
import { zh } from './zh';

const resources = {
  en: { translation: en },
  es: { translation: es },
  zh: { translation: zh },
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
} else {
  Object.entries(resources).forEach(([lang, data]) => {
    i18n.addResourceBundle(lang, 'translation', data.translation, true, true);
  });
}

export type SupportedLanguage = keyof typeof resources;

export const supportedLanguages: SupportedLanguage[] = ['en', 'es', 'zh'];

export default i18n;
