/**
 * BellePoule Modern - Outils MCP d'écriture administrative (#1880, lot 2)
 * Création d'épreuve, import de tireurs, pointage. Proposés seulement si « Autoriser
 * l'écriture » est coché ; `dryRun` décrit sans écrire ; chaque écriture prévient l'écran.
 * Licensed under GPL-3.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { Category, FencerStatus, Gender, Weapon, type Fencer } from '../../shared/types';
import { buildDefaultCompetitionSettings } from '../../shared/utils/defaultCompetitionSettings';
import {
  decodeTextFile,
  parseFFEFile,
  resolveFencerFileFormat,
  parseSimpleTXTFile,
  parseXMLFile,
  parseEngardeRefereeFile,
} from '../../shared/utils/fileParser';
import { syncDay } from '../ipc/eventDayHandlers';
import { importIdentityKeys } from '../../shared/utils/personIdentity';
import { McpToolError, type McpDeps, type McpTool } from './mcpTools';
import { xlsxToCsv } from '../xlsxToCsv';
import { isWithinRoots } from '../domain/files';

/** Écran à rafraîchir après une écriture de l'agent */
export type McpNotify = (
  type: 'competitions:changed' | 'fencers:changed' | 'session:changed' | 'settings:changed',
  competitionId?: string
) => void;

export interface McpWriteDeps extends McpDeps {
  notify: McpNotify;
  /** Dossiers où l'agent lit et écrit des fichiers ; absent = aucune restriction (tests, CLI) */
  allowedRoots?: () => string[];
  /** Serveur distant d'une épreuve (start_remote_server / stop_remote_server) */
  startRemote?: (
    competitionId: string,
    port?: number
  ) => Promise<{ success: boolean; error?: string; serverInfo?: unknown }>;
  stopRemote?: (competitionId: string) => boolean;
  /** Rendu HTML → PDF (export_results) */
  renderPdf?: (html: string) => Promise<Buffer>;
}

type Args = Record<string, unknown>;

/** Dossier (chemin réel, liens résolus) dans un des dossiers accessibles à l'agent */
function isInsideRoots(dir: string, roots: readonly string[]): boolean {
  try {
    return isWithinRoots(fs.realpathSync.native(dir), roots);
  } catch {
    return false;
  }
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** Formats de tireurs de l'écran : XML FFE, cotcot, FFF, CSV, TXT, classeur Excel */
const IMPORT_EXTENSIONS = ['.xml', '.cotcot', '.txt', '.csv', '.fff', '.xlsx'];

export const pick = <T extends string>(value: unknown, allowed: readonly T[], key: string): T => {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value))
    return value as T;
  throw new McpToolError(`« ${key} » doit valoir : ${allowed.join(', ')}`);
};

export const dryRunOf = (args: Args) => args.dryRun === true;

export const competitionOrThrow = (deps: McpDeps, id: unknown) => {
  if (typeof id !== 'string' || !id) throw new McpToolError('Argument « competitionId » requis');
  const c = deps.db.getCompetition(id);
  if (!c) throw new McpToolError(`Compétition inconnue : ${id}`);
  return c;
};

/** Clés d'identité : licence si connue, et nom + prénom (doublon dès qu'une clé coïncide) */
export const keysOf = importIdentityKeys;

/** Données d'une épreuve à créer (réglages par défaut de la fenêtre « Nouvelle compétition ») */
function competitionData(args: Args) {
  const title = typeof args.title === 'string' ? args.title.trim().slice(0, 200) : '';
  if (!title) throw new McpToolError('Argument « title » requis');
  const date = new Date(String(args.date ?? ''));
  if (Number.isNaN(date.getTime())) throw new McpToolError('« date » invalide (AAAA-MM-JJ)');
  const weapon = pick(args.weapon, [Weapon.EPEE, Weapon.FOIL, Weapon.SABRE], 'weapon');
  const gender = pick(args.gender, [Gender.MALE, Gender.FEMALE, Gender.MIXED], 'gender');
  const category = pick(args.category, Object.values(Category), 'category');
  const settings = buildDefaultCompetitionSettings({ weapon, category });
  return {
    title,
    date,
    weapon,
    gender,
    category,
    ...(typeof args.location === 'string' ? { location: args.location.slice(0, 200) } : {}),
    ...(settings ? { settings } : {}),
  };
}

/**
 * Lit un fichier du poste DT : chemin absolu, extension autorisée, 5 Mo maximum, et dans
 * un dossier accessible à l'agent (Paramètres → Agent IA) quand `roots` est fourni.
 * Un classeur Excel est converti en CSV « ; », comme à l'écran.
 */
export async function readImportFile(
  file: unknown,
  extensions: string[],
  roots?: readonly string[]
): Promise<string> {
  const bytes = readImportBytes(file, extensions, roots);
  if (path.extname(String(file)).toLowerCase() === '.xlsx') {
    try {
      return await xlsxToCsv(bytes);
    } catch {
      throw new McpToolError('Classeur Excel illisible');
    }
  }
  return decodeTextFile(new Uint8Array(bytes));
}

function readImportBytes(file: unknown, extensions: string[], roots?: readonly string[]): Buffer {
  const p = typeof file === 'string' ? file : '';
  if (!path.isAbsolute(p)) throw new McpToolError('Le chemin doit être absolu');
  if (!extensions.includes(path.extname(p).toLowerCase())) {
    throw new McpToolError(`Extension acceptée : ${extensions.join(', ')}`);
  }
  // Vérifié avant l'ouverture : l'agent n'apprend rien d'un chemin hors périmètre
  if (roots && !isInsideRoots(path.dirname(p), roots)) {
    throw new McpToolError(
      'Chemin hors des dossiers accessibles à l’agent (Paramètres → Système → Agent IA)'
    );
  }
  // Un seul descripteur : contrôle et lecture portent sur le même fichier (pas de course)
  let fd: number;
  try {
    fd = fs.openSync(p, 'r');
  } catch {
    throw new McpToolError(`Fichier introuvable : ${p}`);
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES) {
      throw new McpToolError('Fichier absent ou trop volumineux (5 Mo maximum)');
    }
    const buf = Buffer.alloc(stat.size);
    let read = 0;
    while (read < stat.size) {
      const n = fs.readSync(fd, buf, read, stat.size - read, read);
      if (n === 0) break;
      read += n;
    }
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** Fichier de tireurs lu : contenu, et format demandé d'après l'extension (comme à l'écran) */
interface FencersFile {
  content: string;
  requested: 'xml' | 'txt' | 'fff';
}

/** Avertissement quand le fichier ne donne aucun tireur (sinon l'import « réussit » à vide) */
const NO_FENCER_WARNING =
  'Aucun tireur lu dans le fichier : vérifiez son format (FFE, XML, CSV, TXT ou Excel).';

/**
 * Lecture des tireurs : même choix de parseur que l'écran (ImportModal). Un .txt passe par le
 * parseur libre, sauf si son contenu est du FFF ou du XML ; .xml / .cotcot par le parseur XML.
 */
function parseFencersFile({ content, requested }: FencersFile) {
  const format = resolveFencerFileFormat(requested, content);
  const parsed =
    format === 'xml'
      ? parseXMLFile(content)
      : format === 'txt'
        ? parseSimpleTXTFile(content)
        : parseFFEFile(content);
  const warnings = parsed.warnings.slice(0, 20);
  if (parsed.fencers.length === 0 && !warnings.includes(NO_FENCER_WARNING)) {
    warnings.unshift(NO_FENCER_WARNING);
  }
  return { format, parsed, warnings };
}

/** Aperçu d'un fichier de tireurs (épreuve pas encore créée, dryRun) */
function readFencersPreview(file: FencersFile) {
  const { format, parsed, warnings } = parseFencersFile(file);
  return {
    format,
    read: parsed.fencers.length,
    errors: parsed.errors.slice(0, 20),
    warnings,
  };
}

/** Fichier de tireurs lu (dossiers de l'agent, xlsx converti) */
async function readFencersFile(deps: McpWriteDeps, file: unknown): Promise<FencersFile> {
  const content = await readImportFile(file, IMPORT_EXTENSIONS, deps.allowedRoots?.());
  const ext = path.extname(String(file)).toLowerCase();
  const requested = ext === '.txt' ? 'txt' : ext === '.xml' || ext === '.cotcot' ? 'xml' : 'fff';
  return { content, requested };
}

/** Import des tireurs (contenu d'un fichier déjà lu) dans une épreuve, doublons ignorés */
function importFencersFile(
  deps: McpWriteDeps,
  competitionId: string,
  file: FencersFile,
  dryRun: boolean
) {
  const { format, parsed, warnings } = parseFencersFile(file);
  const existing = new Set(deps.db.getFencersByCompetition(competitionId).flatMap(keysOf));
  const toAdd: Partial<Fencer>[] = [];
  let duplicates = 0;
  for (const f of parsed.fencers) {
    if (!f.lastName) continue;
    const keys = keysOf(f);
    if (keys.some(k => existing.has(k))) {
      duplicates++;
      continue;
    }
    keys.forEach(k => existing.add(k));
    toAdd.push({ ...f, status: f.status ?? FencerStatus.NOT_CHECKED_IN });
  }
  const report = {
    format,
    read: parsed.fencers.length,
    toAdd: toAdd.length,
    duplicates,
    errors: parsed.errors.slice(0, 20),
    warnings,
  };
  if (dryRun || toAdd.length === 0) return { dryRun, ...report };
  for (const f of toAdd) deps.db.addFencer(competitionId, f);
  deps.notify('fencers:changed', competitionId);
  return { dryRun: false, added: toAdd.length, ...report };
}

/** Outil d'écriture : annotations MCP + exécution avec notification de l'écran */
export interface McpWriteTool extends Omit<McpTool, 'annotations' | 'run'> {
  annotations: { readOnlyHint: false; destructiveHint: boolean; idempotentHint: boolean };
  run: (deps: McpWriteDeps, args: Args) => unknown;
}

const dryRunProp = {
  dryRun: { type: 'boolean', description: 'Décrit le résultat sans rien écrire' },
};

export const MCP_WRITE_TOOLS: McpWriteTool[] = [
  {
    name: 'create_competition',
    title: 'Créer une épreuve',
    description:
      'Crée une épreuve avec les réglages par défaut de l’application (identiques à la fenêtre « Nouvelle compétition »).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'AAAA-MM-JJ' },
        weapon: { type: 'string', enum: ['E', 'F', 'S'] },
        gender: { type: 'string', enum: ['M', 'F', 'X'] },
        category: { type: 'string', enum: Object.values(Category) },
        location: { type: 'string' },
        ...dryRunProp,
      },
      required: ['title', 'date', 'weapon', 'gender', 'category'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, args) => {
      const data = competitionData(args);
      if (dryRunOf(args)) return { dryRun: true, wouldCreate: data };
      const created = deps.db.createCompetition(data);
      deps.notify('competitions:changed', created.id);
      return { created: { id: created.id, title: created.title } };
    },
  },
  {
    name: 'import_fencers',
    title: 'Importer des tireurs',
    description:
      'Importe un fichier de tireurs (XML FFE / cotcot, FFF, CSV, TXT) dans une épreuve. Doublons (même licence, ou même nom et prénom) ignorés.',
    inputSchema: {
      type: 'object',
      properties: {
        competitionId: { type: 'string' },
        path: { type: 'string', description: 'Chemin absolu du fichier sur le poste DT' },
        ...dryRunProp,
      },
      required: ['competitionId', 'path'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: async (deps, args) => {
      const competition = competitionOrThrow(deps, args.competitionId);
      const file = await readFencersFile(deps, args.path);
      return importFencersFile(deps, competition.id, file, dryRunOf(args));
    },
  },
  {
    name: 'import_day',
    title: 'Préparer une journée',
    description:
      'Crée (ou complète) une journée multi-épreuves à partir d’un manifeste : épreuves, fichiers de tireurs, fichier d’arbitres (Engarde). ' +
      'Relancer le même manifeste ne crée aucun doublon (journée par nom + date, épreuve par titre, tireurs et arbitres dédoublonnés).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        date: { type: 'string', description: 'AAAA-MM-JJ' },
        stripCount: { type: 'number' },
        location: { type: 'string' },
        competitions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              weapon: { type: 'string', enum: ['E', 'F', 'S'] },
              gender: { type: 'string', enum: ['M', 'F', 'X'] },
              category: { type: 'string', enum: Object.values(Category) },
              fencersFile: { type: 'string', description: 'Chemin absolu (facultatif)' },
            },
            required: ['title', 'weapon', 'gender', 'category'],
          },
        },
        refereesFile: { type: 'string', description: 'Fichier d’arbitres Engarde (.txt / .csv)' },
        ...dryRunProp,
      },
      required: ['name', 'date', 'competitions'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: async (deps, args) => {
      const dryRun = dryRunOf(args);
      const name = typeof args.name === 'string' ? args.name.trim().slice(0, 200) : '';
      const date = typeof args.date === 'string' ? args.date.slice(0, 10) : '';
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new McpToolError('« name » et « date » (AAAA-MM-JJ) requis');
      }
      if (!Array.isArray(args.competitions) || args.competitions.length === 0) {
        throw new McpToolError('« competitions » : liste non vide requise');
      }
      const specs = (args.competitions as Args[]).slice(0, 50).map(c => ({
        data: competitionData({ ...c, date, location: args.location }),
        fencersFile: c.fencersFile,
      }));
      // Tous les fichiers lus avant la première écriture : un fichier manquant ou illisible
      // fait échouer l'import sans rien écrire
      const contents: Array<FencersFile | null> = [];
      for (const spec of specs) {
        contents.push(
          spec.fencersFile === undefined ? null : await readFencersFile(deps, spec.fencersFile)
        );
      }
      const refereesContent =
        typeof args.refereesFile === 'string'
          ? await readImportFile(args.refereesFile, ['.txt', '.csv'], deps.allowedRoots?.())
          : null;
      const { db } = deps;
      // Journée, épreuves, tireurs et arbitres en une transaction : tout ou rien
      const report = db.transaction(() => {
        let day = db.eventDays.listDays().find(d => d.name === name && d.date === date) ?? null;
        const dayCreated = !day;
        if (!day && !dryRun) {
          const strips = Number(args.stripCount);
          day = db.eventDays.createDay({
            name,
            date,
            ...(Number.isInteger(strips) && strips > 0 ? { stripCount: strips } : {}),
          });
        }
        const inDay = new Map(
          (day?.competitionIds ?? [])
            .map(id => db.getCompetition(id))
            .filter((c): c is NonNullable<typeof c> => !!c)
            .map(c => [c.title, c.id] as const)
        );
        const competitions = specs.map((spec, i) => {
          const content = contents[i];
          let id = inDay.get(spec.data.title) ?? null;
          const created = !id;
          if (!id && !dryRun && day) {
            id = db.createCompetition(spec.data).id;
            db.eventDays.setCompetitionDay(id, day.id);
          }
          const fencers =
            content === null
              ? null
              : id
                ? importFencersFile(deps, id, content, dryRun)
                : { dryRun, ...readFencersPreview(content) };
          return { title: spec.data.title, id, created, fencers };
        });
        let referees: Record<string, unknown> | null = null;
        if (refereesContent !== null) {
          const parsed = parseEngardeRefereeFile(refereesContent);
          const existing = new Set(
            (day ? db.eventDays.listReferees(day.id) : []).flatMap(r => keysOf(r))
          );
          const toAdd = parsed.referees.filter(r => {
            const keys = keysOf(r);
            if (keys.some(k => existing.has(k))) return false;
            keys.forEach(k => existing.add(k));
            return true;
          });
          if (!dryRun && day) {
            for (const r of toAdd) {
              db.eventDays.createReferee(day.id, {
                firstName: r.firstName,
                lastName: r.lastName,
                club: r.club,
                license: r.license,
                category: r.category,
                weapons: [],
              });
            }
            syncDay(db, day.id);
          }
          referees = {
            read: parsed.referees.length,
            added: toAdd.length,
            duplicates: parsed.referees.length - toAdd.length,
            errors: parsed.errors.slice(0, 20),
          };
        }
        return {
          dryRun,
          day: { id: day?.id ?? null, name, date, created: dayCreated },
          competitions,
          referees,
        };
      });
      if (!dryRun) deps.notify('competitions:changed');
      return report;
    },
  },
  {
    name: 'check_in',
    title: 'Pointer des tireurs',
    description:
      'Pointe (présent) ou dépointe des tireurs d’une épreuve, par identifiant ou numéro de dossard (ref).',
    inputSchema: {
      type: 'object',
      properties: {
        competitionId: { type: 'string' },
        fencers: {
          type: 'array',
          items: { type: ['string', 'number'] },
          description: 'Identifiants ou numéros (ref)',
        },
        present: { type: 'boolean', description: 'true : présent ; false : absent' },
        ...dryRunProp,
      },
      required: ['competitionId', 'fencers', 'present'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => {
      const competition = competitionOrThrow(deps, args.competitionId);
      if (!Array.isArray(args.fencers) || args.fencers.length === 0) {
        throw new McpToolError('« fencers » : liste non vide requise');
      }
      if (typeof args.present !== 'boolean') throw new McpToolError('« present » requis');
      const status = args.present ? FencerStatus.CHECKED_IN : FencerStatus.NOT_CHECKED_IN;
      const all = deps.db.getFencersByCompetition(competition.id);
      const found: Fencer[] = [];
      const unknown: unknown[] = [];
      for (const ref of args.fencers.slice(0, 1000)) {
        const f = all.find(x => x.id === ref || (typeof ref === 'number' && x.ref === ref));
        if (f) found.push(f);
        else unknown.push(ref);
      }
      // Statuts de résultat (abandon, exclusion, forfait…) laissés tels quels
      const changeable = found.filter(f =>
        [FencerStatus.CHECKED_IN, FencerStatus.NOT_CHECKED_IN].includes(f.status)
      );
      const report = {
        status,
        matched: found.length,
        updated: changeable.filter(f => f.status !== status).length,
        skipped: found.length - changeable.length,
        unknown,
      };
      if (dryRunOf(args)) return { dryRun: true, ...report };
      for (const f of changeable) if (f.status !== status) deps.db.updateFencer(f.id, { status });
      if (report.updated > 0) deps.notify('fencers:changed', competition.id);
      return { dryRun: false, ...report };
    },
  },
];
