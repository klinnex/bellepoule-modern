/**
 * BellePoule Modern - Translation Context
 * Global translation state using React Context
 * Licensed under GPL-3.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { logger, LogCategory } from '@shared/services/logger';
import frTranslations from '../locales/fr.json';
import enTranslations from '../locales/en.json';
import deTranslations from '../locales/de.json';
import esTranslations from '../locales/es.json';
import brTranslations from '../locales/br.json';
import caTranslations from '../locales/ca.json';
import zhHKTranslations from '../locales/zh-HK.json';

export type Language = 'fr' | 'en' | 'br' | 'ca' | 'de' | 'es' | 'zh-HK';
export type TranslationKey = string;
export type Theme = 'light' | 'dark' | 'default';

export interface Translations {
  [key: string]: {
    [key: string]: string | unknown;
  };
}

interface TranslationContextValue {
  language: Language;
  theme: Theme;
  translations: Translations;
  isLoading: boolean;
  t: (key: TranslationKey, params?: { [key: string]: string | number }) => string;
  changeLanguage: (lang: Language) => Promise<void>;
  changeTheme: (theme: Theme) => void;
  availableLanguages: readonly { code: Language; name: string; flag: string }[];
  availableThemes: readonly { code: Theme; name: string }[];
}

const TranslationContext = createContext<TranslationContextValue | undefined>(undefined);

const getFallbackTranslations = (language: Language): Translations => {
  const fallbackTranslations: Record<Language, Translations> = {
    fr: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Nouvelle compétition' },
      settings: { title: 'Paramètres' },
      messages: {
        no_competitions: 'Aucune compétition',
        loading: 'Chargement...',
      },
    },
    en: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'New competition' },
      settings: { title: 'Settings' },
      messages: {
        no_competitions: 'No competitions',
        loading: 'Loading...',
      },
    },
    br: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Nevezompetañ' },
      settings: { title: 'Arventennoù' },
      messages: {
        no_competitions: 'Hini kenstrrenn',
        loading: 'O kargañ...',
      },
    },
    ca: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Nova Competició' },
      settings: { title: 'Configuració' },
      messages: {
        no_competitions: 'Sense competicions',
        loading: 'Carregant...',
      },
    },
    de: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Neuer Wettbewerb' },
      settings: { title: 'Einstellungen' },
      messages: {
        no_competitions: 'Keine Wettbewerbe',
        loading: 'Laden...',
      },
    },
    es: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Nueva Competición' },
      settings: { title: 'Ajustes' },
      messages: {
        no_competitions: 'Sin competiciones',
        loading: 'Cargando...',
      },
    },
    'zh-HK': {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: '新增比賽' },
      settings: { title: '設定' },
      messages: {
        no_competitions: '沒有比賽',
        loading: '載入中...',
      },
    },
  };
  return fallbackTranslations[language] || fallbackTranslations.fr;
};

const bundledTranslations: Record<Language, Translations> = {
  fr: frTranslations as Translations,
  en: enTranslations as Translations,
  de: deTranslations as Translations,
  es: esTranslations as Translations,
  br: brTranslations as Translations,
  ca: caTranslations as Translations,
  'zh-HK': zhHKTranslations as Translations,
};

const loadTranslations = (language: Language): Translations => {
  return bundledTranslations[language] || getFallbackTranslations(language);
};

const applyTheme = (theme: Theme): void => {
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-default');
  if (theme !== 'default') {
    document.body.classList.add(`theme-${theme}`);
  }
};

interface TranslationProviderProps {
  children: React.ReactNode;
}

export const TranslationProvider: React.FC<TranslationProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('fr');
  const [theme, setTheme] = useState<Theme>('default');
  const [translations, setTranslations] = useState<Translations>({});
  const [isLoading, setIsLoading] = useState(true);

  const changeLanguage = useCallback(async (newLanguage: Language) => {
    setIsLoading(true);
    const loadedTranslations = loadTranslations(newLanguage);
    setLanguage(newLanguage);
    setTranslations(loadedTranslations);
    localStorage.setItem('bellepoule-language', newLanguage);
    window.electronAPI?.notifyLanguageChanged?.(newLanguage);
    setIsLoading(false);
  }, []);

  const changeTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('bellepoule-theme', newTheme);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const injectedLang = window.electronAPI?.initialLanguage as Language | null;
      const savedLanguage =
        injectedLang || (localStorage.getItem('bellepoule-language') as Language) || 'fr';
      if (injectedLang) localStorage.setItem('bellepoule-language', injectedLang);
      const savedTheme = (localStorage.getItem('bellepoule-theme') as Theme) || 'default';

      applyTheme(savedTheme);
      const loadedTranslations = loadTranslations(savedLanguage);

      setLanguage(savedLanguage);
      setTheme(savedTheme);
      setTranslations(loadedTranslations);
      setIsLoading(false);
    };

    initialize();
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: { [key: string]: string | number }): string => {
      const keys = key.split('.');
      let value: unknown = translations;

      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[k];
        } else {
          return key;
        }
      }

      if (typeof value !== 'string') {
        return key;
      }

      if (params) {
        return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
          return String(params[paramKey] || match);
        });
      }

      return value;
    },
    [translations]
  );

  const value: TranslationContextValue = {
    language,
    theme,
    translations,
    isLoading,
    t,
    changeLanguage,
    changeTheme,
    availableLanguages: [
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'br', name: 'Brezhoneg', flag: '🇫🇷' },
      { code: 'ca', name: 'Català', flag: '🇪🇸' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'zh-HK', name: '繁體中文', flag: '🇭🇰' },
    ],
    availableThemes: [
      { code: 'default', name: 'Default' },
      { code: 'light', name: 'Light' },
      { code: 'dark', name: 'Dark' },
    ],
  };

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
};

export const useTranslation = (): TranslationContextValue => {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};
