import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import gu from './locales/gu.json';

const savedLanguage = typeof window !== 'undefined' ? localStorage.getItem('housy_locale') : null;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    gu: { translation: gu },
  },
  lng: savedLanguage || 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export const supportedLanguages = [
  { code: 'en', label: 'English', nativeName: 'English' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', nativeName: 'ગુજરાતી' },
] as const;

export type SupportedLanguageCode = (typeof supportedLanguages)[number]['code'];

export async function changeAppLanguage(lang: SupportedLanguageCode): Promise<void> {
  await i18n.changeLanguage(lang);
  if (typeof window !== 'undefined') {
    localStorage.setItem('housy_locale', lang);
  }
}

export default i18n;

