/**
 * BellePoule Modern - Tournoi des rapières : import des équipes (#1211)
 * Export d'inscriptions (CSV « ; » ou XLSX converti en CSV par le processus principal),
 * une ligne par équipe : colonnes D/E (nom/prénom tireur 1), Q (naissance tireur 1),
 * T/U (nom/prénom tireur 2), V (naissance tireur 2), Y (nom d'équipe),
 * R / W (sexe tireur 1 / 2, « homme/femme »).
 * Licensed under GPL-3.0
 */

import { RapieresAgeCategory, RapieresFencer, RapieresGender } from './rapieres.types';
import { rapieresCategoryFromBirthYear } from './rapieresAge';
import { RapieresTeamDraft } from './RapieresTeamModal';

/** Colonnes (index base 0) : D=3, E=4, Q=16, R=17, T=19, U=20, V=21, W=22, Y=24 */
const COL = {
  last1: 3,
  first1: 4,
  birth1: 16,
  gender1: 17,
  last2: 19,
  first2: 20,
  birth2: 21,
  gender2: 22,
  team: 24,
};

/** Sexe : « homme/femme », « H/F », « M/F », « masculin/féminin »… ; inconnu → non renseigné */
export function parseRapieresGender(value: string): RapieresGender | undefined {
  const v = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!v) return undefined;
  if (/^(f|femme|feminin|fille|dame|w|woman|female)/.test(v)) return 'F';
  if (/^(h|m|homme|masculin|garcon|man|male)/.test(v)) return 'M';
  return undefined;
}

export interface RapieresImportResult {
  teams: RapieresTeamDraft[];
  /** Lignes ignorées (numéro de ligne du fichier, base 1) */
  skipped: number[];
}

/** Découpe un CSV (séparateur « ; » ou « , », champs entre guillemets, sauts de ligne inclus) */
export function parseDelimited(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** Date de naissance : JJ/MM/AAAA, AAAA-MM-JJ ou numéro de série Excel */
export function parseBirthDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (/^\d+(\.\d+)?$/.test(v)) {
    // Série Excel : jours depuis le 30/12/1899
    const serial = Math.floor(Number(v));
    if (serial < 1000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return null;
}

/** Date ISO AAAA-MM-JJ (date locale) */
export function formatIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Catégorie d'âge d'après une date de naissance (voir rapieresCategoryFromBirthYear).
 * Sans date valide : Seniors.
 */
export function rapieresCategoryFromBirthDate(
  birth: Date | null,
  refDate: Date = new Date()
): RapieresAgeCategory {
  if (!birth || isNaN(birth.getTime())) return 'SENIOR';
  return rapieresCategoryFromBirthYear(birth.getFullYear(), refDate);
}

/** Équipes lues dans le contenu du fichier ; niveau par défaut « débutant » */
export function parseRapieresTeams(content: string, refDate?: Date): RapieresImportResult {
  const rows = parseDelimited(content);
  const teams: RapieresTeamDraft[] = [];
  const skipped: number[] = [];
  const cell = (r: string[], i: number) => (r[i] ?? '').trim();
  rows.forEach((r, idx) => {
    if (r.every(c => !c.trim())) return;
    // Ligne d'en-tête : « Nom participant » en D
    if (idx === 0 && /nom/i.test(cell(r, COL.last1))) return;
    const fencer = (
      last: number,
      first: number,
      birth: number,
      genderCol: number
    ): RapieresFencer => {
      const gender = parseRapieresGender(cell(r, genderCol));
      const birthDate = parseBirthDate(cell(r, birth));
      return {
        lastName: cell(r, last),
        firstName: cell(r, first),
        category: rapieresCategoryFromBirthDate(birthDate, refDate),
        ...(gender ? { gender } : {}),
        ...(birthDate && !isNaN(birthDate.getTime())
          ? { birthDate: formatIsoDate(birthDate) }
          : {}),
      };
    };
    const f1 = fencer(COL.last1, COL.first1, COL.birth1, COL.gender1);
    const f2 = fencer(COL.last2, COL.first2, COL.birth2, COL.gender2);
    const name = cell(r, COL.team);
    if (!name || !f1.lastName || !f2.lastName) {
      skipped.push(idx + 1);
      return;
    }
    teams.push({ name, info: { level: 'beginner', fencers: [f1, f2] } });
  });
  return { teams, skipped };
}
