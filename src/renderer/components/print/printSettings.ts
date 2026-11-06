/**
 * BellePoule Modern - Boîte d'impression intégrée : réglages côté renderer (#1214)
 * Valeurs par défaut, validation des plages de pages, mémorisation du dernier choix.
 * Licensed under GPL-3.0
 */

import type { PrintDialogSettings } from '../../../shared/types/preload';

export const PRINT_SETTINGS_KEY = 'bellepoule-print-settings';

export const DEFAULT_SETTINGS: PrintDialogSettings = {
  printer: '',
  copies: 1,
  pages: '',
  orientation: 'auto',
  paperSize: 'auto',
  color: true,
  duplex: 'simplex',
  margins: 'default',
  scale: 100,
};

/** « 1-3, 5 » (ou vide = toutes les pages) */
export const isValidPageRanges = (input: string): boolean => {
  const text = input.trim();
  if (!text) return true;
  return text.split(',').every(part => {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) return false;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    return from >= 1 && to >= from;
  });
};

/** Une plage commence après la dernière page du document */
export const pageRangesBeyond = (input: string, total: number): boolean =>
  total > 0 &&
  isValidPageRanges(input) &&
  input
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .some(p => Number(p.split('-')[0]) > total);

/** Dernier choix de réglages, sans imprimante ni plage de pages (propres à chaque impression) */
export function loadSettings(): PrintDialogSettings {
  try {
    const raw = localStorage.getItem(PRINT_SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PrintDialogSettings>;
      return { ...DEFAULT_SETTINGS, ...saved, pages: '' };
    }
  } catch {
    /* stockage indisponible ou corrompu : valeurs par défaut */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: PrintDialogSettings): void {
  try {
    localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify({ ...settings, pages: '' }));
  } catch {
    /* ignore */
  }
}
