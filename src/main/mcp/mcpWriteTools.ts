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
  detectFencerFileFormat,
  parseFFEFile,
  parseSimpleTXTFile,
  parseXMLFile,
} from '../../shared/utils/fileParser';
import { identityKey } from '../../database/repos/privacyRepo';
import { McpToolError, type McpDeps, type McpTool } from './mcpTools';

/** Écran à rafraîchir après une écriture de l'agent */
export type McpNotify = (
  type: 'competitions:changed' | 'fencers:changed',
  competitionId?: string
) => void;

export interface McpWriteDeps extends McpDeps {
  notify: McpNotify;
}

type Args = Record<string, unknown>;

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const IMPORT_EXTENSIONS = ['.xml', '.txt', '.csv', '.fff'];

const pick = <T extends string>(value: unknown, allowed: readonly T[], key: string): T => {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value))
    return value as T;
  throw new McpToolError(`« ${key} » doit valoir : ${allowed.join(', ')}`);
};

const dryRunOf = (args: Args) => args.dryRun === true;

const competitionOrThrow = (deps: McpDeps, id: unknown) => {
  if (typeof id !== 'string' || !id) throw new McpToolError('Argument « competitionId » requis');
  const c = deps.db.getCompetition(id);
  if (!c) throw new McpToolError(`Compétition inconnue : ${id}`);
  return c;
};

/** Clés d'identité : licence si connue, et nom + prénom (doublon dès qu'une clé coïncide) */
const keysOf = (f: Partial<Fencer>): string[] => {
  const keys = [identityKey({ lastName: f.lastName, firstName: f.firstName })];
  if (f.license) keys.push(identityKey({ license: f.license }));
  return keys;
};

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
      const title = typeof args.title === 'string' ? args.title.trim().slice(0, 200) : '';
      if (!title) throw new McpToolError('Argument « title » requis');
      const date = new Date(String(args.date ?? ''));
      if (Number.isNaN(date.getTime())) throw new McpToolError('« date » invalide (AAAA-MM-JJ)');
      const weapon = pick(args.weapon, [Weapon.EPEE, Weapon.FOIL, Weapon.SABRE], 'weapon');
      const gender = pick(args.gender, [Gender.MALE, Gender.FEMALE, Gender.MIXED], 'gender');
      const category = pick(args.category, Object.values(Category), 'category');
      const settings = buildDefaultCompetitionSettings({ weapon, category });
      const data = {
        title,
        date,
        weapon,
        gender,
        category,
        ...(typeof args.location === 'string' ? { location: args.location.slice(0, 200) } : {}),
        ...(settings ? { settings } : {}),
      };
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
    run: (deps, args) => {
      const competition = competitionOrThrow(deps, args.competitionId);
      const file = typeof args.path === 'string' ? args.path : '';
      if (!path.isAbsolute(file)) throw new McpToolError('« path » doit être un chemin absolu');
      if (!IMPORT_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
        throw new McpToolError(`Extension acceptée : ${IMPORT_EXTENSIONS.join(', ')}`);
      }
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        throw new McpToolError(`Fichier introuvable : ${file}`);
      }
      if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES) {
        throw new McpToolError('Fichier absent ou trop volumineux (5 Mo maximum)');
      }
      const content = decodeTextFile(new Uint8Array(fs.readFileSync(file)));
      const format = detectFencerFileFormat(content);
      const parsed =
        format === 'xml'
          ? parseXMLFile(content)
          : format === 'txt'
            ? parseSimpleTXTFile(content)
            : parseFFEFile(content);
      const existing = new Set(deps.db.getFencersByCompetition(competition.id).flatMap(keysOf));
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
        format: format ?? 'fff',
        read: parsed.fencers.length,
        toAdd: toAdd.length,
        duplicates,
        errors: parsed.errors.slice(0, 20),
        warnings: parsed.warnings.slice(0, 20),
      };
      if (dryRunOf(args) || toAdd.length === 0) return { dryRun: dryRunOf(args), ...report };
      for (const f of toAdd) deps.db.addFencer(competition.id, f);
      deps.notify('fencers:changed', competition.id);
      return { dryRun: false, added: toAdd.length, ...report };
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
