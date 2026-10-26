/**
 * BellePoule Modern - Boîte d'impression intégrée : réglages et conversion (#1214, étape 1)
 * Validation des réglages venant du renderer, plages de pages « 1-3, 5 », options Electron.
 * Licensed under GPL-3.0
 */

export type PrintPaperSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal';
export type PrintDuplex = 'simplex' | 'shortEdge' | 'longEdge';
export type PrintMargins = 'default' | 'none' | 'minimum';

export interface PrintSettings {
  /** Nom de l'imprimante (vide = imprimante par défaut) */
  printer: string;
  copies: number;
  /** Plages saisies (« 1-3, 5 »), vide = toutes les pages */
  pages: string;
  landscape: boolean;
  paperSize: PrintPaperSize;
  color: boolean;
  duplex: PrintDuplex;
  margins: PrintMargins;
  /** Échelle en % (10-200) */
  scale: number;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  printer: '',
  copies: 1,
  pages: '',
  landscape: false,
  paperSize: 'A4',
  color: true,
  duplex: 'simplex',
  margins: 'default',
  scale: 100,
};

const PAPER_SIZES: readonly PrintPaperSize[] = ['A3', 'A4', 'A5', 'Letter', 'Legal'];
const DUPLEX_MODES: readonly PrintDuplex[] = ['simplex', 'shortEdge', 'longEdge'];
const MARGIN_MODES: readonly PrintMargins[] = ['default', 'none', 'minimum'];

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Réglages reçus du renderer (non fiables) → réglages valides, valeurs par défaut sinon */
export function normalizePrintSettings(input: unknown): PrintSettings {
  const d = DEFAULT_PRINT_SETTINGS;
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const pages = typeof raw.pages === 'string' ? raw.pages.trim().slice(0, 200) : d.pages;
  return {
    printer: typeof raw.printer === 'string' ? raw.printer.slice(0, 256) : d.printer,
    copies: clampInt(raw.copies, 1, 99, d.copies),
    pages: parsePageRanges(pages) ? pages : d.pages,
    landscape: typeof raw.landscape === 'boolean' ? raw.landscape : d.landscape,
    paperSize: PAPER_SIZES.includes(raw.paperSize as PrintPaperSize)
      ? (raw.paperSize as PrintPaperSize)
      : d.paperSize,
    color: typeof raw.color === 'boolean' ? raw.color : d.color,
    duplex: DUPLEX_MODES.includes(raw.duplex as PrintDuplex)
      ? (raw.duplex as PrintDuplex)
      : d.duplex,
    margins: MARGIN_MODES.includes(raw.margins as PrintMargins)
      ? (raw.margins as PrintMargins)
      : d.margins,
    scale: clampInt(raw.scale, 10, 200, d.scale),
  };
}

export interface PageRange {
  /** 1-indexé, inclus */
  from: number;
  to: number;
}

/**
 * « 1-3, 5 » → [{1,3},{5,5}] ; vide → [] (toutes les pages) ; syntaxe invalide → null.
 * Les plages sont triées et fusionnées (« 1-3, 2-5 » → 1-5).
 */
export function parsePageRanges(input: string): PageRange[] | null {
  const text = input.trim();
  if (!text) return [];
  const ranges: PageRange[] = [];
  for (const part of text.split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to < from) return null;
    ranges.push({ from, to });
  }
  ranges.sort((a, b) => a.from - b.from);
  const merged: PageRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }
  return merged;
}

/** Plages au format printToPDF (« 1-3, 5 », 1-indexé) */
export function pageRangesToPdfString(ranges: PageRange[]): string {
  return ranges.map(r => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`)).join(', ');
}

const MARGIN_INCHES: Record<PrintMargins, number> = { default: 0.4, none: 0, minimum: 0.2 };

/** Options de `webContents.printToPDF` (aperçu et export PDF) */
export function buildPdfOptions(s: PrintSettings) {
  const m = MARGIN_INCHES[s.margins];
  return {
    printBackground: true,
    landscape: s.landscape,
    pageSize: s.paperSize,
    // Les marges CSS (@page) du document priment quand il en définit
    preferCSSPageSize: true,
    scale: s.scale / 100,
    margins: { top: m, bottom: m, left: m, right: m },
  };
}

/** Options de `webContents.print` (impression directe sur l'imprimante choisie) */
export function buildPrintOptions(s: PrintSettings) {
  const ranges = parsePageRanges(s.pages) ?? [];
  return {
    silent: true,
    printBackground: true,
    ...(s.printer ? { deviceName: s.printer } : {}),
    copies: s.copies,
    color: s.color,
    landscape: s.landscape,
    scaleFactor: s.scale,
    duplexMode: s.duplex,
    // Electron : pages 0-indexées
    ...(ranges.length ? { pageRanges: ranges.map(r => ({ from: r.from - 1, to: r.to - 1 })) } : {}),
    pageSize: s.paperSize,
    margins: {
      marginType: s.margins === 'none' ? ('none' as const) : ('default' as const),
    },
  };
}
