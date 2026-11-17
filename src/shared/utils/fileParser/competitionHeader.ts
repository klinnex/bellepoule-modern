/**
 * BellePoule Modern - File Parser - En-tête de compétition des fichiers fédéraux (#1938)
 * Licensed under GPL-3.0
 *
 * Élément racine du XML FFE / FIE (spécification FIE « Définition des fichiers XML » v3.1,
 * plus les ajouts FFE / Engarde / BellePoule : Type, DateDebut, DateFin, DateFichierXML,
 * Appel, Scratch, Debut, Lieu). Les valeurs brutes sont conservées telles quelles pour être
 * restituées à l'export ; la correspondance avec les énumérations de l'application est à part.
 */

import { Category, FederalCompetitionInfo, Gender, Weapon } from '../../types';
import { attrReader } from './common';

const ROOT_RE =
  /<(BaseCompetitionIndividuelle|BaseCompetitionParEquipes|CompetitionIndividuelle|CompetitionParEquipes?)(?=[\s/>])[^>]*>/;

/** Champs de la fenêtre « Nouvelle compétition » déduits de l'en-tête */
export interface MappedCompetitionFields {
  title?: string;
  /** Date au format AAAA-MM-JJ (champ date du formulaire) */
  date?: string;
  weapon?: Weapon;
  gender?: Gender;
  category?: Category;
  location?: string;
  organizer?: string;
  isTeamEvent: boolean;
  checkInTime?: string;
  scratchTime?: string;
  startTime?: string;
}

/** Code d'avertissement (traduit par l'interface) */
export interface HeaderNotice {
  code: 'unknownWeapon' | 'unknownGender' | 'unknownCategory' | 'invalidDate';
  value: string;
}

export interface CompetitionHeader {
  /** Valeurs brutes, à conserver et restituer */
  federal: FederalCompetitionInfo;
  fields: MappedCompetitionFields;
  notices: HeaderNotice[];
}

const CATEGORY_CODES: Record<string, Category> = {
  M9: Category.U9,
  M11: Category.U11,
  M13: Category.U13,
  M15: Category.U15,
  M17: Category.U17,
  M20: Category.U20,
  U9: Category.U9,
  U11: Category.U11,
  U13: Category.U13,
  U15: Category.U15,
  U17: Category.U17,
  U20: Category.U20,
  C: Category.U17, // FIE : cadet
  CADET: Category.U17,
  J: Category.U20, // FIE : junior
  JUNIOR: Category.U20,
  S: Category.SENIOR,
  SEN: Category.SENIOR,
  SENIOR: Category.SENIOR,
  SENIORS: Category.SENIOR,
  V1: Category.V1,
  V2: Category.V2,
  V3: Category.V3,
  V4: Category.V4,
};

export function mapFederalCategory(raw: string): Category | undefined {
  return CATEGORY_CODES[raw.trim().toUpperCase().replace(/\s+/g, '')];
}

export function mapFederalWeapon(raw: string): Weapon | undefined {
  const code = raw.trim().toUpperCase();
  if (code === 'E') return Weapon.EPEE;
  if (code === 'F') return Weapon.FOIL;
  if (code === 'S') return Weapon.SABRE;
  return undefined;
}

export function mapFederalGender(raw: string): Gender | undefined {
  const code = raw.trim().toUpperCase();
  if (code === 'M' || code === 'H') return Gender.MALE;
  if (code === 'F' || code === 'D') return Gender.FEMALE;
  if (code === 'X') return Gender.MIXED;
  return undefined;
}

/** jj.mm.aaaa → AAAA-MM-JJ ; undefined si invalide */
export function federalDateToIso(raw: string): string | undefined {
  const m = raw.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return undefined;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return undefined;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Heure H:MM, HhMM ou HH:MM → HH:MM ; undefined si vide ou invalide */
export function normalizeFederalTime(raw: string): string | undefined {
  const m = raw.trim().match(/^(\d{1,2})\s*[:hH.]\s*(\d{2})$/);
  if (!m) return undefined;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Lit l'en-tête de compétition d'un fichier XML ; null si aucun élément racine connu */
export function parseCompetitionHeader(content: string): CompetitionHeader | null {
  const root = content.match(ROOT_RE);
  if (!root) return null;
  const get = attrReader(root[0]);
  const opt = (attr: string) => get(attr) || undefined;

  const type = get('Type').toUpperCase();
  const isTeamEvent = type === 'E' || (type !== 'I' && /ParEquipe/.test(root[1]));

  const federal: FederalCompetitionInfo = {
    id: opt('ID'),
    season: opt('Annee'),
    championship: opt('Championnat'),
    federation: opt('Federation'),
    domain: opt('Domaine'),
    weapon: opt('Arme'),
    gender: opt('Sexe'),
    category: opt('Categorie'),
    date: opt('Date'),
    dateStart: opt('DateDebut'),
    dateEnd: opt('DateFin'),
    fileDate: opt('DateFichierXML'),
    type: isTeamEvent ? 'E' : 'I',
    title: opt('TitreLong'),
    shortTitle: opt('TitreCourt') ?? opt('Titre'),
    location: opt('Lieu'),
    organizer: opt('Organisateur'),
    organizerUrl: opt('URLorganisateur'),
  };

  const notices: HeaderNotice[] = [];
  const weapon = federal.weapon ? mapFederalWeapon(federal.weapon) : undefined;
  if (federal.weapon && !weapon) notices.push({ code: 'unknownWeapon', value: federal.weapon });
  const gender = federal.gender ? mapFederalGender(federal.gender) : undefined;
  if (federal.gender && !gender) notices.push({ code: 'unknownGender', value: federal.gender });
  const category = federal.category ? mapFederalCategory(federal.category) : undefined;
  if (federal.category && !category)
    notices.push({ code: 'unknownCategory', value: federal.category });
  const rawDate = federal.dateStart ?? federal.date;
  const date = rawDate ? federalDateToIso(rawDate) : undefined;
  if (rawDate && !date) notices.push({ code: 'invalidDate', value: rawDate });

  const fields: MappedCompetitionFields = {
    title: federal.title ?? federal.shortTitle,
    date,
    weapon,
    gender,
    category,
    location: federal.location,
    organizer: federal.organizer,
    isTeamEvent,
    checkInTime: normalizeFederalTime(get('Appel')),
    scratchTime: normalizeFederalTime(get('Scratch')),
    startTime: normalizeFederalTime(get('Debut')),
  };

  return { federal, fields, notices };
}

/**
 * Repli quand il n'y a pas d'en-tête XML : code arme / sexe / catégorie du nom de fichier
 * de l'extranet (ex. « EngardeFHM15.FFF » = fleuret hommes M15, « FDSENIOR »).
 */
export function guessFieldsFromFileName(name: string): Partial<MappedCompetitionFields> {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const m = base.match(/([EFS])([HDMF])(M\d{1,2}|U\d{1,2}|SENIORS?|V[1-4])(?:_|-|$)/i);
  if (!m) return {};
  return {
    weapon: mapFederalWeapon(m[1]),
    gender: mapFederalGender(m[2]),
    category: mapFederalCategory(m[3]),
  };
}
