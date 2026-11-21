/**
 * BellePoule Modern - Événements du journal d'une épreuve (#1980, docs/adr/0007)
 * Un événement est un fait accompli, nommé au passé ; sa charge porte des identifiants,
 * jamais de nom (RGPD). Types et charges sont déclarés ICI, une fois, en union zod :
 * le moteur écrit ces types, le contrat les expose, les clients les lisent.
 * Évolution d'une charge : incrémenter schemaVersion et ajouter un membre ; un événement
 * stocké ne se réécrit jamais.
 * Licensed under GPL-3.0
 */
import { z } from 'zod';

const Id = z.string();
const SpecialStatus = z.enum(['abandon', 'forfait', 'exclusion']);

/** Types d'événements écrits par le moteur */
export const JOURNAL_EVENT = {
  fencerCheckedIn: 'FencerCheckedIn',
  fencerCheckedOut: 'FencerCheckedOut',
  scoreRecorded: 'ScoreRecorded',
  poolCompleted: 'PoolCompleted',
  tableauMatchDecided: 'TableauMatchDecided',
  tableauCompleted: 'TableauCompleted',
  fencerWithdrawn: 'FencerWithdrawn',
  fencerReinstated: 'FencerReinstated',
  poolsGenerated: 'PoolsGenerated',
  poolFencerAdded: 'PoolFencerAdded',
  poolRoundClosed: 'PoolRoundClosed',
  tableauGenerated: 'TableauGenerated',
} as const;

const member = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), schemaVersion: z.literal(1), payload });

/** Charge typée par type d'événement (schemaVersion 1) */
export const JournalEventBodySchema = z.discriminatedUnion('type', [
  member(JOURNAL_EVENT.fencerCheckedIn, z.object({ fencerId: Id })),
  member(JOURNAL_EVENT.fencerCheckedOut, z.object({ fencerId: Id })),
  member(
    JOURNAL_EVENT.scoreRecorded,
    z.object({
      matchId: Id,
      /** Match de poule ; absent au tableau */
      poolId: Id.optional(),
      scoreA: z.number(),
      scoreB: z.number(),
      winnerId: Id.nullable(),
      specialStatus: SpecialStatus.optional(),
      /** Tireur sanctionné par le statut spécial */
      fencerId: Id.nullable().optional(),
    })
  ),
  member(JOURNAL_EVENT.poolCompleted, z.object({ poolId: Id })),
  member(JOURNAL_EVENT.tableauMatchDecided, z.object({ matchId: Id, winnerId: Id })),
  member(JOURNAL_EVENT.tableauCompleted, z.object({})),
  // Retrait et réintégration d'un tireur (docs/adr/0016)
  member(
    JOURNAL_EVENT.fencerWithdrawn,
    z.object({
      fencerId: Id,
      reason: SpecialStatus,
      /** Exclusion sur carton noir (motif du rapport fédéral) */
      blackCard: z.boolean(),
      /** Match où le retrait a lieu ; null pour un retrait décidé à l'appel */
      matchId: Id.nullable(),
      /** Matchs perdus par le retrait */
      forfeitedMatchIds: z.array(Id),
    })
  ),
  // Tirage des poules (docs/adr/0017) : composition complète, rejouable sans graine
  member(
    JOURNAL_EVENT.poolsGenerated,
    z.object({
      round: z.number().int(),
      pools: z.array(
        z.object({
          poolId: Id,
          number: z.number().int(),
          strip: z.number().int().nullable(),
          fencerIds: z.array(Id),
          /** Ordre des matchs */
          matches: z.array(z.object({ matchId: Id, fencerAId: Id, fencerBId: Id })),
        })
      ),
    })
  ),
  // Tireur ajouté à une poule lancée : ses matchs, dans l'ordre (docs/adr/0017)
  member(
    JOURNAL_EVENT.poolFencerAdded,
    z.object({
      poolId: Id,
      fencerId: Id,
      matches: z.array(z.object({ matchId: Id, fencerAId: Id, fencerBId: Id })),
    })
  ),
  // Clôture d'un tour de poules : qualifiés (dans l'ordre, seed du tour suivant), éliminés
  member(
    JOURNAL_EVENT.poolRoundClosed,
    z.object({
      round: z.number().int(),
      qualifierCount: z.number().int().nullable(),
      qualifiedIds: z.array(Id),
      eliminatedIds: z.array(Id),
    })
  ),
  // Tableau généré : placement complet (barrages, exemptions, rangs de sortie de poules)
  member(
    JOURNAL_EVENT.tableauGenerated,
    z.object({
      size: z.number().int(),
      thirdPlaceMatch: z.boolean(),
      playAllPositions: z.boolean(),
      matches: z.array(
        z.object({
          matchId: Id,
          round: z.number().int(),
          position: z.number().int(),
          fencerAId: Id.nullable(),
          fencerBId: Id.nullable(),
          isBye: z.boolean(),
          seedA: z.number().nullable(),
          seedB: z.number().nullable(),
        })
      ),
    })
  ),
  member(
    JOURNAL_EVENT.fencerReinstated,
    z.object({ fencerId: Id, restoredStatus: z.string(), restoredMatchIds: z.array(Id) })
  ),
]);
export type JournalEventBody = z.infer<typeof JournalEventBodySchema>;
export type JournalEventType = JournalEventBody['type'];

/** Origine d'une écriture */
export const EventSourceSchema = z.enum(['screen', 'mcp', 'tablet', 'cyrano', 'opp2', 'engine']);
export type EventSource = z.infer<typeof EventSourceSchema>;

/** Événement tel que le contrat l'expose (épreuve implicite) */
export const JournalEventSchema = z.intersection(
  JournalEventBodySchema,
  z.object({
    /** Identifiant unique, stable entre postes */
    eventId: Id,
    /** Commune aux événements d'une même commande (corrélation, idempotence) */
    commandId: Id,
    /** Ordre local, croissant par épreuve */
    revision: z.number(),
    author: z.string().nullable(),
    source: EventSourceSchema,
    at: z.string(),
  })
);
export type JournalEvent = z.infer<typeof JournalEventSchema>;
