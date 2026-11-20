/**
 * BellePoule Modern - Contrat d'API unique (#1981, lot 1)
 * Chaque opération est décrite une seule fois : entrée (validée par zod), sortie, droit requis,
 * exposition MCP. Les adaptateurs IPC (src/main/api/ipcAdapter.ts) et MCP
 * (src/main/api/mcpAdapter.ts) en sont dérivés ; l'écran appelle un BpmClient
 * (src/shared/api/client.ts) au lieu de window.electronAPI.
 * Le renderer n'importe que les types (import type) : zod reste dans le bundle main.
 * Licensed under GPL-3.0
 */
import { z } from 'zod';

/** Droits (utilisés par le sous-ticket 4, rôles et permissions) */
export type Permission = 'competition:read' | 'fencers:write' | 'score:write' | 'cards:read';

export type OperationKind = 'command' | 'query' | 'subscription';

/** Exposition comme outil MCP : écriture pour une commande, lecture pour une requête */
export interface McpExposure {
  name: string;
  title: string;
  destructive?: boolean;
  idempotent?: boolean;
}

export interface OperationDef<
  K extends OperationKind = OperationKind,
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
> {
  kind: K;
  /** Description (documentation, outil MCP) */
  description: string;
  input: I;
  output: O;
  permission: Permission;
  mcp?: McpExposure;
}

type Def<K extends OperationKind, I extends z.ZodType, O extends z.ZodType> = Omit<
  OperationDef<K, I, O>,
  'kind'
>;

export const command = <I extends z.ZodType, O extends z.ZodType>(d: Def<'command', I, O>) => ({
  kind: 'command' as const,
  ...d,
});
export const query = <I extends z.ZodType, O extends z.ZodType>(d: Def<'query', I, O>) => ({
  kind: 'query' as const,
  ...d,
});
export const subscription = <I extends z.ZodType, O extends z.ZodType>(
  d: Omit<Def<'subscription', I, O>, 'mcp'>
) => ({ kind: 'subscription' as const, ...d });

export type ApiContract = Record<string, OperationDef>;

// ─── Schémas communs ─────────────────────────────────────────────────────────

const Id = z.string().trim().min(1).max(200);
const CompetitionId = Id.describe('Identifiant de la compétition (list_competitions)');
const DryRun = z.boolean().optional().describe('Décrit le résultat sans rien écrire');
const Side = z.enum(['A', 'B']);
const FencerKey = z.union([Id, z.number().int().min(0)]);

const MatchCard = z.object({
  id: z.string(),
  fencerId: z.string(),
  cardType: z.string(),
  reason: z.string(),
  cardGroup: z.number(),
  timestamp: z.string(),
  pointsAwarded: z.number(),
  resultingExclusion: z.boolean(),
});

// ─── Contrat ─────────────────────────────────────────────────────────────────

export const contract = {
  checkIn: command({
    description:
      'Pointe (présent) ou dépointe des tireurs d’une épreuve, par identifiant ou numéro de dossard (ref).',
    input: z.object({
      competitionId: CompetitionId,
      fencers: z.array(FencerKey).min(1).max(1000).describe('Identifiants ou numéros (ref)'),
      present: z.boolean().describe('true : présent ; false : absent'),
      dryRun: DryRun,
    }),
    output: z.object({
      dryRun: z.boolean(),
      status: z.string(),
      matched: z.number(),
      updated: z.number(),
      skipped: z.number(),
      unknown: z.array(z.union([z.string(), z.number()])),
    }),
    permission: 'fencers:write',
    mcp: { name: 'check_in', title: 'Pointer des tireurs', idempotent: true },
  }),

  recordScore: command({
    description:
      'Score d’un match de poule ou de tableau (matchId : list_matches), mêmes contrôles que l’écran : score maximum, égalité tranchée par « winner » (ou « priority » en poule), statut spécial du perdant. ' +
      'Classements recalculés ; au tableau, le vainqueur passe au tour suivant. Ne saisir que des scores donnés par le DT ; « dryRun: true » contrôle le score sans l’écrire.',
    input: z.object({
      competitionId: CompetitionId,
      matchId: Id.describe('Identifiant du match (list_matches)'),
      scoreA: z.number().int().min(0).max(99).describe('Touches du tireur A'),
      scoreB: z.number().int().min(0).max(99).describe('Touches du tireur B'),
      winner: Side.optional().describe('Vainqueur imposé'),
      specialStatus: z
        .enum(['abandon', 'forfait', 'exclusion'])
        .optional()
        .describe('Statut du perdant'),
      priority: Side.optional().describe('Égalité en poule : prioritaire'),
      dryRun: DryRun,
    }),
    output: z.looseObject({ dryRun: z.boolean(), kind: z.enum(['pool', 'bracket']) }),
    permission: 'score:write',
    mcp: { name: 'record_score', title: 'Saisir un score', idempotent: true },
  }),

  getMatchCards: query({
    description: 'Cartons d’un match, en ordre chronologique.',
    input: z.object({ matchId: Id }),
    output: z.array(MatchCard),
    permission: 'cards:read',
  }),

  getCardsByMatchIds: query({
    description: 'Cartons de plusieurs matchs (feuilles imprimées), en ordre chronologique.',
    input: z.object({ matchIds: z.array(z.string()).max(5000) }),
    output: z.array(z.object({ matchId: z.string(), fencerId: z.string(), cardType: z.string() })),
    permission: 'cards:read',
  }),

  onCompetitionEvents: subscription({
    description: 'Événements de données (tireurs, matchs, session…) d’une épreuve ou de toutes.',
    input: z.object({ competitionId: Id.optional() }),
    output: z.object({ type: z.string(), competitionId: z.string().optional() }),
    permission: 'competition:read',
  }),
} satisfies ApiContract;

// ─── Types dérivés ───────────────────────────────────────────────────────────

export type Contract = typeof contract;
export type OperationName = keyof Contract;
type OfKind<K extends OperationKind> = {
  [N in OperationName]: Contract[N]['kind'] extends K ? N : never;
}[OperationName];
export type CommandName = OfKind<'command'>;
export type QueryName = OfKind<'query'>;
export type SubscriptionName = OfKind<'subscription'>;
/** Entrée telle que l'appelant la fournit (champs optionnels compris) */
export type Input<N extends OperationName> = z.input<Contract[N]['input']>;
/** Entrée après validation (valeurs par défaut appliquées) */
export type ParsedInput<N extends OperationName> = z.output<Contract[N]['input']>;
export type Output<N extends OperationName> = z.output<Contract[N]['output']>;
