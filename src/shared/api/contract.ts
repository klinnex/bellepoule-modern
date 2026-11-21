/**
 * BellePoule Modern - Contrat d'API unique (#1981, lot 1)
 * Chaque opération est décrite une seule fois : entrée (validée par zod), sortie, droit requis,
 * exposition MCP. Les adaptateurs IPC (src/main/engine/api/ipcAdapter.ts) et MCP
 * (src/main/engine/api/mcpAdapter.ts) en sont dérivés ; l'écran appelle un BpmClient
 * (src/shared/api/client.ts) au lieu de window.electronAPI.
 * Le renderer n'importe que les types (import type) : zod reste dans le bundle main.
 * Licensed under GPL-3.0
 */
import { z } from 'zod';
import { JournalEventSchema } from './events';

/** Droits (utilisés par le sous-ticket 4, rôles et permissions) */
export type Permission =
  'competition:read' | 'fencers:write' | 'score:write' | 'cards:read' | 'referees:write';

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
const ExpectedRevision = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    'Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées.'
  );
const CommandId = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau)'
  );
/** Révision du journal après la commande (absente si rien n'a été écrit) */
const Revision = z.number().int().optional();

const NeutralityCriterion = z.enum(['club', 'nationality', 'region']);
const Neutrality = z.object({
  club: z.boolean().optional().describe('Pas d’arbitre du club d’un tireur'),
  nationality: z.boolean().optional().describe('Pas d’arbitre de la nation d’un tireur'),
  region: z.boolean().optional().describe('Pas d’arbitre de la ligue d’un tireur'),
});
const ResolvedRefereeing = z.object({
  neutrality: z.object({ club: z.boolean(), nationality: z.boolean(), region: z.boolean() }),
  balance: z.boolean(),
  maxConsecutiveMatches: z.number(),
  minRestTimeMinutes: z.number(),
});

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
      expectedRevision: ExpectedRevision,
      commandId: CommandId,
    }),
    output: z.object({
      dryRun: z.boolean(),
      status: z.string(),
      matched: z.number(),
      updated: z.number(),
      skipped: z.number(),
      unknown: z.array(z.union([z.string(), z.number()])),
      revision: Revision,
    }),
    permission: 'fencers:write',
    mcp: { name: 'check_in', title: 'Pointer des tireurs', idempotent: true },
  }),

  recordScore: command({
    description:
      'Score d’un match de poule (tour courant) ou de tableau, tableaux de classement compris (matchId : list_matches), mêmes contrôles que l’écran : score maximum, égalité tranchée par « winner » (ou « priority » en poule), statut spécial du perdant. ' +
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
      blackCard: z
        .boolean()
        .optional()
        .describe('Exclusion sur carton noir (motif du rapport fédéral)'),
      priority: Side.optional().describe('Égalité en poule : prioritaire'),
      dryRun: DryRun,
      expectedRevision: ExpectedRevision,
      commandId: CommandId,
    }),
    output: z.looseObject({
      dryRun: z.boolean(),
      kind: z.enum(['pool', 'bracket']),
      revision: Revision,
    }),
    permission: 'score:write',
    mcp: { name: 'record_score', title: 'Saisir un score', idempotent: true },
  }),

  withdrawFencer: command({
    description:
      'Retire un tireur de l’épreuve : abandon (médical), forfait ou exclusion (« blackCard » : carton noir). ' +
      'À l’appel : statut seul. En poules : ses matchs non disputés sont perdus (DNS s’il n’a commencé aucun match). ' +
      'Au tableau : son match en cours est perdu, l’adversaire passe. Refus si le tableau est terminé ou si l’adversaire n’est pas encore connu. ' +
      '« dryRun: true » donne les matchs perdus sans rien écrire. Annulation : reinstate_fencer.',
    input: z.object({
      competitionId: CompetitionId,
      fencerId: Id.describe('Identifiant du tireur'),
      reason: z.enum(['abandon', 'forfait', 'exclusion']).describe('Motif du retrait'),
      blackCard: z.boolean().optional().describe('Exclusion sur carton noir (rapport fédéral)'),
      matchId: Id.optional().describe('Match où le retrait a lieu (carton, abandon sur la piste)'),
      dryRun: DryRun,
      expectedRevision: ExpectedRevision,
      commandId: CommandId,
    }),
    output: z.object({
      dryRun: z.boolean(),
      fencerId: z.string(),
      status: z.string(),
      exclusionReason: z.enum(['black_card', 'dns']).nullable(),
      phase: z.enum(['checkin', 'pools', 'tableau']),
      forfeitedMatchIds: z.array(z.string()),
      revision: Revision,
    }),
    permission: 'fencers:write',
    mcp: { name: 'withdraw_fencer', title: 'Retirer un tireur', destructive: true },
  }),

  reinstateFencer: command({
    description:
      'Annule le retrait d’un tireur (abandon, forfait, exclusion) : statut et matchs d’avant le retrait. ' +
      'Refus si un match qui suit a été joué depuis, ou si le tableau a été tiré après un retrait en poules.',
    input: z.object({
      competitionId: CompetitionId,
      fencerId: Id.describe('Identifiant du tireur'),
      dryRun: DryRun,
      expectedRevision: ExpectedRevision,
      commandId: CommandId,
    }),
    output: z.object({
      dryRun: z.boolean(),
      fencerId: z.string(),
      status: z.string(),
      restoredMatchIds: z.array(z.string()),
      revision: Revision,
    }),
    permission: 'fencers:write',
    mcp: { name: 'reinstate_fencer', title: 'Réintégrer un tireur' },
  }),

  setRefereeingSettings: command({
    description:
      'Réglages d’affectation des arbitres de l’épreuve (neutralité club / nation / ligue, équilibrage de la charge, rotation). Seuls les champs fournis changent ; les autres réglages de l’épreuve sont conservés.',
    input: z.object({
      competitionId: CompetitionId,
      neutrality: Neutrality.optional(),
      balance: z.boolean().optional().describe('Équilibrer la charge entre arbitres'),
      maxConsecutiveMatches: z.number().int().min(1).max(20).optional(),
      minRestTimeMinutes: z.number().int().min(0).max(240).optional(),
      dryRun: DryRun,
      expectedRevision: ExpectedRevision,
      commandId: CommandId,
    }),
    output: z.object({ dryRun: z.boolean(), refereeing: ResolvedRefereeing, revision: Revision }),
    permission: 'referees:write',
    mcp: {
      name: 'set_refereeing_settings',
      title: 'Réglages d’affectation des arbitres',
      idempotent: true,
    },
  }),

  assignReferees: command({
    description:
      'Un arbitre principal par poule sans arbitre, parmi les arbitres pointés, par le même moteur que l’écran (affectation optimale, neutralité selon les réglages de l’épreuve ; un arbitre peut enchaîner plusieurs poules). Une poule sans arbitre neutre reste sans arbitre : « unassigned » donne les arbitres écartés et leurs raisons, « warnings » le résumé. « replace: true » réaffecte toutes les poules.',
    input: z.object({
      competitionId: CompetitionId,
      replace: z.boolean().optional().describe('Réaffecter toutes les poules'),
      includeUnchecked: z.boolean().optional().describe('Accepter les arbitres non pointés'),
      dryRun: DryRun,
      expectedRevision: ExpectedRevision,
      commandId: CommandId,
    }),
    output: z.object({
      dryRun: z.boolean(),
      assignments: z.array(
        z.object({ poolNumber: z.number(), referee: z.string(), refereeId: z.string() })
      ),
      unassigned: z.array(
        z.object({
          poolNumber: z.number(),
          conflicts: z.array(
            z.object({
              referee: z.string(),
              refereeId: z.string(),
              reasons: z.array(NeutralityCriterion),
            })
          ),
        })
      ),
      warnings: z.array(z.string()),
      revision: Revision,
    }),
    permission: 'referees:write',
    mcp: { name: 'assign_referees', title: 'Arbitres des poules', idempotent: true },
  }),

  assignReferee: command({
    description:
      'Arbitre d’une poule choisi à la main : il remplace l’arbitre principal et passe sur les matchs de la poule. Un arbitre non neutre est accepté et signalé (« conflicts »). « refereeId: null » retire l’arbitre.',
    input: z.object({
      competitionId: CompetitionId,
      poolNumber: z.number().int().min(1).describe('Numéro de la poule'),
      refereeId: Id.nullable().describe('Identifiant de l’arbitre (list_referees), ou null'),
      dryRun: DryRun,
      expectedRevision: ExpectedRevision,
      commandId: CommandId,
    }),
    output: z.object({
      dryRun: z.boolean(),
      poolNumber: z.number(),
      referee: z.string().nullable(),
      conflicts: z.array(NeutralityCriterion),
      warnings: z.array(z.string()),
      revision: Revision,
    }),
    permission: 'referees:write',
    mcp: { name: 'assign_referee', title: 'Arbitre d’une poule (à la main)', idempotent: true },
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

  getCompetitionEvents: query({
    description:
      'Journal d’une épreuve (#1980) : événements postérieurs à la révision « since » (resynchronisation, audit), auteur, source et heure. Identifiants seulement, pas de noms.',
    input: z.object({
      competitionId: CompetitionId,
      since: z.number().int().min(0).optional().describe('Dernière révision connue (0 : tout)'),
      limit: z.number().int().min(1).max(5000).optional().describe('Nombre maximum (1000)'),
    }),
    output: z.object({ revision: z.number(), events: z.array(JournalEventSchema) }),
    permission: 'competition:read',
    mcp: { name: 'get_competition_events', title: 'Journal d’une épreuve' },
  }),

  getMatchHistory: query({
    description:
      'Historique d’un match dans le journal de l’épreuve : auteur, source, heure de chaque score passé par recordScore (écran, tablettes, appareils de piste, agent). ' +
      'Pas encore journalisés (ADR-0005) : abandon, forfait, exclusion et carton noir, correction d’une poule après tirage du tableau, épreuves par équipes, tableaux séparés.',
    input: z.object({ competitionId: CompetitionId, matchId: Id }),
    output: z.array(JournalEventSchema),
    permission: 'competition:read',
  }),

  onCompetitionEvents: subscription({
    description: 'Événements de données (tireurs, matchs, session…) d’une épreuve ou de toutes.',
    input: z.object({ competitionId: Id.optional() }),
    output: z.object({
      type: z.string(),
      competitionId: z.string().optional(),
      /** journal:appended : nouvelle révision du journal (#1980) */
      revision: z.number().optional(),
    }),
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
