/**
 * BellePoule Modern - Boîte d'impression intégrée : réglages et conversion (#1214, étape 1)
 * Validation des réglages venant du renderer, plages de pages « 1-3, 5 », options Electron.
 * Licensed under GPL-3.0
 */

/** `auto` = format et orientation définis par le document (@page) */
export type PrintPaperSize = 'auto' | 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal';
export type PrintOrientation = 'auto' | 'portrait' | 'landscape';
export type PrintDuplex = 'simplex' | 'shortEdge' | 'longEdge';
export type PrintMargins = 'default' | 'none' | 'minimum';

export interface PrintSettings {
  /** Nom de l'imprimante (vide = imprimante par défaut) */
  printer: string;
  copies: number;
  /** Plages saisies (« 1-3, 5 »), vide = toutes les pages */
  pages: string;
  orientation: PrintOrientation;
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
  orientation: 'auto',
  paperSize: 'auto',
  color: true,
  duplex: 'simplex',
  margins: 'default',
  scale: 100,
};

const ORIENTATIONS: readonly PrintOrientation[] = ['auto', 'portrait', 'landscape'];
const PAPER_SIZES: readonly PrintPaperSize[] = ['auto', 'A3', 'A4', 'A5', 'Letter', 'Legal'];
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
    orientation: ORIENTATIONS.includes(raw.orientation as PrintOrientation)
      ? (raw.orientation as PrintOrientation)
      : d.orientation,
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

/** Le document décide du format (@page) tant que ni papier ni orientation ne sont imposés */
const followsDocument = (s: PrintSettings) => s.paperSize === 'auto' && s.orientation === 'auto';

/** Options de `webContents.printToPDF` (aperçu et export PDF) */
export function buildPdfOptions(s: PrintSettings) {
  // « Par défaut » : marges du document lui-même tant qu'il décide du format
  const m = s.margins === 'default' && followsDocument(s) ? 0 : MARGIN_INCHES[s.margins];
  return {
    printBackground: true,
    landscape: s.orientation === 'landscape',
    pageSize: s.paperSize === 'auto' ? 'A4' : s.paperSize,
    preferCSSPageSize: followsDocument(s),
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
    landscape: s.orientation === 'landscape',
    scaleFactor: s.scale,
    duplexMode: s.duplex,
    // Electron : pages 0-indexées
    ...(ranges.length ? { pageRanges: ranges.map(r => ({ from: r.from - 1, to: r.to - 1 })) } : {}),
    ...(s.paperSize === 'auto' ? {} : { pageSize: s.paperSize }),
    margins: {
      marginType: s.margins === 'none' ? ('none' as const) : ('default' as const),
    },
  };
}
