/**
 * BellePoule Modern - Laser Sabre "arena" team format
 * Règlement épreuve par équipe Sabre Laser (ASL-FFE, 2026) : assauts
 * indépendants plafonnés à 5 touches valides ou 3 minutes, score d'une
 * rencontre = total des points marqués sur les 9 (ou N²) assauts.
 * Distinct du relais FIE classique (`teamCalculations.ts`, cible cumulée
 * progressive) : ce module ne modifie ni ne réutilise sa logique de cible.
 * Licensed under GPL-3.0
 */

import { TeamMatchRow, TeamRow } from '../types/team.types';

export interface LaserArenaBoutCap {
  maxTouches: number;
  maxDurationSec: number;
}

/** Plafond d'un assaut arène Sabre Laser : 5 touches valides ou 3 minutes. */
export function getLaserArenaBoutCap(): LaserArenaBoutCap {
  return { maxTouches: 5, maxDurationSec: 180 };
}

/**
 * Un assaut se termine dès que le cumul des touches valides des deux côtés
 * atteint le plafond, ou que le temps imparti est écoulé.
 */
export function isLaserArenaBoutComplete(
  touchesA: number,
  touchesB: number,
  elapsedSec: number,
  cap: LaserArenaBoutCap = getLaserArenaBoutCap()
): boolean {
  return touchesA + touchesB >= cap.maxTouches || elapsedSec >= cap.maxDurationSec;
}

/**
 * Score total d'une rencontre = somme des points de tous les assauts
 * terminés (pas de cible de fin anticipée par palier, contrairement au
 * relais FIE classique).
 */
export function calculateLaserArenaMatchScore(match: TeamMatchRow): {
  scoreA: number;
  scoreB: number;
} {
  let scoreA = 0;
  let scoreB = 0;
  for (const bout of match.bouts) {
    if (bout.status !== 'finished') continue;
    scoreA += bout.scoreA;
    scoreB += bout.scoreB;
  }
  return { scoreA, scoreB };
}

/** Une rencontre est terminée quand tous les assauts prévus ont été joués. */
export function isLaserArenaMatchComplete(match: TeamMatchRow): boolean {
  return match.bouts.length > 0 && match.bouts.every(b => b.status === 'finished');
}

/**
 * Vainqueur de la rencontre = équipe au total de points le plus haut.
 * `null` en cas d'égalité (le règlement ne départage qu'au niveau poule,
 * pas au niveau d'une rencontre individuelle).
 */
export function getLaserArenaMatchWinner(match: TeamMatchRow): 'A' | 'B' | null {
  if (!isLaserArenaMatchComplete(match)) return null;
  const { scoreA, scoreB } = calculateLaserArenaMatchScore(match);
  if (scoreA > scoreB) return 'A';
  if (scoreB > scoreA) return 'B';
  return null;
}

export interface LaserArenaPoolRankingRow {
  team: TeamRow;
  pointsFor: number;
  pointsAgainst: number;
  victories: number;
  defeats: number;
  draws: number;
  tied: boolean; // égalité avec le rang suivant/précédent après tous les critères — tirage au sort manuel
}

/**
 * Classement de poule format arène : critère principal = total de points
 * marqués cumulés (pas le nombre de victoires), puis ratio marqués/reçus,
 * puis égalité laissée au tirage au sort (signalée via `tied`, pas résolue
 * automatiquement côté logiciel).
 */
export function calculateLaserArenaPoolRanking(
  teams: TeamRow[],
  matches: TeamMatchRow[]
): LaserArenaPoolRankingRow[] {
  const stats: LaserArenaPoolRankingRow[] = teams.map(team => ({
    team,
    pointsFor: 0,
    pointsAgainst: 0,
    victories: 0,
    defeats: 0,
    draws: 0,
    tied: false,
  }));
  const byId = new Map(stats.map(s => [s.team.id, s]));

  for (const m of matches) {
    if (m.status !== 'finished') continue;
    const sa = byId.get(m.teamAId);
    const sb = byId.get(m.teamBId);
    if (!sa || !sb) continue;

    const { scoreA, scoreB } = calculateLaserArenaMatchScore(m);
    sa.pointsFor += scoreA;
    sa.pointsAgainst += scoreB;
    sb.pointsFor += scoreB;
    sb.pointsAgainst += scoreA;

    if (scoreA > scoreB) {
      sa.victories++;
      sb.defeats++;
    } else if (scoreB > scoreA) {
      sb.victories++;
      sa.defeats++;
    } else {
      sa.draws++;
      sb.draws++;
    }
  }

  const ratio = (s: LaserArenaPoolRankingRow) =>
    s.pointsAgainst === 0 ? s.pointsFor : s.pointsFor / s.pointsAgainst;

  const sorted = [...stats].sort((a, b) => b.pointsFor - a.pointsFor || ratio(b) - ratio(a));

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.pointsFor === b.pointsFor && ratio(a) === ratio(b)) {
      a.tied = true;
      b.tied = true;
    }
  }

  return sorted;
}
