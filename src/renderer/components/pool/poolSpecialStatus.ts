/**
 * BellePoule Modern - Résultat d'un match de poule sur statut spécial (médical / forfait / exclusion)
 * Extrait de PoolView (#1418) : le tireur désigné perd, son adversaire est déclaré vainqueur.
 * Licensed under GPL-3.0
 */

import { LASER_FORFEIT_WINNER_SCORE } from '../../../shared/utils/poolCalculations';

export interface SpecialStatusOutcomeInput {
  /** Côté AFFICHÉ du tireur désigné */
  side: 'left' | 'right';
  /** Les tireurs sont affichés inversés (B à gauche) */
  inverted: boolean;
  status: 'abandon' | 'forfait' | 'exclusion';
  isLaserSabre: boolean;
  /** Scores saisis, dans l'ordre d'affichage (gauche / droite) */
  editScoreLeft: string;
  editScoreRight: string;
  scoreA?: number | null;
  scoreB?: number | null;
  maxScore: number;
}

export interface SpecialStatusOutcome {
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B';
  /** Côté (A/B du match) du tireur désigné */
  loser: 'A' | 'B';
}

export function specialStatusOutcome(i: SpecialStatusOutcomeInput): SpecialStatusOutcome {
  const loser: 'A' | 'B' = (i.side === 'left') === i.inverted ? 'B' : 'A';
  const winner: 'A' | 'B' = loser === 'A' ? 'B' : 'A';
  let loserScore = 0;
  let winnerScore = (winner === 'A' ? i.scoreA : i.scoreB) || i.maxScore;
  // Sabre Laser (forfait/abandon) : le forfait garde ses points marqués, l'adversaire obtient 15
  if (i.isLaserSabre && i.status !== 'exclusion') {
    const typed = i.side === 'left' ? i.editScoreLeft : i.editScoreRight;
    loserScore = Math.min(parseInt(typed, 10) || 0, LASER_FORFEIT_WINNER_SCORE - 1);
    winnerScore = LASER_FORFEIT_WINNER_SCORE;
  }
  return {
    scoreA: loser === 'A' ? loserScore : winnerScore,
    scoreB: loser === 'B' ? loserScore : winnerScore,
    winner,
    loser,
  };
}
