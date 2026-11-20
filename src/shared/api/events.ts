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
