/**
 * BellePoule Modern - Outils MCP d'orchestration sportive (#1880, lot 3)
 * Poules, arbitres de poule, scores, tableau, export des résultats. La logique est dans
 * src/main/engine/commands/sport.ts : mêmes fonctions pures que l'écran, qui relit l'état de
 * session après chaque écriture (competition:event « session:changed »).
 * Outils d'écriture proposés seulement si « Autoriser l'écriture » est coché.
 * Licensed under GPL-3.0
 */

import {
  assignPoolReferees,
  buildBracket,
  generatePools,
  listMatches,
} from '../engine/commands/sport';
import { exportResults, type ResultsFormat } from '../engine/commands/exportResults';
import type { McpTool } from './mcpTools';
import type { McpWriteTool } from './mcpWriteTools';
import {
  guard,
  guardAsync,
  optBool,
  optInt,
  optPick,
  readDomain,
  reqPick,
  reqStr,
  writeDomain,
} from './mcpDomain';

const competitionId = {
  competitionId: {
    type: 'string',
    description: 'Identifiant de la compétition (list_competitions)',
  },
};
const dryRun = { dryRun: { type: 'boolean', description: 'Décrit le résultat sans rien écrire' } };
const FORMATS = ['xml', 'fff', 'csv', 'html', 'pdf'] as const;

export const MCP_SPORT_READ_TOOLS: McpTool[] = [
  {
    name: 'list_matches',
    title: 'Lister les matchs',
    description:
      'Matchs de poule et de tableau d’une épreuve avec leur identifiant (matchId pour record_score), tireurs, score, état (ready : à tirer, done : joué, pending : tireur attendu) et piste.',
    inputSchema: {
      type: 'object',
      properties: {
        ...competitionId,
        poolNumber: { type: 'number', description: 'Matchs d’une poule seulement' },
        state: { type: 'string', enum: ['pending', 'ready', 'done'] },
      },
      required: ['competitionId'],
    },
    annotations: { readOnlyHint: true },
    run: (deps, args) =>
      guard(() =>
        listMatches(readDomain(deps), reqStr(args, 'competitionId'), {
          poolNumber: optInt(args, 'poolNumber', 1, 999),
          state: optPick(args, 'state', ['pending', 'ready', 'done'] as const),
        })
      ),
  },
];

export const MCP_SPORT_TOOLS: McpWriteTool[] = [
  {
    name: 'generate_pools',
    title: 'Générer les poules',
    description:
      'Tirage des poules sur les tireurs pointés (serpentin sur le classement, clubs et régions séparés), poules lancées, poule n sur la piste n. Épreuve individuelle, un tour de poules. ' +
      '« replace: true » efface des poules déjà jouées ou un tableau : accord du DT indispensable.',
    inputSchema: {
      type: 'object',
      properties: {
        ...competitionId,
        poolCount: { type: 'number', description: 'Nombre de poules (défaut : optimal)' },
        minPerPool: { type: 'number', description: 'Tireurs par poule, minimum (défaut 5)' },
        maxPerPool: { type: 'number', description: 'Tireurs par poule, maximum (défaut 7)' },
        replace: { type: 'boolean', description: 'Remplacer des poules ou un tableau existants' },
        ...dryRun,
      },
      required: ['competitionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    run: (deps, args) =>
      guard(() =>
        generatePools(writeDomain(deps), reqStr(args, 'competitionId'), {
          poolCount: optInt(args, 'poolCount', 1, 200),
          minPerPool: optInt(args, 'minPerPool', 3, 12),
          maxPerPool: optInt(args, 'maxPerPool', 3, 12),
          replace: optBool(args, 'replace'),
          dryRun: optBool(args, 'dryRun'),
        })
      ),
  },
  {
    name: 'assign_referees',
    title: 'Arbitres des poules',
    description:
      'Un arbitre principal par poule sans arbitre, parmi les arbitres pointés, par le même moteur que l’écran (affectation optimale, neutralité club et, selon l’épreuve, nation et ligue ; un arbitre peut enchaîner plusieurs poules). Une poule sans arbitre neutre reste sans arbitre : « unassigned » donne les arbitres écartés et leurs raisons, « warnings » le résumé. « replace: true » réaffecte toutes les poules.',
    inputSchema: {
      type: 'object',
      properties: {
        ...competitionId,
        replace: { type: 'boolean', description: 'Réaffecter toutes les poules' },
        includeUnchecked: { type: 'boolean', description: 'Accepter les arbitres non pointés' },
        ...dryRun,
      },
      required: ['competitionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) =>
      guard(() =>
        assignPoolReferees(writeDomain(deps), reqStr(args, 'competitionId'), {
          replace: optBool(args, 'replace'),
          includeUnchecked: optBool(args, 'includeUnchecked'),
          dryRun: optBool(args, 'dryRun'),
        })
      ),
  },
  // record_score : généré depuis le contrat d'API (src/shared/api/contract.ts, #1981)
  {
    name: 'build_bracket',
    title: 'Construire le tableau',
    description:
      'Tableau d’élimination directe depuis le classement après poules (poules terminées ; abandons, forfaits, exclus et éliminés écartés). Petite finale selon l’épreuve, ou « thirdPlaceMatch ». ' +
      '« replace: true » efface un tableau déjà joué : accord du DT indispensable.',
    inputSchema: {
      type: 'object',
      properties: {
        ...competitionId,
        thirdPlaceMatch: { type: 'boolean', description: 'Match pour la 3e place' },
        replace: { type: 'boolean', description: 'Remplacer un tableau existant' },
        ...dryRun,
      },
      required: ['competitionId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    run: (deps, args) =>
      guard(() =>
        buildBracket(writeDomain(deps), reqStr(args, 'competitionId'), {
          thirdPlaceMatch: optBool(args, 'thirdPlaceMatch'),
          replace: optBool(args, 'replace'),
          dryRun: optBool(args, 'dryRun'),
        })
      ),
  },
  {
    name: 'export_results',
    title: 'Exporter les résultats',
    description:
      'Écrit les résultats dans un fichier d’un dossier accessible à l’agent : xml (BellePoule / FFE), fff (classement FFE), csv (classement après poules), html ou pdf (classement final). ' +
      '« overwrite: true » pour remplacer un fichier existant.',
    inputSchema: {
      type: 'object',
      properties: {
        ...competitionId,
        format: { type: 'string', enum: [...FORMATS] },
        path: { type: 'string', description: 'Chemin absolu du fichier à écrire' },
        overwrite: { type: 'boolean', description: 'Remplacer un fichier existant' },
      },
      required: ['competitionId', 'format', 'path'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, args) => {
      const format: ResultsFormat = reqPick(args, 'format', FORMATS);
      return guardAsync(() =>
        exportResults(writeDomain(deps), reqStr(args, 'competitionId'), {
          format,
          outputPath: reqStr(args, 'path'),
          overwrite: optBool(args, 'overwrite'),
          renderPdf: deps.renderPdf,
          logo: deps.db.settings.getSetting('logo'),
        })
      );
    },
  },
];
