/**
 * BellePoule Modern - Couche domaine : accès aux épreuves (#1880)
 * Licensed under GPL-3.0
 */
import type { Competition } from '../../../shared/types';
import { CommandError, type CommandContext } from './context';

export function getCompetitionOrThrow(ctx: CommandContext, id: string): Competition {
  const comp = typeof id === 'string' && id ? ctx.db.getCompetition(id) : null;
  if (!comp) throw new CommandError('competition_not_found', `Épreuve introuvable : ${id}`);
  return comp;
}

/** Numéros de phase de l'état de session (useCompetitionSession.PHASE_NUMBERS) */
const PHASE_NAMES: Record<number, string> = {
  0: 'checkin',
  1: 'poolprep',
  2: 'pools',
  3: 'ranking',
  4: 'quest',
  5: 'tableau',
  6: 'results',
  7: 'remote',
  8: 'logs',
  9: 'referees',
  10: 'teams',
  11: 'teampool',
  12: 'teamtableau',
  13: 'teamranking',
};

export function phaseName(currentPhase: unknown): string | null {
  return typeof currentPhase === 'number' ? (PHASE_NAMES[currentPhase] ?? null) : null;
}
