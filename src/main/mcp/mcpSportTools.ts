/**
 * BellePoule Modern - Outils MCP d'orchestration sportive (#1880, lot 3)
 * Poules, arbitres de poule, scores, tableau, export des résultats. La logique est dans
 * src/main/engine/commands/sport.ts : mêmes fonctions pures que l'écran, qui relit l'état de
 * session après chaque écriture (competition:event « session:changed »).
 * Outils d'écriture proposés seulement si « Autoriser l'écriture » est coché.
 * Licensed under GPL-3.0
 */

import { listMatches } from '../engine/commands/sport';
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
  // generate_pools : généré depuis le contrat d'API (docs/adr/0017, PoolsGenerated au journal)
  // assign_referees, assign_referee, set_refereeing_settings : générés depuis le contrat d'API
  // (src/shared/api/contract.ts, docs/adr/0014)
  // record_score : généré depuis le contrat d'API (src/shared/api/contract.ts, #1981)
  // build_bracket : généré depuis le contrat d'API (generateTableau, TableauGenerated au journal)
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
