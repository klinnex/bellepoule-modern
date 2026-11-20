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

/** Pages sélectionnées (1-indexées, triées, sans doublon), bornées au document ; vide = toutes */
export function expandPageRanges(input: string, total: number): number[] {
  if (!isValidPageRanges(input) || !input.trim()) return [];
  const pages = new Set<number>();
  for (const part of input.split(',')) {
    const [a, b] = part.split('-').map(s => Number(s.trim()));
    const from = a;
    const to = Math.min(b === undefined || Number.isNaN(b) ? a : b, total);
    for (let n = from; n <= to; n++) pages.add(n);
  }
  return [...pages].sort((x, y) => x - y);
}

/** Échelle saisie (texte libre) → valeur bornée 10-200, undefined si vide ou invalide */
export function parseScale(text: string): number | undefined {
  const n = Number(text.trim());
  if (!text.trim() || !Number.isFinite(n)) return undefined;
  return Math.min(200, Math.max(10, Math.round(n)));
}

/** Feuilles de poule : la liste des matchs est présente (bouton « Mise à l'échelle conseillée ») */
export const isPoolSheetHtml = (html: string): boolean => html.includes('class="match-grid');

/** Nombre de feuilles du document : un saut de page explicite entre chaque feuille (#1413) */
export const sheetCount = (html: string): number => html.split('class="pools-export-break"').length;

/** Style d'impression conseillé : matchs une taille au-dessus, liste plus contrastée (#1826) */
export const ADVISED_PRINT_STYLE =
  '<style data-print-advised>' +
  '.match-item{font-size:8.5pt!important;font-weight:600}' +
  '.match-pending{color:#451a03!important;border-left-width:3px!important}' +
  '.match-done{color:#14532d!important;border-left-width:3px!important}' +
  '</style>';

export function withAdvisedStyle(html: string): string {
  const end = html.toLowerCase().lastIndexOf('</head>');
  return end >= 0
    ? html.slice(0, end) + ADVISED_PRINT_STYLE + html.slice(end)
    : ADVISED_PRINT_STYLE + html;
}

/** Plus grande échelle (pas de 5, 30-100 %) dont le rendu tient en `maxPages` pages */
export async function findAdvisedScale(
  countPages: (scale: number) => Promise<number>,
  maxPages: number
): Promise<number> {
  let lo = 6; // 30 %
  let hi = 20; // 100 %
  if ((await countPages(hi * 5)) <= maxPages) return 100;
  let best = lo * 5;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await countPages(mid * 5)) <= maxPages) {
      best = mid * 5;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
