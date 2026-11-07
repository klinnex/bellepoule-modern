/**
 * BellePoule Modern - État « poules lancées » (#1499)
 * Licensed under GPL-3.0
 */

import { MatchStatus, Pool } from '../../shared/types';
import type { Phase } from '../hooks/useCompetitionSession';

/** Au moins un match de poule saisi (score ou statut avancé) : le relancer perdrait les scores */
export const poolsHaveScores = (pools: Pool[]): boolean =>
  pools.some(p =>
    (p.matches ?? []).some(
      m => m.status !== MatchStatus.NOT_STARTED || m.scoreA != null || m.scoreB != null
    )
  );

const POST_LAUNCH_PHASES: Phase[] = ['pools', 'ranking', 'quest', 'tableau', 'results'];

/** Session sans drapeau persisté (ancienne version) : déduit si les poules ont déjà été lancées */
export const inferPoolsLaunched = (
  phase: Phase | undefined,
  pools: Pool[] | undefined,
  poolHistory: Pool[][] | undefined
): boolean =>
  (phase !== undefined && POST_LAUNCH_PHASES.includes(phase)) ||
  (poolHistory?.length ?? 0) > 0 ||
  poolsHaveScores(pools ?? []);

/**
 * Verrouillage des onglets : Préparation tant que les poules ne sont pas préparées,
 * Poules tant qu'elles n'ont pas été lancées (libres ensuite)
 */
export const poolTabLock = (s: {
  pools: Pool[];
  poolHistory: Pool[][];
  skipPoolPhase: boolean;
  poolsLaunched: boolean;
}): { prepLocked: boolean; poolsLocked: boolean } => ({
  prepLocked: s.pools.length === 0 && s.poolHistory.length === 0 && !s.skipPoolPhase,
  poolsLocked: !s.poolsLaunched && s.poolHistory.length === 0,
});
