import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh'
import en from './locales/en'

export const SUPPORTED_LANGUAGES = ['zh', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export function getInitialLanguage(): Language {
  const saved = localStorage.getItem('tm-language') as Language | null
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved
  // 跟随浏览器语言
  const nav = navigator.language.toLowerCase()
  if (nav.startsWith('zh')) return 'zh'
  return 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
