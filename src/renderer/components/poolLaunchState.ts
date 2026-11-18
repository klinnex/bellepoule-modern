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

const isScored = (m: Pool['matches'][number]): boolean =>
  m.status !== MatchStatus.NOT_STARTED || m.scoreA != null || m.scoreB != null;

/** Composition des poules (tireurs, ordre, matchs) : sert à détecter une modification en préparation (#1992) */
export const poolsLayoutKey = (pools: Pool[]): string =>
  pools
    .map(p => `${p.fencers.map(f => f.id).join(',')}|${(p.matches ?? []).map(m => m.id).join(',')}`)
    .join('/');

/** Des matchs déjà saisis disparaîtraient en remplaçant `current` par `next` (#1992) */
export const scoredMatchesLost = (current: Pool[], next: Pool[]): boolean => {
  const kept = new Set(next.flatMap(p => (p.matches ?? []).map(m => m.id)));
  return current.some(p => (p.matches ?? []).some(m => isScored(m) && !kept.has(m.id)));
};

/** Les poules contiennent exactement ces tireurs (appel inchangé depuis la préparation, #1992) */
export const poolsMatchFencers = (pools: Pool[], fencers: { id: string }[]): boolean => {
  if (pools.length === 0) return false;
  const placed = new Set(pools.flatMap(p => p.fencers.map(f => f.id)));
  return placed.size === fencers.length && fencers.every(f => placed.has(f.id));
};

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
