/**
 * BellePoule Modern - Mode Club (inventaire) : format d'échange CSV / Excel.
 * En-têtes et libellés en français fixes (indépendants de la langue de l'interface) ;
 * à l'import, codes internes et libellés français sont tous acceptés.
 * Licensed under GPL-3.0
 */
import type {
  ClubItem,
  ClubItemCategory,
  ClubItemCategoryCustom,
  ClubItemCondition,
  ClubItemInput,
} from '../types/club';
import { Weapon } from '../types';
import { isItemCategoryKey, normalizeItemInput } from './clubInventory';

/** Nombre maximal de lignes importées d'un coup */
export const MAX_IMPORT_ROWS = 2000;

export const INVENTORY_HEADERS = [
  'Nom',
  'Catégorie',
  'Arme',
  'Marque',
  'Modèle',
  'N° de série',
  'Taille',
  'Couleur',
  'Quantité',
  'Exemplaires prêtés',
  'État',
  'Emplacement',
  "Date d'achat",
  "Prix d'achat (€)",
  'Fournisseur',
  'Facture',
  'Fin de garantie',
  'Réformé',
  'Notes',
] as const;

const CATEGORY_FR: Record<ClubItemCategory, string> = {
  weapon: 'Arme',
  blade: 'Lame',
  mask: 'Masque',
  jacket: 'Veste',
  plastron: 'Plastron',
  glove: 'Gant',
  breeches: 'Culotte',
  cable: 'Câble',
  electric: 'Électrique',
  bag: 'Sac',
  other: 'Autre',
};

const CONDITION_FR: Record<ClubItemCondition, string> = {
  new: 'Neuf',
  good: 'Bon état',
  worn: 'Usé',
  damaged: 'Abîmé',
  out_of_service: 'Hors service',
};

export const WEAPON_FR: Record<Weapon, string> = {
  [Weapon.FOIL]: 'Fleuret',
  [Weapon.EPEE]: 'Épée',
  [Weapon.SABRE]: 'Sabre',
  [Weapon.LASER]: 'Sabre Laser',
  [Weapon.CUSTOM]: 'À la carte',
};

/** Clé de comparaison : sans accents, minuscules, alphanumérique seulement */
export const normKey = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const EXCHANGE_KEYS = (labels: Record<string, string>) =>
  Object.fromEntries(Object.entries(labels).map(([code, label]) => [normKey(label), code]));

const CATEGORY_BY_LABEL = EXCHANGE_KEYS(CATEGORY_FR);
const CONDITION_BY_LABEL = EXCHANGE_KEYS(CONDITION_FR);
export const WEAPON_BY_LABEL: Record<string, Weapon> = {
  ...Object.fromEntries(
    Object.entries(WEAPON_FR).map(([code, label]) => [normKey(label), code as Weapon])
  ),
  e: Weapon.EPEE,
  f: Weapon.FOIL,
  s: Weapon.SABRE,
  l: Weapon.LASER,
  c: Weapon.CUSTOM,
};

const cell = (v: string | number | undefined | null): string | number =>
  v === undefined || v === null ? '' : v;

/** Lignes d'échange : en-têtes puis une ligne par fiche (valeurs brutes, dates ISO) */
/** Libellés des catégories du club (clé `custom:<id>` → nom), écrits tels quels à l'export */
export function itemsToRows(
  items: ClubItem[],
  customLabels: Record<string, string> = {}
): (string | number)[][] {
  return [
    [...INVENTORY_HEADERS],
    ...items.map(i => [
      i.name,
      CATEGORY_FR[i.category as keyof typeof CATEGORY_FR] ??
        customLabels[i.category] ??
        CATEGORY_FR.other,
      i.weapon ? WEAPON_FR[i.weapon] : '',
      cell(i.brand),
      cell(i.model),
      cell(i.serialNumber),
      cell(i.size),
      cell(i.color),
      i.quantity,
      i.lentQuantity,
      CONDITION_FR[i.condition] ?? CONDITION_FR.good,
      cell(i.location),
      cell(i.purchaseDate),
      cell(i.purchasePrice),
      cell(i.supplier),
      cell(i.invoiceRef),
      cell(i.warrantyUntil),
      i.retired ? 'Oui' : 'Non',
      cell(i.notes),
    ]),
  ];
}

/** CSV : séparateur « ; » (Excel français), lignes ouvertes par un BOM */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      // Guillemet d'ouverture (espaces avant ignorés)
      field = '';
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

/** Date AAAA-MM-JJ ou numéro de série Excel (jours depuis le 30/12/1899) → AAAA-MM-JJ */
export function toIsoDate(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v));
    if (serial > 0 && serial < 100000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    }
  }
  return v;
}

const yes = (v: string) => ['oui', 'yes', 'x', '1', 'true', 'o', 'y'].includes(normKey(v));

/** Libellé français, code interne ou nom d'une catégorie du club → clé de catégorie */
const categoryOf = (
  raw: string,
  customKeys: Map<string, ClubItemCategoryCustom>
): ClubItemCategory => {
  const k = normKey(raw);
  if (!k) return 'other';
  const byLabel = CATEGORY_BY_LABEL[k];
  if (byLabel) return byLabel as ClubItemCategory;
  const custom = customKeys.get(k);
  if (custom) return custom;
  return isItemCategoryKey(raw.trim()) ? (raw.trim() as ClubItemCategory) : 'other';
};

/** Prix : « 12,5 » ou « 12.5 » ; vide = absent */
const price = (v: string): number | undefined => {
  const t = v.replace(/\s/g, '').replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`Prix invalide : « ${v} »`);
  return n;
};

export interface InventoryImportError {
  /** Numéro de ligne dans le fichier (en-tête = 1) */
  line: number;
  message: string;
}

export interface InventoryImportResult {
  items: ClubItemInput[];
  errors: InventoryImportError[];
}

/**
 * Lignes lues (en-tête + données) → fiches valides et erreurs par ligne.
 * La colonne « Nom » est obligatoire ; les autres colonnes sont optionnelles et
 * reconnues par leur intitulé (sans accents ni casse).
 */
/**
 * `customKeys` : nom normalisé d'une catégorie du club → clé `custom:<id>`. Une catégorie
 * inconnue est rangée dans « Autre ».
 */
export function rowsToItems(
  rows: string[][],
  customKeys: Map<string, ClubItemCategoryCustom> = new Map()
): InventoryImportResult {
  const [header, ...data] = rows;
  if (!header) return { items: [], errors: [{ line: 1, message: 'Fichier vide' }] };
  if (data.length > MAX_IMPORT_ROWS) {
    return {
      items: [],
      errors: [{ line: 1, message: `Trop de lignes (${MAX_IMPORT_ROWS} maximum)` }],
    };
  }
  const col = new Map<string, number>();
  header.forEach((h, i) => {
    const k = normKey(h);
    if (k && !col.has(k)) col.set(k, i);
  });
  const at = (r: string[], name: string): string => {
    const i = col.get(normKey(name));
    return i === undefined ? '' : (r[i] ?? '').trim();
  };
  if (!col.has(normKey('Nom'))) {
    return { items: [], errors: [{ line: 1, message: 'Colonne « Nom » absente' }] };
  }

  const items: ClubItemInput[] = [];
  const errors: InventoryImportError[] = [];
  data.forEach((r, idx) => {
    const line = idx + 2;
    try {
      const catRaw = at(r, 'Catégorie');
      const condRaw = at(r, 'État');
      const weaponRaw = at(r, 'Arme');
      const quantity = at(r, 'Quantité');
      items.push(
        normalizeItemInput({
          name: at(r, 'Nom'),
          category: categoryOf(catRaw, customKeys),
          weapon: weaponRaw ? WEAPON_BY_LABEL[normKey(weaponRaw)] : undefined,
          brand: at(r, 'Marque'),
          model: at(r, 'Modèle'),
          serialNumber: at(r, 'N° de série'),
          size: at(r, 'Taille'),
          color: at(r, 'Couleur'),
          quantity: quantity ? Number(quantity) : undefined,
          condition: (CONDITION_BY_LABEL[normKey(condRaw)] ?? 'good') as ClubItemCondition,
          location: at(r, 'Emplacement'),
          purchaseDate: toIsoDate(at(r, "Date d'achat")),
          purchasePrice: price(at(r, "Prix d'achat (€)") || at(r, "Prix d'achat")),
          supplier: at(r, 'Fournisseur'),
          invoiceRef: at(r, 'Facture'),
          warrantyUntil: toIsoDate(at(r, 'Fin de garantie')),
          retired: yes(at(r, 'Réformé')),
          notes: at(r, 'Notes'),
        })
      );
    } catch (e) {
      if (r.some(v => v.trim() !== '')) {
        errors.push({ line, message: e instanceof Error ? e.message : String(e) });
      }
    }
  });
  return { items, errors };
}
