/**
 * BellePoule Modern - Mode Club : inventaire du matériel (achats, garanties, prêts).
 * Fonctions pures partagées par le dépôt, l'interface et les exports.
 * Licensed under GPL-3.0
 */
import type {
  ClubItem,
  ClubItemCategory,
  ClubItemCategoryCustom,
  ClubItemCategoryStandard,
  ClubItemCondition,
  ClubItemInput,
  ClubLoan,
} from '../types/club';
import { Weapon } from '../types';
import { isIsoDate } from './clubStats';

export const ITEM_CATEGORIES: readonly ClubItemCategoryStandard[] = [
  'weapon',
  'blade',
  'mask',
  'jacket',
  'plastron',
  'glove',
  'breeches',
  'cable',
  'electric',
  'bag',
  'other',
];

export const ITEM_CONDITIONS: readonly ClubItemCondition[] = [
  'new',
  'good',
  'worn',
  'damaged',
  'out_of_service',
];

/** Garantie qui expire dans moins de N jours : alerte */
export const WARRANTY_ALERT_DAYS = 90;

const MAX_TEXT = 200;
const MAX_NOTES = 2000;
const MAX_PRICE = 10_000_000;
const MAX_QUANTITY = 999;

/** Date locale AAAA-MM-JJ (pas UTC : un prêt du soir reste le jour même) */
export function localIsoDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const text = (v: unknown, max = MAX_TEXT): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
};

const intIn = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? Math.trunc(v) : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const isItemCategory = (v: unknown): v is ClubItemCategoryStandard =>
  typeof v === 'string' && (ITEM_CATEGORIES as readonly string[]).includes(v);

/** Clé d'une catégorie propre au club : `custom:<id>` */
export const isCustomCategoryKey = (v: unknown): v is ClubItemCategoryCustom =>
  typeof v === 'string' && /^custom:[A-Za-z0-9-]{1,64}$/.test(v);

/** Catégorie standard ou propre au club (l'existence dans le club est vérifiée par le dépôt) */
export const isItemCategoryKey = (v: unknown): v is ClubItemCategory =>
  isItemCategory(v) || isCustomCategoryKey(v);

export const isItemCondition = (v: unknown): v is ClubItemCondition =>
  typeof v === 'string' && (ITEM_CONDITIONS as readonly string[]).includes(v);

const isWeapon = (v: unknown): v is Weapon =>
  typeof v === 'string' && (Object.values(Weapon) as string[]).includes(v);

/**
 * Valide et nettoie une fiche de matériel. Lève une erreur (message en français)
 * si le nom, la date, le prix ou la garantie sont incohérents.
 */
export type NormalizedItemInput = ClubItemInput & {
  quantity: number;
  condition: ClubItemCondition;
  retired: boolean;
};

export function normalizeItemInput(data: Partial<ClubItemInput>): NormalizedItemInput {
  const name = text(data?.name);
  if (!name) throw new Error('Nom du matériel requis');
  const category: ClubItemCategory = isItemCategoryKey(data.category) ? data.category : 'other';

  const purchaseDate = data.purchaseDate ? String(data.purchaseDate) : undefined;
  if (purchaseDate !== undefined && !isIsoDate(purchaseDate)) {
    throw new Error("Date d'achat invalide (AAAA-MM-JJ)");
  }
  const warrantyUntil = data.warrantyUntil ? String(data.warrantyUntil) : undefined;
  if (warrantyUntil !== undefined && !isIsoDate(warrantyUntil)) {
    throw new Error('Date de fin de garantie invalide (AAAA-MM-JJ)');
  }
  if (purchaseDate && warrantyUntil && warrantyUntil < purchaseDate) {
    throw new Error("La garantie ne peut pas finir avant l'achat");
  }

  let purchasePrice: number | undefined;
  if (data.purchasePrice !== undefined && data.purchasePrice !== null) {
    const p = Number(data.purchasePrice);
    if (!Number.isFinite(p) || p < 0 || p > MAX_PRICE) {
      throw new Error("Prix d'achat invalide");
    }
    purchasePrice = Math.round(p * 100) / 100;
  }

  return {
    name,
    category,
    brand: text(data.brand),
    model: text(data.model),
    serialNumber: text(data.serialNumber),
    weapon: isWeapon(data.weapon) ? data.weapon : undefined,
    size: text(data.size, 40),
    color: text(data.color, 40),
    quantity: intIn(data.quantity, 1, MAX_QUANTITY, 1),
    purchaseDate: purchaseDate || undefined,
    purchasePrice,
    supplier: text(data.supplier),
    invoiceRef: text(data.invoiceRef, 80),
    invoicePdf: pdfDataUrl(data.invoicePdf),
    image: imageDataUrl(data.image),
    warrantyUntil: warrantyUntil || undefined,
    condition: isItemCondition(data.condition) ? data.condition : 'good',
    location: text(data.location),
    notes: text(data.notes, MAX_NOTES),
    retired: data.retired === true,
  };
}

/** Ajout en série : nombre maximal de fiches créées d'un coup */
export const MAX_SERIES = 200;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Noms d'une série « Base-01 … Base-NN » sans doublon dans le club (casse ignorée).
 * La numérotation reprend après le plus grand suffixe existant (« Plastron-07 » → 08) ;
 * deux chiffres minimum, davantage si la série dépasse 99.
 */
export function seriesNames(base: string, count: number, existing: readonly string[]): string[] {
  const root = base
    .trim()
    .replace(/-\d+$/, '')
    .trim()
    .slice(0, MAX_TEXT - 6);
  if (!root) throw new Error('Nom du matériel requis');
  const n = intIn(count, 1, MAX_SERIES, 1);
  const taken = new Set(existing.map(x => x.trim().toLowerCase()));
  const re = new RegExp(`^${escapeRegExp(root.toLowerCase())}-(\\d+)$`);
  let next = 1;
  for (const name of taken) {
    const m = re.exec(name);
    if (m) next = Math.max(next, Number(m[1]) + 1);
  }
  const width = Math.max(2, String(next + n - 1).length);
  const out: string[] = [];
  while (out.length < n) {
    const name = `${root}-${String(next++).padStart(width, '0')}`;
    if (!taken.has(name.toLowerCase())) out.push(name);
  }
  return out;
}

/** Quantité prêtable : valeur bornée à 1..999 */
export const normalizeQuantity = (v: unknown): number => intIn(v, 1, MAX_QUANTITY, 1);

/** Prêt en cours et échéance dépassée (échéance = jour inclus, retard dès le lendemain) */
export function isLoanOverdue(
  loan: Pick<ClubLoan, 'dueDate' | 'returnedAt'>,
  today: string = localIsoDate()
): boolean {
  return !loan.returnedAt && !!loan.dueDate && loan.dueDate < today;
}

/** Garantie encore valable mais expirant dans les WARRANTY_ALERT_DAYS jours */
export function isWarrantyAlert(warrantyUntil: string | undefined, today: string): boolean {
  if (!warrantyUntil || !isIsoDate(warrantyUntil)) return false;
  if (warrantyUntil < today) return false;
  const limit = addDays(today, WARRANTY_ALERT_DAYS);
  return warrantyUntil <= limit;
}

/** Ajoute des jours à une date AAAA-MM-JJ (calcul en UTC pour éviter les décalages) */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface InventorySummary {
  /** Lignes de matériel (hors réformés) */
  lines: number;
  /** Exemplaires possédés (hors réformés) */
  units: number;
  /** Exemplaires actuellement prêtés */
  lentUnits: number;
  /** Valeur d'achat cumulée (prix × quantité, hors réformés) */
  value: number;
  /** Matériel ayant un prix d'achat renseigné */
  valued: number;
  /** Prêts en cours dont l'échéance est dépassée */
  overdueLoans: number;
  /** Garanties qui expirent sous WARRANTY_ALERT_DAYS jours */
  warrantyAlerts: number;
  /** Exemplaires par catégorie (hors réformés) */
  byCategory: Record<string, number>;
}

/** Synthèse de l'inventaire à partir des fiches et des prêts en cours */
export function computeInventorySummary(
  items: ClubItem[],
  openLoans: Pick<ClubLoan, 'quantity' | 'dueDate' | 'returnedAt'>[],
  today: string = localIsoDate()
): InventorySummary {
  const active = items.filter(i => !i.retired);
  const byCategory: Record<string, number> = {};
  let units = 0;
  let value = 0;
  let valued = 0;
  for (const i of active) {
    units += i.quantity;
    byCategory[i.category] = (byCategory[i.category] ?? 0) + i.quantity;
    if (i.purchasePrice !== undefined) {
      value += i.purchasePrice * i.quantity;
      valued += 1;
    }
  }
  return {
    lines: active.length,
    units,
    lentUnits: openLoans.reduce((s, l) => s + (l.returnedAt ? 0 : l.quantity), 0),
    value: Math.round(value * 100) / 100,
    valued,
    overdueLoans: openLoans.filter(l => isLoanOverdue(l, today)).length,
    warrantyAlerts: active.filter(i => isWarrantyAlert(i.warrantyUntil, today)).length,
    byCategory,
  };
}

/** Cellule CSV : guillemets si besoin, nombres avec virgule décimale */
const csvCell = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV compatible tableur français (séparateur « ; », BOM UTF-8 pour Excel).
 * Les en-têtes et les lignes sont fournis déjà traduits par l'appelant.
 */
export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/** Facture PDF : data URL base64 application/pdf, 5 Mo max ; sinon undefined */
export const MAX_INVOICE_PDF_BYTES = 5 * 1024 * 1024;
const PDF_PREFIX = 'data:application/pdf;base64,';
/** Photo du matériel : JPEG ou PNG en data URL (2 Mo max une fois encodée) */
export const MAX_IMAGE_DATA_BYTES = 2 * 1024 * 1024;
/** Hauteur maximale de la photo stockée (720p) */
export const MAX_IMAGE_HEIGHT = 720;
const IMAGE_PREFIXES = ['data:image/jpeg;base64,', 'data:image/png;base64,'];

export function imageDataUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const prefix = IMAGE_PREFIXES.find(p => v.startsWith(p));
  if (!prefix) return undefined;
  return v.length - prefix.length > 0 && v.length <= MAX_IMAGE_DATA_BYTES * 1.4 + prefix.length
    ? v
    : undefined;
}

export function pdfDataUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.startsWith(PDF_PREFIX)) return undefined;
  const b64Length = v.length - PDF_PREFIX.length;
  if (b64Length <= 0 || b64Length > Math.ceil((MAX_INVOICE_PDF_BYTES * 4) / 3) + 4)
    return undefined;
  return v;
}
