/**
 * BellePoule Modern - File Parser - Import des fichiers de l'extranet fédéral (#1938)
 * Licensed under GPL-3.0
 *
 * Le .zip de l'extranet FFE contient un .xml (en-tête + tireurs [+ équipes] + arbitres),
 * un .FFF (tireurs, classement, points) et un .txt d'arbitres (Engarde). Les trois se
 * recoupent : on fusionne par licence. Le XML fait foi pour l'en-tête et les équipes ;
 * en cas d'écart XML / FFF sur un tireur, l'utilisateur choisit la source (alerte fichier).
 */

import { Fencer } from '../../types';
import { ImportResult, ImportedReferee, ImportedTeam, fencerKey } from './common';
import {
  CompetitionHeader,
  guessFieldsFromFileName,
  parseCompetitionHeader,
} from './competitionHeader';
import { detectFencerFileFormat } from './detect';
import { parseEngardeRefereeFile } from './engardeParser';
import { parseFFEFile } from './ffeParser';
import { parseXMLFile } from './xmlParser';

/** Fichier texte déjà décodé (le .zip est ouvert et décodé fichier par fichier côté main) */
export interface FederalFile {
  name: string;
  content: string;
}

export type FederalFileKind = 'xml' | 'fff' | 'referees' | 'unknown';

export type FencerSource = 'xml' | 'fff';

/** Écart entre le XML et le FFF sur un même tireur */
export interface FencerConflict {
  key: string;
  lastName: string;
  firstName: string;
  field: 'club' | 'ranking' | 'onlyInXml' | 'onlyInFff';
  xml?: string;
  fff?: string;
}

export interface FederalNotice {
  code:
    | 'multipleXml'
    | 'multipleFff'
    | 'unknownFile'
    | 'refereesEmpty'
    | 'noFencers'
    | 'teamsWithoutXml'
    | 'teamTooSmall'
    | 'fencerWithoutTeam'
    | 'unknownWeapon'
    | 'unknownGender'
    | 'unknownCategory'
    | 'invalidDate'
    | 'mixedTitle'
    | 'pastDate';
  value?: string;
}

export interface FederalImport {
  /** En-tête du XML ; null sans XML */
  header: CompetitionHeader | null;
  /** Champs déduits du nom de fichier (repli sans XML) */
  fileNameGuess: ReturnType<typeof guessFieldsFromFileName>;
  xmlFencers: Partial<Fencer>[];
  fffFencers: Partial<Fencer>[];
  teams: ImportedTeam[];
  referees: ImportedReferee[];
  conflicts: FencerConflict[];
  notices: FederalNotice[];
  files: Array<{ name: string; kind: FederalFileKind }>;
}

/** Nature d'un fichier, par extension puis par contenu */
export function classifyFederalFile(file: FederalFile): FederalFileKind {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const content = file.content.replace(/^\uFEFF/, '').trimStart();
  if (ext === 'xml' || ext === 'cotcot') return 'xml';
  if (ext === 'fff') return 'fff';
  const firstLine = content.split(/\r?\n/, 1)[0].toLowerCase();
  if (/^nom;pr[ée]nom;sexe;categorie/.test(firstLine)) return 'referees';
  const detected = detectFencerFileFormat(content);
  if (detected === 'xml') return 'xml';
  if (detected === 'fff') return 'fff';
  return 'unknown';
}

const refereeKey = (r: ImportedReferee) => fencerKey(r);

function mergeReferees(
  primary: ImportedReferee[],
  secondary: ImportedReferee[]
): ImportedReferee[] {
  const seen = new Set(primary.map(refereeKey));
  return [...primary, ...secondary.filter(r => !seen.has(refereeKey(r)))];
}

function detectConflicts(xml: Partial<Fencer>[], fff: Partial<Fencer>[]): FencerConflict[] {
  const conflicts: FencerConflict[] = [];
  const fffByKey = new Map(fff.map(f => [fencerKey(f), f]));
  const xmlKeys = new Set<string>();
  const base = (f: Partial<Fencer>, key: string) => ({
    key,
    lastName: f.lastName ?? '',
    firstName: f.firstName ?? '',
  });
  for (const x of xml) {
    const key = fencerKey(x);
    xmlKeys.add(key);
    const f = fffByKey.get(key);
    if (!f) {
      conflicts.push({ ...base(x, key), field: 'onlyInXml' });
      continue;
    }
    const xClub = (x.club ?? '').trim().toUpperCase();
    const fClub = (f.club ?? '').trim().toUpperCase();
    if (xClub && fClub && xClub !== fClub)
      conflicts.push({ ...base(x, key), field: 'club', xml: x.club, fff: f.club });
    if (x.ranking !== undefined && f.ranking !== undefined && x.ranking !== f.ranking)
      conflicts.push({
        ...base(x, key),
        field: 'ranking',
        xml: String(x.ranking),
        fff: String(f.ranking),
      });
  }
  for (const f of fff) {
    const key = fencerKey(f);
    if (!xmlKeys.has(key)) conflicts.push({ ...base(f, key), field: 'onlyInFff' });
  }
  return conflicts;
}

/** Lit les fichiers d'une épreuve (contenu d'un .zip, ou fichiers isolés) */
export function buildFederalImport(files: FederalFile[]): FederalImport {
  const notices: FederalNotice[] = [];
  const classified = files.map(f => ({ ...f, kind: classifyFederalFile(f) }));
  const byKind = (kind: FederalFileKind) => classified.filter(f => f.kind === kind);

  const xmlFiles = byKind('xml');
  const fffFiles = byKind('fff');
  if (xmlFiles.length > 1) notices.push({ code: 'multipleXml' });
  if (fffFiles.length > 1) notices.push({ code: 'multipleFff' });
  for (const f of byKind('unknown')) notices.push({ code: 'unknownFile', value: f.name });

  const xmlFile = xmlFiles[0];
  const fffFile = fffFiles[0];
  const xml: ImportResult | null = xmlFile ? parseXMLFile(xmlFile.content) : null;
  const fff: ImportResult | null = fffFile ? parseFFEFile(fffFile.content) : null;
  const header = xmlFile ? parseCompetitionHeader(xmlFile.content) : null;
  for (const n of header?.notices ?? []) notices.push({ code: n.code, value: n.value });

  const txtReferees = byKind('referees').flatMap(
    f => parseEngardeRefereeFile(f.content).referees as ImportedReferee[]
  );
  const referees = mergeReferees(txtReferees, xml?.referees ?? []);
  const declaresReferees = byKind('referees').length > 0 || xml?.referees !== undefined;
  if (declaresReferees && referees.length === 0) notices.push({ code: 'refereesEmpty' });

  const xmlFencers = xml?.fencers ?? [];
  const fffFencers = fff?.fencers ?? [];
  if (xmlFencers.length === 0 && fffFencers.length === 0) notices.push({ code: 'noFencers' });

  const teams = xml?.teams ?? [];
  if (header?.fields.isTeamEvent) {
    for (const t of teams)
      if (t.members.length < 3) notices.push({ code: 'teamTooSmall', value: t.name });
    const inTeam = new Set(teams.flatMap(t => t.members));
    for (const f of xmlFencers)
      if (!inTeam.has(fencerKey(f)))
        notices.push({ code: 'fencerWithoutTeam', value: `${f.lastName} ${f.firstName}` });
  }
  if (!xmlFile && fffFile && /_equ\b|par_equipes/i.test(`${fffFile.name}\n${fffFile.content}`))
    notices.push({ code: 'teamsWithoutXml' });

  const fileNameGuess = header
    ? {}
    : guessFieldsFromFileName(fffFile?.name ?? classified[0]?.name ?? '');

  return {
    header,
    fileNameGuess,
    xmlFencers,
    fffFencers,
    teams,
    referees,
    conflicts:
      xmlFencers.length && fffFencers.length ? detectConflicts(xmlFencers, fffFencers) : [],
    notices,
    files: classified.map(({ name, kind }) => ({ name, kind })),
  };
}

/**
 * Liste finale des tireurs : la source choisie fait foi (présence et valeurs) ;
 * les champs qu'elle laisse vides sont complétés par l'autre fichier.
 */
export function resolveFederalFencers(
  imp: Pick<FederalImport, 'xmlFencers' | 'fffFencers'>,
  source: FencerSource = 'xml'
): Partial<Fencer>[] {
  const [primary, secondary] =
    source === 'xml' || imp.fffFencers.length === 0
      ? [imp.xmlFencers, imp.fffFencers]
      : [imp.fffFencers, imp.xmlFencers];
  const base = primary.length > 0 ? primary : secondary;
  const other = new Map((base === primary ? secondary : []).map(f => [fencerKey(f), f]));
  return base.map(f => {
    const complement = other.get(fencerKey(f));
    if (!complement) return f;
    const merged: Partial<Fencer> = { ...f };
    for (const [k, v] of Object.entries(complement) as Array<[keyof Fencer, unknown]>) {
      if (merged[k] === undefined && v !== undefined) (merged as Record<string, unknown>)[k] = v;
    }
    return merged;
  });
}

/** Équipes réduites aux tireurs retenus */
export function resolveFederalTeams(
  teams: ImportedTeam[],
  fencers: Partial<Fencer>[]
): ImportedTeam[] {
  const kept = new Set(fencers.map(fencerKey));
  return teams
    .map(t => ({ ...t, members: t.members.filter(k => kept.has(k)) }))
    .filter(t => t.members.length > 0);
}
