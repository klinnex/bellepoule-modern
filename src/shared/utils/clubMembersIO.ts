/**
 * BellePoule Modern - Mode Club (membres) : format d'échange CSV / Excel de l'annuaire.
 * En-têtes et libellés en français fixes (indépendants de la langue de l'interface) ;
 * à l'import, les colonnes sont reconnues par leur intitulé (sans accents ni casse).
 * Licensed under GPL-3.0
 */
import type { ClubMember, ClubMemberInput, Laterality } from '../types/club';
import type { Weapon } from '../types';
import { MAX_IMPORT_ROWS, WEAPON_BY_LABEL, WEAPON_FR, normKey, toIsoDate } from './clubInventoryIO';

export const MEMBER_HEADERS = [
  'Nom',
  'Prénom',
  'Licence',
  'Sexe',
  'Date de naissance',
  'Année de naissance',
  'Armes',
  'Latéralité',
  'Catégorie',
  'Actif',
  'Notes',
] as const;

/** Sous-ensemble de ClubMember réellement exporté */
export type ClubMemberExportRow = Pick<
  ClubMember,
  | 'lastName'
  | 'firstName'
  | 'license'
  | 'gender'
  | 'birthDate'
  | 'birthYear'
  | 'weapons'
  | 'laterality'
  | 'category'
  | 'active'
  | 'notes'
>;

const LATERALITY_FR: Record<Laterality, string> = { R: 'Droitier', L: 'Gaucher' };

/** Sexe : codes internes et libellés français acceptés à l'import */
const GENDER_BY_KEY: Record<string, string> = {
  m: 'M',
  homme: 'M',
  h: 'M',
  f: 'F',
  femme: 'F',
  x: 'X',
  mixte: 'X',
};

const LATERALITY_BY_KEY: Record<string, Laterality> = {
  droitier: 'R',
  droite: 'R',
  d: 'R',
  r: 'R',
  gaucher: 'L',
  gauche: 'L',
  g: 'L',
  l: 'L',
};

const ARCHIVED_KEYS = ['non', 'no', 'n', '0', 'false', 'archive'];

/** AAAA-MM-JJ → jj/mm/aaaa (vide si absent ou invalide) */
const dateFr = (iso: string | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** Membres → lignes d'échange : en-têtes puis une ligne par membre */
export function membersToRows(members: readonly ClubMemberExportRow[]): (string | number)[][] {
  return [
    [...MEMBER_HEADERS],
    ...members.map(m => [
      m.lastName ?? '',
      m.firstName ?? '',
      m.license ?? '',
      m.gender ?? '',
      dateFr(m.birthDate),
      m.birthYear ?? '',
      (m.weapons ?? []).map((w: Weapon) => WEAPON_FR[w] ?? w).join(', '),
      m.laterality ? LATERALITY_FR[m.laterality] : '',
      m.category ?? '',
      m.active === false ? 'Non' : 'Oui',
      m.notes ?? '',
    ]),
  ];
}

/** Vrai si la table contient une colonne « Nom » (fichier d'échange ou tableur) */
export function isMemberTable(rows: readonly string[][]): boolean {
  return (rows[0] ?? []).some(h => normKey(h) === 'nom');
}

export interface ClubMemberImportResult {
  /** Membres lus (lignes sans nom ignorées) */
  members: ClubMemberInput[];
  /** Erreur bloquante pour tout le fichier (en-tête absent, trop de lignes) */
  error?: string;
}

/** Lignes lues (en-tête + données) → membres ; colonnes reconnues par leur intitulé */
export function rowsToMembers(rows: readonly string[][]): ClubMemberImportResult {
  const [header, ...data] = rows;
  if (!header) return { members: [], error: 'Fichier vide' };
  if (data.length > MAX_IMPORT_ROWS) {
    return { members: [], error: `Trop de lignes (${MAX_IMPORT_ROWS} maximum)` };
  }
  const col = new Map<string, number>();
  header.forEach((h, i) => {
    const k = normKey(h);
    if (k && !col.has(k)) col.set(k, i);
  });
  if (!col.has(normKey('Nom'))) return { members: [], error: 'Colonne « Nom » absente' };
  const at = (r: readonly string[], name: string): string => {
    const i = col.get(normKey(name));
    return i === undefined ? '' : (r[i] ?? '').trim();
  };

  const members: ClubMemberInput[] = [];
  for (const r of data) {
    const lastName = at(r, 'Nom');
    const firstName = at(r, 'Prénom');
    if (!lastName && !firstName) continue;
    const m: ClubMemberInput = { lastName, firstName, active: true };

    const license = at(r, 'Licence');
    if (license) m.license = license;
    const gender = GENDER_BY_KEY[normKey(at(r, 'Sexe'))];
    if (gender) m.gender = gender;

    const birthDate = toIsoDate(at(r, 'Date de naissance'));
    if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) m.birthDate = birthDate;
    const yearRaw = Number(at(r, 'Année de naissance'));
    const year = m.birthDate
      ? Number(m.birthDate.slice(0, 4))
      : Number.isInteger(yearRaw)
        ? yearRaw
        : NaN;
    if (year >= 1900 && year <= 2100) m.birthYear = year;

    const weapons = at(r, 'Armes')
      .split(/[,;/]/)
      .map(s => WEAPON_BY_LABEL[normKey(s)])
      .filter((w): w is Weapon => w !== undefined);
    if (weapons.length > 0) m.weapons = weapons;

    const laterality = LATERALITY_BY_KEY[normKey(at(r, 'Latéralité'))];
    if (laterality) m.laterality = laterality;

    const category = at(r, 'Catégorie');
    if (category) m.category = category;

    const actif = normKey(at(r, 'Actif'));
    if (actif && ARCHIVED_KEYS.includes(actif)) m.active = false;

    const notes = at(r, 'Notes');
    if (notes) m.notes = notes;

    members.push(m);
  }
  return { members };
}
