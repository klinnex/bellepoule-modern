/**
 * BellePoule Modern - Tournoi des rapières : import des équipes (#1211)
 * Export d'inscriptions (CSV « ; » ou XLSX converti en CSV par le processus principal),
 * une ligne par équipe : colonnes D/E (nom/prénom tireur 1), Q (naissance tireur 1),
 * T/U (nom/prénom tireur 2), V (naissance tireur 2), Y (nom d'équipe).
 * Licensed under GPL-3.0
 */

import { RapieresAgeCategory, RapieresFencer } from './rapieres.types';
import { RapieresTeamDraft } from './RapieresTeamModal';

/** Colonnes (index base 0) : D=3, E=4, Q=16, T=19, U=20, V=21, Y=24 */
const COL = { last1: 3, first1: 4, birth1: 16, last2: 19, first2: 20, birth2: 21, team: 24 };

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

/**
 * Catégorie d'âge : âge atteint dans l'année civile de début de saison (saison du
 * 1er septembre au 31 août). M20 < 20 ans, Seniors 20-39, V1 40-49, V2 50-59, V3 60-69, V4 70+.
 * Sans date valide : Seniors.
 */
export function rapieresCategoryFromBirthDate(
  birth: Date | null,
  refDate: Date = new Date()
): RapieresAgeCategory {
  if (!birth || isNaN(birth.getTime())) return 'SENIOR';
  const seasonStart = refDate.getMonth() >= 8 ? refDate.getFullYear() : refDate.getFullYear() - 1;
  const age = seasonStart - birth.getFullYear();
  if (age < 20) return 'M20';
  if (age < 40) return 'SENIOR';
  if (age < 50) return 'V1';
  if (age < 60) return 'V2';
  if (age < 70) return 'V3';
  return 'V4';
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
    const fencer = (last: number, first: number, birth: number): RapieresFencer => ({
      lastName: cell(r, last),
      firstName: cell(r, first),
      category: rapieresCategoryFromBirthDate(parseBirthDate(cell(r, birth)), refDate),
    });
    const f1 = fencer(COL.last1, COL.first1, COL.birth1);
    const f2 = fencer(COL.last2, COL.first2, COL.birth2);
    const name = cell(r, COL.team);
    if (!name || !f1.lastName || !f2.lastName) {
      skipped.push(idx + 1);
      return;
    }
    teams.push({ name, info: { level: 'beginner', fencers: [f1, f2] } });
  });
  return { teams, skipped };
}

type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Bouton d'import pour la liste d'appel : choix du fichier, analyse, ajout des équipes */
export const rapieresImporter = (
  t: (key: string, params?: Record<string, string | number>) => string,
  showToast: (message: string, type: ToastType) => void,
  competitionDate: Date | string | undefined,
  save: (team: RapieresTeamDraft) => Promise<void>
) => ({
  label: t('rapieres.import_teams'),
  onClick: async () => {
    const result = await window.electronAPI.dialog.openFile({
      title: t('rapieres.import_teams'),
      filters: [
        { name: 'CSV / Excel', extensions: ['csv', 'xlsx'] },
        { name: '*', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (!result?.filePath) return;
    const refDate = competitionDate ? new Date(competitionDate) : new Date();
    const { teams, skipped } = parseRapieresTeams(result.content || '', refDate);
    if (teams.length === 0) {
      showToast(t('rapieres.import_empty'), 'error');
      return;
    }
    for (const team of teams) await save(team);
    showToast(
      t('rapieres.import_done', { n: teams.length }) +
        (skipped.length ? ' ' + t('rapieres.import_skipped', { lines: skipped.join(', ') }) : ''),
      skipped.length ? 'warning' : 'success'
    );
  },
});
