/**
 * BellePoule Modern - Formats de dates, heures et nombres selon la langue active (#1160).
 * La langue est fixée par le TranslationContext (renderer) ; partagé avec les exports PDF/CSV.
 * Licensed under GPL-3.0
 */

/** Langue de l'interface → étiquette BCP 47 utilisée par Intl. */
const BCP47: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  de: 'de-DE',
  es: 'es-ES',
  ca: 'ca-ES',
  br: 'br-FR',
  'zh-HK': 'zh-HK',
};

let activeLanguage = 'fr';

export function toBcp47(language: string): string {
  return BCP47[language] ?? language;
}

/** Appelé au changement de langue de l'interface. */
export function setActiveLanguage(language: string): void {
  activeLanguage = language || 'fr';
}

export function getActiveLanguage(): string {
  return activeLanguage;
}

/** Étiquette BCP 47 de la langue active (ex. « de-DE »), à passer à toLocale*String / Intl. */
export function getActiveLocale(): string {
  return toBcp47(activeLanguage);
}

type DateInput = Date | string | number;

export function formatDate(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleDateString(getActiveLocale(), options);
}

export function formatTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleTimeString(getActiveLocale(), options);
}

export function formatDateTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleString(getActiveLocale(), options);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(getActiveLocale(), options);
}

/**
 * Catégorie de pluriel CLDR (`zero`, `one`, `two`, `few`, `many`, `other`) pour `count`
 * dans `language` : clé de traduction `xxx_one` / `xxx_other`… (repli `other`).
 */
export function pluralCategory(language: string, count: number): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(toBcp47(language)).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/** Clés candidates d'une traduction au pluriel, de la plus précise à la plus générale. */
export function pluralKeys(key: string, language: string, count: number): string[] {
  const category = pluralCategory(language, count);
  return [`${key}_${category}`, `${key}_other`, key];
}
