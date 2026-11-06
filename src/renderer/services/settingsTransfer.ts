/**
 * BellePoule Modern - Export / import des paramètres (JSON, logos inclus)
 * Seules les clés listées ici sont exportées / acceptées à l'import.
 * Licensed under GPL-3.0
 */

import { UI_SCALES } from './uiScale';
import { LOGO_STORAGE_KEY, LOGO_LIBRARY_KEY, sanitizeLogoLibrary } from './logoLibrary';

export const SETTINGS_EXPORT_FORMAT = 'bellepoule-settings';
export const SETTINGS_EXPORT_VERSION = 1;

/** Clés localStorage transférées. Valeurs stockées telles quelles (chaînes). */
export const SETTINGS_TRANSFER_KEYS = [
  'bellepoule-language',
  'bellepoule-theme',
  'bellepoule-ui-scale',
  'bellepoule-confetti-disabled',
  'bellepoule-audit-log-enabled',
  'bellepoule-quick-mouse-scoring',
  'bellepoule-simplified-input-mode',
  'bellepoule-tts-config',
  'bellepoule-webhook-url',
  'bellepoule-pdf-templates',
  LOGO_STORAGE_KEY,
  LOGO_LIBRARY_KEY,
] as const;

export type SettingsTransferKey = (typeof SETTINGS_TRANSFER_KEYS)[number];
export type SettingsValues = Partial<Record<SettingsTransferKey, string>>;

export interface SettingsExportFile {
  format: typeof SETTINGS_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  settings: SettingsValues;
}

const JSON_KEYS: ReadonlySet<string> = new Set([
  'bellepoule-tts-config',
  'bellepoule-pdf-templates',
  LOGO_LIBRARY_KEY,
]);

const BOOLEAN_KEYS: ReadonlySet<string> = new Set([
  'bellepoule-confetti-disabled',
  'bellepoule-audit-log-enabled',
  'bellepoule-quick-mouse-scoring',
  'bellepoule-simplified-input-mode',
]);

const ENUM_VALUES: Readonly<Record<string, readonly string[]>> = {
  'bellepoule-language': ['fr', 'en', 'br', 'ca', 'de', 'es', 'it', 'zh-HK'],
  'bellepoule-theme': ['default', 'light', 'dark'],
  'bellepoule-ui-scale': UI_SCALES.map(String),
};

const MAX_VALUE_LENGTH = 8 * 1024 * 1024;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function buildSettingsExport(
  storage: StorageLike = localStorage,
  now: Date = new Date()
): SettingsExportFile {
  const settings: SettingsValues = {};
  for (const key of SETTINGS_TRANSFER_KEYS) {
    const v = storage.getItem(key);
    if (v !== null) settings[key] = v;
  }
  return {
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    settings,
  };
}

export function settingsExportFileName(now: Date = new Date()): string {
  return `bellepoule-parametres-${now.toISOString().slice(0, 10)}.json`;
}

function validValue(key: string, value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) return null;
  if (BOOLEAN_KEYS.has(key)) return value === 'true' || value === 'false' ? value : null;
  if (key in ENUM_VALUES) return ENUM_VALUES[key].includes(value) ? value : null;
  if (key === LOGO_STORAGE_KEY) return value.startsWith('data:image/') ? value : null;
  if (key === LOGO_LIBRARY_KEY) {
    try {
      const list = sanitizeLogoLibrary(JSON.parse(value));
      return JSON.stringify(list);
    } catch {
      return null;
    }
  }
  if (JSON_KEYS.has(key)) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? value : null;
    } catch {
      return null;
    }
  }
  return value;
}

/** Valide un fichier d'export ; lève une erreur si le format est inconnu. */
export function parseSettingsImport(text: string): SettingsValues {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('invalid_json');
  }
  const file = data as Partial<SettingsExportFile> | null;
  if (
    !file ||
    typeof file !== 'object' ||
    file.format !== SETTINGS_EXPORT_FORMAT ||
    typeof file.version !== 'number' ||
    file.version > SETTINGS_EXPORT_VERSION ||
    !file.settings ||
    typeof file.settings !== 'object'
  ) {
    throw new Error('invalid_format');
  }
  const raw = file.settings as Record<string, unknown>;
  const out: SettingsValues = {};
  for (const key of SETTINGS_TRANSFER_KEYS) {
    if (!(key in raw)) continue;
    const v = validValue(key, raw[key]);
    if (v !== null) out[key] = v;
  }
  return out;
}

export function applySettingsValues(
  values: SettingsValues,
  storage: StorageLike = localStorage
): void {
  for (const key of SETTINGS_TRANSFER_KEYS) {
    const v = values[key];
    if (v !== undefined) storage.setItem(key, v);
  }
}
