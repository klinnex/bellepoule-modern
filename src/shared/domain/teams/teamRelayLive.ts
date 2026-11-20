/**
 * BellePoule Modern - Relais FIE en saisie temps réel (tablette, #1086)
 * Cible progressive : le relais n s'arrête quand une équipe atteint n × palier
 * (5-10-15…45), ou au bout de 3 minutes. Score d'équipe = touches cumulées.
 * Licensed under GPL-3.0
 */

import type { TeamTargetRule } from './teamCalculations';

/** Durée maximale d'un relais (règle FIE) */
export const FIE_RELAY_DURATION_SEC = 180;

interface RelayBout {
  boutOrder: number;
  scoreA: number;
  scoreB: number;
  status: string;
}

/** Score cumulé de la rencontre : relais précédents terminés + relais en cours. */
export function relayCumul(
  bouts: RelayBout[],
  current: RelayBout | null,
  liveA: number,
  liveB: number
): { cumulA: number; cumulB: number } {
  const prior = bouts.filter(
    b => b.status === 'finished' && (!current || b.boutOrder < current.boutOrder)
  );
  return {
    cumulA: prior.reduce((s, b) => s + b.scoreA, 0) + liveA,
    cumulB: prior.reduce((s, b) => s + b.scoreB, 0) + liveB,
  };
}

/** Palier cumulé à atteindre pour terminer le relais n (1-indexé), plafonné à la cible. */
export function relayCapFor(boutOrder: number, rule: Pick<TeamTargetRule, 'stepSize' | 'target'>) {
  return Math.min(boutOrder * rule.stepSize, rule.target);
}

export function isRelayComplete(
  cumulA: number,
  cumulB: number,
  cap: number,
  elapsedSec: number,
  maxDurationSec = FIE_RELAY_DURATION_SEC
): boolean {
  return cumulA >= cap || cumulB >= cap || elapsedSec >= maxDurationSec;
}

/** Vainqueur du relais = équipe en tête au cumul (null si égalité). */
export function relayWinnerSide(cumulA: number, cumulB: number): 'A' | 'B' | null {
  return cumulA > cumulB ? 'A' : cumulB > cumulA ? 'B' : null;
}
