/**
 * BellePoule Modern - Journal des événements d'une épreuve, côté domaine (#1980, étape 1)
 * Chaque commande du domaine ajoute ses événements dans la même transaction que ses écritures.
 * Les tables actuelles restent la lecture ; le journal s'écrit en plus (pas de changement
 * de comportement).
 * Licensed under GPL-3.0
 */
import type { NewCompetitionEvent } from '../../../database/repos/eventLogRepo';
import type { CommandContext } from './context';

/** Types d'événements écrits par le moteur */
export const EVENT = {
  fencerCheckedIn: 'FencerCheckedIn',
  fencerCheckedOut: 'FencerCheckedOut',
  scoreRecorded: 'ScoreRecorded',
  poolCompleted: 'PoolCompleted',
  tableauMatchDecided: 'TableauMatchDecided',
  tableauCompleted: 'TableauCompleted',
} as const;

/** Ajoute des événements au journal de l'épreuve ; rend la révision (null : aucun journal) */
export function recordEvents(
  ctx: CommandContext,
  competitionId: string,
  events: NewCompetitionEvent[]
): number | null {
  const log = ctx.db.eventLog;
  if (!log || events.length === 0) return null;
  return log.append(competitionId, events, ctx.actor ?? { source: 'engine' });
}
