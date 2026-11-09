/**
 * BellePoule Modern - Translation Context
 * Global translation state using React Context
 * Licensed under GPL-3.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { logger, LogCategory } from '@shared/services/logger';
import {
  pseudoLocalize,
  isPseudoLocaleEnabled,
  PSEUDO_LOCALE_STORAGE_KEY,
} from '@shared/utils/pseudoLocale';
import { getActiveLanguage, pluralKeys, setActiveLanguage } from '@shared/utils/localeFormat';
import { setPdfTranslator } from '@shared/utils/pdfExport/core';
import frTranslations from '../locales/fr.json';

export type Language = 'fr' | 'en' | 'br' | 'ca' | 'de' | 'es' | 'pt' | 'it' | 'ru' | 'zh-HK';
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
  /** Debug i18n : chaînes traduites marquées [!! … !!] (#1063) */
  pseudoLocale: boolean;
  setPseudoLocale: (enabled: boolean) => void;
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
    pt: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Nova competição' },
      settings: { title: 'Definições' },
      messages: {
        no_competitions: 'Nenhuma competição',
        loading: 'A carregar...',
      },
    },
    it: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Nuova competizione' },
      settings: { title: 'Impostazioni' },
      messages: {
        no_competitions: 'Nessuna competizione',
        loading: 'Caricamento...',
      },
    },
    ru: {
      app: { title: 'BellePoule Modern' },
      menu: { new_competition: 'Новое соревнование' },
      settings: { title: 'Настройки' },
      messages: {
        no_competitions: 'Нет соревнований',
        loading: 'Загрузка...',
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

// Seul fr (langue par défaut et repli) est dans le bundle initial ; les autres langues
// sont des chunks chargés à la demande (budget chargement initial, check:bundle-size)
const localeLoaders: Record<Exclude<Language, 'fr'>, () => Promise<{ default: unknown }>> = {
  en: () => import(/* webpackChunkName: "locale-en" */ '../locales/en.json'),
  de: () => import(/* webpackChunkName: "locale-de" */ '../locales/de.json'),
  es: () => import(/* webpackChunkName: "locale-es" */ '../locales/es.json'),
  pt: () => import(/* webpackChunkName: "locale-pt" */ '../locales/pt.json'),
  it: () => import(/* webpackChunkName: "locale-it" */ '../locales/it.json'),
  ru: () => import(/* webpackChunkName: "locale-ru" */ '../locales/ru.json'),
  br: () => import(/* webpackChunkName: "locale-br" */ '../locales/br.json'),
  ca: () => import(/* webpackChunkName: "locale-ca" */ '../locales/ca.json'),
  'zh-HK': () => import(/* webpackChunkName: "locale-zh-HK" */ '../locales/zh-HK.json'),
};

const loadedTranslations: Partial<Record<Language, Translations>> = {
  fr: frTranslations as Translations,
};

/** Traductions déjà chargées (synchrone) : repli fr si la langue n'est pas encore chargée. */
const getLoadedTranslations = (language: Language): Translations =>
  loadedTranslations[language] ?? (frTranslations as Translations);

const loadTranslations = async (language: Language): Promise<Translations> => {
  const cached = loadedTranslations[language];
  if (cached) return cached;
  const loader = localeLoaders[language as Exclude<Language, 'fr'>];
  if (!loader) return getFallbackTranslations(language);
  try {
    const mod = await loader();
    const translations = mod.default as Translations;
    loadedTranslations[language] = translations;
    return translations;
  } catch (error) {
    logger.error(
      LogCategory.UI,
      `Chargement de la langue ${language} impossible`,
      error instanceof Error ? error : undefined
    );
    return getFallbackTranslations(language);
  }
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
    const nextTranslations = await loadTranslations(newLanguage);
    setLanguage(newLanguage);
    setTranslations(nextTranslations);
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
      // Langue déjà en mémoire (fr) : appliquée sans attendre de microtâche
      const initialTranslations =
        loadedTranslations[savedLanguage] ?? (await loadTranslations(savedLanguage));

      setLanguage(savedLanguage);
      setTheme(savedTheme);
      setTranslations(initialTranslations);
      setIsLoading(false);
    };

    initialize();
  }, []);

  // Langue active des formats Intl (dates, nombres) : fixée pendant le rendu, avant celui
  // des enfants, sinon ils formatent avec la langue précédente (#1213)
  setActiveLanguage(language);

  // Attribut lang du document (lecteurs d'écran, césure, correcteur orthographique) (#1160)
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
  }, [language]);

  // Debug i18n : chaînes traduites marquées [!! … !!] (voir pseudoLocale.ts)
  const [pseudoLocale, setPseudoLocaleState] = useState(() =>
    isPseudoLocaleEnabled(typeof localStorage === 'undefined' ? undefined : localStorage)
  );
  const setPseudoLocale = useCallback((enabled: boolean) => {
    try {
      if (enabled) localStorage.setItem(PSEUDO_LOCALE_STORAGE_KEY, '1');
      else localStorage.removeItem(PSEUDO_LOCALE_STORAGE_KEY);
    } catch {
      /* stockage indisponible : réglage limité à la session */
    }
    setPseudoLocaleState(enabled);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: { [key: string]: string | number }): string => {
      const lookup = (path: string): string | undefined => {
        let value: unknown = translations;
        for (const k of path.split('.')) {
          if (!value || typeof value !== 'object') return undefined;
          value = (value as Record<string, unknown>)[k];
        }
        return typeof value === 'string' ? value : undefined;
      };

      // Pluriel : `key_one` / `key_other` (… `_few`, `_many` selon la langue) si `count` (#1160)
      const count = params?.count;
      const candidates = typeof count === 'number' ? pluralKeys(key, language, count) : [key];
      let value: string | undefined;
      for (const candidate of candidates) {
        value = lookup(candidate);
        if (value !== undefined) break;
      }
      if (value === undefined) return key;

      const template = pseudoLocale ? pseudoLocalize(value) : value;

      if (params) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
          const param = params[paramKey];
          return param === undefined || param === null ? match : String(param);
        });
      }

      return template;
    },
    [translations, pseudoLocale, language]
  );

  // PDF générés dans la langue de l'interface (#1159)
  useEffect(() => setPdfTranslator(t, language), [t, language]);

  const value: TranslationContextValue = {
    language,
    theme,
    translations,
    isLoading,
    t,
    changeLanguage,
    changeTheme,
    pseudoLocale,
    setPseudoLocale,
    availableLanguages: [
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'pt', name: 'Português', flag: '🇵🇹' },
      { code: 'it', name: 'Italiano', flag: '🇮🇹' },
      { code: 'ru', name: 'Русский', flag: '🇷🇺' },
      { code: 'zh-HK', name: '繁體中文', flag: '🇭🇰' },
      { code: 'br', name: 'Brezhoneg', flag: '🇫🇷' },
      { code: 'ca', name: 'Català', flag: '🇪🇸' },
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

/**
 * Traduction hors contexte React (composants classe, ErrorBoundary rendu hors du
 * TranslationProvider) : langue active de localeFormat, repli sur la clé (#1158).
 */
export const translateStatic = (key: TranslationKey, params?: Record<string, string | number>) => {
  let value: unknown = getLoadedTranslations(getActiveLanguage() as Language);
  for (const k of key.split('.')) {
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[k] : undefined;
  }
  if (typeof value !== 'string') return key;
  return value.replace(/\{\{(\w+)\}\}/g, (match, p) => (params?.[p] ?? match).toString());
};
