import type { Score } from '../../shared/types';

export type PoolSpecialStatus = 'abandon' | 'forfait' | 'exclusion';

/**
 * Scores d'un match de poule saisi dans l'application. Le statut spécial
 * (forfait / abandon / exclusion) va au perdant, comme dans le renderer (#1144).
 */
export function buildPoolScores(
  scoreA: number,
  scoreB: number,
  winner?: 'A' | 'B',
  specialStatus?: PoolSpecialStatus
): { scoreA: Score; scoreB: Score } {
  const isVictoryA = winner === 'A' || (!winner && scoreA > scoreB);
  const isVictoryB = winner === 'B' || (!winner && scoreB > scoreA);
  const specialOnA = !!specialStatus && !isVictoryA;
  const specialOnB = !!specialStatus && !specialOnA && !isVictoryB;
  const toScore = (value: number, isVictory: boolean, special: boolean): Score => ({
    value,
    isVictory,
    isAbstention: special && specialStatus === 'abandon',
    isExclusion: special && specialStatus === 'exclusion',
    isForfait: special && specialStatus === 'forfait',
  });
  return {
    scoreA: toScore(scoreA, isVictoryA, specialOnA),
    scoreB: toScore(scoreB, isVictoryB, specialOnB),
  };
}
