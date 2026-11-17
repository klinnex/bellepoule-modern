/**
 * BellePoule Modern - Mode Club (inventaire) : colonnes affichables du tableau du matériel.
 * Le nom est toujours affiché ; le choix est mémorisé sur le poste (localStorage).
 * Licensed under GPL-3.0
 */
import React from 'react';
import type { ClubItem, ClubItemCategory } from '../../../shared/types/club';
import { isWarrantyAlert } from '../../../shared/utils/clubInventory';
import { weaponLabel } from '../../../shared/utils/categoryLabel';

type TFn = (key: string, params?: Record<string, string | number>) => string;

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

export const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'EUR' });

export const INVENTORY_COLUMNS = [
  'category',
  'weapon',
  'brand',
  'model',
  'serial',
  'size',
  'color',
  'quantity',
  'condition',
  'location',
  'purchase',
  'supplier',
  'invoice',
  'warranty',
  'notes',
] as const;

export type InventoryColumn = (typeof INVENTORY_COLUMNS)[number];

/** Colonnes visibles par défaut (affichage historique) */
export const DEFAULT_INVENTORY_COLUMNS: readonly InventoryColumn[] = [
  'category',
  'quantity',
  'condition',
  'location',
  'purchase',
  'warranty',
];

/** Clé de libellé (clubInventory.*) de chaque colonne */
export const INVENTORY_COLUMN_LABEL: Record<InventoryColumn, string> = {
  category: 'clubInventory.category',
  weapon: 'clubInventory.weapon',
  brand: 'clubInventory.brand',
  model: 'clubInventory.model',
  serial: 'clubInventory.serial',
  size: 'clubInventory.size',
  color: 'clubInventory.color',
  quantity: 'clubInventory.quantity',
  condition: 'clubInventory.condition',
  location: 'clubInventory.location',
  purchase: 'clubInventory.purchase',
  supplier: 'clubInventory.supplier',
  invoice: 'clubInventory.invoice',
  warranty: 'clubInventory.warranty_until',
  notes: 'clubInventory.notes',
};

export const INVENTORY_COLUMNS_KEY = 'bp_club_inventory_columns';

const isColumn = (v: unknown): v is InventoryColumn =>
  typeof v === 'string' && (INVENTORY_COLUMNS as readonly string[]).includes(v);

/** Colonnes mémorisées (ordre canonique) ; valeurs par défaut si absentes ou illisibles */
export function loadInventoryColumns(): Set<InventoryColumn> {
  try {
    const raw = localStorage.getItem(INVENTORY_COLUMNS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter(isColumn));
    }
  } catch {
    /* stockage indisponible */
  }
  return new Set(DEFAULT_INVENTORY_COLUMNS);
}

export function saveInventoryColumns(cols: Set<InventoryColumn>): void {
  try {
    localStorage.setItem(
      INVENTORY_COLUMNS_KEY,
      JSON.stringify(INVENTORY_COLUMNS.filter(c => cols.has(c)))
    );
  } catch {
    /* stockage indisponible */
  }
}

export interface CellContext {
  t: TFn;
  /** Colonnes affichées : arme sous la catégorie si sa colonne est masquée */
  cols: Set<InventoryColumn>;
  today: string;
  labelOf: (c: ClubItemCategory) => string;
}

/** Contenu de la cellule `c` du matériel `i` */
export function inventoryCell(
  i: ClubItem,
  c: InventoryColumn,
  { t, cols, today, labelOf }: CellContext
): React.ReactNode {
  switch (c) {
    case 'category':
      return (
        <>
          {labelOf(i.category)}
          {i.weapon && !cols.has('weapon') && (
            <div className="club-muted">{weaponLabel(i.weapon, t)}</div>
          )}
        </>
      );
    case 'weapon':
      return i.weapon ? weaponLabel(i.weapon, t) : '';
    case 'brand':
      return i.brand ?? '';
    case 'model':
      return i.model ?? '';
    case 'serial':
      return i.serialNumber ?? '';
    case 'size':
      return i.size ?? '';
    case 'color':
      return i.color ?? '';
    case 'quantity':
      return (
        <>
          {i.quantity}
          {i.lentQuantity > 0 && (
            <div className="club-muted">{t('clubInventory.lent_short', { n: i.lentQuantity })}</div>
          )}
        </>
      );
    case 'condition':
      return t(`clubInventory.cond_${i.condition}`);
    case 'location':
      return i.location ?? '';
    case 'purchase':
      return (
        <>
          {fmtDate(i.purchaseDate)}
          {i.purchasePrice !== undefined && (
            <div className="club-muted">{fmtMoney(i.purchasePrice)}</div>
          )}
        </>
      );
    case 'supplier':
      return i.supplier ?? '';
    case 'invoice':
      return i.invoiceRef ?? '';
    case 'warranty':
      return (
        <>
          {fmtDate(i.warrantyUntil)}
          {isWarrantyAlert(i.warrantyUntil, today) && (
            <span className="club-badge club-badge--warn">{t('clubInventory.warranty_soon')}</span>
          )}
        </>
      );
    case 'notes':
      return i.notes ?? '';
  }
}
