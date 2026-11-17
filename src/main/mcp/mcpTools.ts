/**
 * BellePoule Modern - Outils MCP en lecture (#1880, lot 1)
 * Interroger la salle en langage naturel : épreuves, tireurs, poules, tableau, arbitres,
 * journée multi-épreuves, pistes, serveur distant, appareils Cyrano.
 * Données personnelles minimales (pas de date de naissance, licence ni photo, RGPD #1882).
 * Licensed under GPL-3.0
 */

import type { DatabaseManager } from '../../database';
import type { RemoteScoreServer } from '../remoteScoreServer';
import { MatchStatus, type Fencer, type Pool } from '../../shared/types';
import { calculatePoolRanking } from '../../shared/utils/poolCalculations';
import { buildOverview } from '../ipc/eventDayHandlers';

export interface McpDeps {
  db: DatabaseManager;
  /** Serveurs distants actifs, par compétition */
  remoteServers: () => Iterable<[string, { server: RemoteScoreServer }]>;
  /** État des appareils de piste Cyrano */
  cyranoStatus: () => unknown;
}

type Args = Record<string, unknown>;

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  /** Toujours en lecture dans ce lot : aucune écriture en base */
  annotations: { readOnlyHint: true };
  run: (deps: McpDeps, args: Args) => unknown;
}

/** Erreur d'argument : renvoyée à l'agent comme résultat `isError` */
export class McpToolError extends Error {}

const str = (args: Args, key: string): string => {
  const v = args[key];
  if (typeof v !== 'string' || !v) throw new McpToolError(`Argument « ${key} » requis`);
  return v;
};

const fencerView = (f: Fencer) => ({
  id: f.id,
  ref: f.ref,
  lastName: f.lastName,
  firstName: f.firstName,
  club: f.club ?? null,
  nationality: f.nationality ?? null,
  status: f.status,
  ranking: f.ranking ?? null,
});

const competitionOrThrow = (deps: McpDeps, id: string) => {
  const c = deps.db.getCompetition(id);
  if (!c) throw new McpToolError(`Compétition inconnue : ${id}`);
  return c;
};

const competitionArg = {
  competitionId: {
    type: 'string',
    description: 'Identifiant de la compétition (list_competitions)',
  },
};

const poolsOf = (deps: McpDeps, competitionId: string): Pool[] =>
  deps.db.getCompetitionPools(competitionId).map((p, i) => {
    const number = Number(/\d+/.exec(p.name)?.[0] ?? i + 1);
    return {
      id: p.id,
      number,
      fencers: deps.db.getPoolFencers(p.id),
      matches: deps.db.getMatchesByPool(p.id),
    } as unknown as Pool;
  });

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_competitions',
    title: 'Lister les épreuves',
    description:
      'Épreuves enregistrées : titre, date, arme, sexe, catégorie, journée, phase en cours.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: ({ db }) =>
      db.getAllCompetitions().map(c => ({
        id: c.id,
        title: c.title,
        date: c.date,
        weapon: c.weapon,
        gender: c.gender,
        category: c.category,
        location: c.location ?? null,
        dayId: db.eventDays.getCompetitionDayId(c.id),
        currentPhase: c.phases?.[c.currentPhaseIndex ?? 0]?.type ?? null,
      })),
  },
  {
    name: 'get_competition',
    title: 'Détail d’une épreuve',
    description: 'Détail d’une épreuve : réglages, phases, nombre de tireurs et de poules.',
    inputSchema: { type: 'object', properties: competitionArg, required: ['competitionId'] },
    annotations: { readOnlyHint: true },
    run: (deps, args) => {
      const id = str(args, 'competitionId');
      const c = competitionOrThrow(deps, id);
      return {
        ...c,
        fencerCount: deps.db.getFencersByCompetition(id).length,
        poolCount: deps.db.getCompetitionPools(id).length,
      };
    },
  },
  {
    name: 'list_fencers',
    title: 'Tireurs d’une épreuve',
    description: 'Tireurs d’une épreuve : nom, club, statut de pointage, classement.',
    inputSchema: { type: 'object', properties: competitionArg, required: ['competitionId'] },
    annotations: { readOnlyHint: true },
    run: (deps, args) => {
      const id = str(args, 'competitionId');
      competitionOrThrow(deps, id);
      return deps.db.getFencersByCompetition(id).map(fencerView);
    },
  },
  {
    name: 'get_pool_ranking',
    title: 'Classement des poules',
    description:
      'Classement de chaque poule (ou d’une poule) : victoires, indice, rang ; avancement des matchs.',
    inputSchema: {
      type: 'object',
      properties: {
        ...competitionArg,
        poolId: { type: 'string', description: 'Restreint à une poule (facultatif)' },
      },
      required: ['competitionId'],
    },
    annotations: { readOnlyHint: true },
    run: (deps, args) => {
      const id = str(args, 'competitionId');
      competitionOrThrow(deps, id);
      const only = typeof args.poolId === 'string' ? args.poolId : null;
      return poolsOf(deps, id)
        .filter(p => !only || p.id === only)
        .map(p => ({
          poolId: p.id,
          number: p.number,
          matchesDone: p.matches.filter(m => m.status === MatchStatus.FINISHED).length,
          matchesTotal: p.matches.length,
          ranking: calculatePoolRanking(p).map(r => ({
            rank: r.rank,
            fencer: `${r.fencer.lastName} ${r.fencer.firstName ?? ''}`.trim(),
            club: r.fencer.club ?? null,
            victories: r.victories,
            defeats: r.defeats,
            matchesPlayed: r.matchesPlayed,
            ratio: r.ratio,
            touchesScored: r.touchesScored,
            touchesReceived: r.touchesReceived,
            index: r.index,
          })),
        }));
    },
  },
  {
    name: 'get_bracket',
    title: 'Tableau d’élimination directe',
    description: 'Matchs du tableau : tour, tireurs, score, vainqueur (exempts inclus).',
    inputSchema: { type: 'object', properties: competitionArg, required: ['competitionId'] },
    annotations: { readOnlyHint: true },
    run: (deps, args) => {
      const id = str(args, 'competitionId');
      competitionOrThrow(deps, id);
      return deps.db.getTableauMatchesForExport(id);
    },
  },
  {
    name: 'list_referees',
    title: 'Arbitres d’une épreuve',
    description: 'Arbitres d’une épreuve : nom, club, catégorie, statut.',
    inputSchema: { type: 'object', properties: competitionArg, required: ['competitionId'] },
    annotations: { readOnlyHint: true },
    run: (deps, args) => {
      const id = str(args, 'competitionId');
      competitionOrThrow(deps, id);
      return deps.db.getRefereesByCompetition(id).map(r => ({
        id: r.id,
        ref: r.ref,
        lastName: r.lastName,
        firstName: r.firstName,
        club: r.club ?? null,
        category: r.category ?? null,
        status: r.status ?? null,
      }));
    },
  },
  {
    name: 'day_overview',
    title: 'Journée multi-épreuves',
    description:
      'Sans dayId : journées enregistrées. Avec dayId : épreuves, statut des arbitres partagés et conflits.',
    inputSchema: {
      type: 'object',
      properties: { dayId: { type: 'string', description: 'Identifiant de la journée' } },
    },
    annotations: { readOnlyHint: true },
    run: ({ db }, args) => {
      const dayId = typeof args.dayId === 'string' ? args.dayId : null;
      if (!dayId) return db.eventDays.listDays();
      const day = db.eventDays.getDay(dayId);
      if (!day) throw new McpToolError(`Journée inconnue : ${dayId}`);
      return { day, ...buildOverview(db, dayId) };
    },
  },
  {
    name: 'strip_occupation',
    title: 'Occupation des pistes',
    description: 'Pistes de la journée : épreuve et match en cours, piste libre ou réservée.',
    inputSchema: {
      type: 'object',
      properties: { dayId: { type: 'string', description: 'Identifiant de la journée' } },
      required: ['dayId'],
    },
    annotations: { readOnlyHint: true },
    run: ({ db }, args) => db.eventDays.getStripOccupation(str(args, 'dayId')),
  },
  {
    name: 'server_status',
    title: 'Serveur de saisie distante',
    description:
      'Serveurs distants actifs : URL, séance ouverte, arènes (match, score, statut), écrans connectés.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: ({ remoteServers }) =>
      [...remoteServers()].map(([competitionId, { server }]) => ({
        competitionId,
        url: server.getServerUrl(),
        sessionOpen: server.hasSession(),
        connectedScreens: server.clients.list().length,
        arenas: server.getAllArenas().map(a => ({
          id: a.id,
          number: a.number,
          status: a.status,
          match: a.currentMatch
            ? {
                id: a.currentMatch.id,
                fencerA:
                  `${a.currentMatch.fencerA?.lastName ?? ''} ${a.currentMatch.fencerA?.firstName ?? ''}`.trim(),
                fencerB:
                  `${a.currentMatch.fencerB?.lastName ?? ''} ${a.currentMatch.fencerB?.firstName ?? ''}`.trim(),
                scoreA: a.currentMatch.scoreA,
                scoreB: a.currentMatch.scoreB,
              }
            : null,
        })),
      })),
  },
  {
    name: 'cyrano_status',
    title: 'Appareils de piste Cyrano',
    description: 'Serveur Cyrano : en marche, port, pistes déclarées et dernier statut reçu.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: ({ cyranoStatus }) => cyranoStatus(),
  },
];
