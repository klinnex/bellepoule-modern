/**
 * BellePoule Modern - Journal des événements d'une épreuve, côté commandes (#1980)
 * Chaque commande ajoute ses événements dans la même transaction que ses écritures
 * (runCommand, docs/adr/0006). Types et charges : contrat (shared/api/events, ADR-0007).
 * Les tables actuelles restent la lecture ; le journal s'écrit en plus.
 * Licensed under GPL-3.0
 */
import type { NewJournalEvent } from '../../../database/repos/eventLogRepo';
import type { CommandContext } from './context';

export { JOURNAL_EVENT as EVENT } from '../../../shared/api/events';

/** Ajoute des événements au journal de l'épreuve ; rend la révision (null : aucun journal) */
export function recordEvents(
  ctx: CommandContext,
  competitionId: string,
  events: NewJournalEvent[]
): number | null {
  const log = ctx.db.eventLog;
  if (!log || events.length === 0) return null;
  return log.append(competitionId, events, ctx.actor ?? { source: 'engine' }, ctx.commandId);
}
