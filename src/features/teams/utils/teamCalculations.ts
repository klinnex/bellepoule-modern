/**
 * BellePoule Modern - Team Calculations
 * Feature 22: Utility functions for team events
 * Licensed under GPL-3.0
 */

import { Team, TeamBout, TeamMatch, TeamRow, TeamMatchRow } from '../types/team.types';
import { Weapon } from '../../../shared/types';
import { calculateTableSize, generateSeedingChart } from '../../../shared/utils/tableCalculations';

export interface TeamTargetRule {
  mode: 'touches' | 'points';
  stepSize: number;
  target: number;
}

/**
 * Team match target rule, arme-aware.
 * E/F/S (and Laser in 'touches' mode) count touches, stepping by `relayStepSize`
 * per relay (FIE rule: 5-10-15…45 for 3-fencer teams). Laser in 'points' mode
 * counts cumulated zone points (A/B/C = 1/3/5) instead, using the same step.
 * Generalizes the FIE 45 = 5×3² target to any team size N: target = stepSize×N².
 */
export function getTeamTargetRule(
  weapon: Weapon,
  teamSize: number,
  laserTeamMode: 'touches' | 'points' = 'touches',
  relayStepSize: number = 5
): TeamTargetRule {
  const mode = weapon === Weapon.LASER ? laserTeamMode : 'touches';
  return { mode, stepSize: relayStepSize, target: relayStepSize * teamSize * teamSize };
}

/** Cumulative cap a team's score must reach for relay `relayIndex` (0-indexed) to end early. */
export function getRelayCap(relayIndex: number, stepSize: number): number {
  return (relayIndex + 1) * stepSize;
}

/**
 * Generate the relay pairing order for a team of `teamSize` fencers.
 * Generalizes the FIE 3-fencer pattern (1v1,2v2,3v3,1v2,2v3,3v1,1v3,2v1,3v2)
 * to any team size N: N "rounds" of N simultaneous pairings, each round
 * shifting the opponent index by one (diagonal round-robin), producing N²
 * relais total where every titulaire meets every opposing titulaire once.
 */
export function generateRelayOrder(teamSize: number): [number, number][] {
  const order: [number, number][] = [];
  for (let shift = 0; shift < teamSize; shift++) {
    for (let i = 0; i < teamSize; i++) {
      order.push([i, (i + shift) % teamSize]);
    }
  }
  return order;
}

/**
 * Generate relay bouts for a team match
 */
export function generateRelayBouts(teamA: Team, teamB: Team, maxScore: number = 5): TeamBout[] {
  const mainFencersA = teamA.fencers
    .filter(f => !f.isReserve)
    .sort((a, b) => a.teamOrder - b.teamOrder);
  const mainFencersB = teamB.fencers
    .filter(f => !f.isReserve)
    .sort((a, b) => a.teamOrder - b.teamOrder);

  const teamSize = Math.min(mainFencersA.length, mainFencersB.length);

  if (
    mainFencersA.length < 1 ||
    mainFencersB.length < 1 ||
    mainFencersA.length !== mainFencersB.length
  ) {
    throw new Error('Both teams must have the same number of main fencers');
  }

  const relayOrders = generateRelayOrder(teamSize);

  return relayOrders.map((order, index) => ({
    id: `bout-${Date.now()}-${index}`,
    order: index + 1,
    fencerA: mainFencersA[order[0]],
    fencerB: mainFencersB[order[1]],
    scoreA: 0,
    scoreB: 0,
    maxScore,
    status: 'not_started',
  }));
}

/**
 * Calculate current team score from bouts
 */
export function calculateTeamScore(
  match: TeamMatch,
  teamSize: number = 3
): { scoreA: number; scoreB: number } {
  let scoreA = 0;
  let scoreB = 0;

  for (const bout of match.bouts) {
    if (bout.status === 'finished' && bout.winner) {
      // Only count bouts won by main fencers (not reserves)
      const isMainA = bout.fencerA.teamOrder <= teamSize;
      const isMainB = bout.fencerB.teamOrder <= teamSize;

      if (bout.winner.id === bout.fencerA.id && isMainA) {
        scoreA += 1;
      } else if (bout.winner.id === bout.fencerB.id && isMainB) {
        scoreB += 1;
      }
    }
  }

  return { scoreA, scoreB };
}

/**
 * Validate team composition
 */
export function validateTeamComposition(
  team: Team,
  teamSize: number = 3,
  reserveCount: number = 1
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const mainFencers = team.fencers.filter(f => !f.isReserve);
  const reserves = team.reserveFencers || [];

  if (mainFencers.length < teamSize) {
    errors.push(`Team must have at least ${teamSize} main fencers`);
  }

  if (mainFencers.length > teamSize) {
    errors.push(`Team cannot have more than ${teamSize} main fencers`);
  }

  if (reserves.length > reserveCount) {
    errors.push(`Team cannot have more than ${reserveCount} reserve fencer(s)`);
  }

  // Check team orders are valid (1..teamSize)
  const expectedOrders = Array.from({ length: teamSize }, (_, i) => (i + 1).toString()).join(',');
  const orders = mainFencers
    .map(f => f.teamOrder)
    .sort((a, b) => a - b)
    .join(',');
  if (orders !== expectedOrders) {
    errors.push(`Main fencers must have team orders 1 to ${teamSize}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if match is complete (target reached, or all relais completed).
 * `targetRule` defaults to the classic 3-fencer FIE target (45 touches) for
 * back-compat; pass `getTeamTargetRule(...)` for arme/teamSize-aware matches.
 */
export function isTeamMatchComplete(match: TeamMatch, targetRule?: TeamTargetRule): boolean {
  const { scoreA, scoreB } = calculateTeamScore(match);
  const totalBouts = match.bouts.filter(b => b.status === 'finished').length;
  const target = targetRule?.target ?? 45;
  const totalRelaysExpected = match.bouts.length > 0 ? match.bouts.length : 9;

  return scoreA >= target || scoreB >= target || totalBouts >= totalRelaysExpected;
}

/**
 * Get match winner
 */
export function getTeamMatchWinner(match: TeamMatch): Team | null {
  if (!isTeamMatchComplete(match)) {
    return null;
  }

  const { scoreA, scoreB } = calculateTeamScore(match);

  if (scoreA > scoreB) {
    return match.teamA;
  } else if (scoreB > scoreA) {
    return match.teamB;
  }

  // In case of tie (shouldn't happen in normal play), team with more bouts won
  const boutsWonA = match.bouts.filter(
    b => b.winner?.id && match.teamA.fencers.some(f => f.id === b.winner?.id)
  ).length;
  const boutsWonB = match.bouts.filter(
    b => b.winner?.id && match.teamB.fencers.some(f => f.id === b.winner?.id)
  ).length;

  return boutsWonA > boutsWonB ? match.teamA : match.teamB;
}

export interface TeamPoolRankingRow {
  team: TeamRow;
  victories: number;
  defeats: number;
  boutsWon: number; // relais individuels gagnés
  boutsLost: number;
  pointsFor: number; // touches cumulées (règle FIE)
  pointsAgainst: number;
}

/**
 * Classement d'une poule équipes à partir des matchs terminés (DB/IPC row shapes).
 * `m.scoreBoutsA/B` = touches cumulées de la rencontre (cf. `recomputeTeamMatchScore`),
 * les relais individuels gagnés sont comptés séparément depuis `m.bouts[].winnerId`.
 */
export function calculateTeamPoolRanking(
  teams: TeamRow[],
  matches: TeamMatchRow[]
): TeamPoolRankingRow[] {
  const stats: TeamPoolRankingRow[] = teams.map(team => ({
    team,
    victories: 0,
    defeats: 0,
    boutsWon: 0,
    boutsLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  }));
  const byId = new Map(stats.map(s => [s.team.id, s]));

  for (const m of matches) {
    if (m.status !== 'finished') continue;
    const sa = byId.get(m.teamAId);
    const sb = byId.get(m.teamBId);
    if (!sa || !sb) continue;

    if (m.winnerId === m.teamAId) {
      sa.victories++;
      sb.defeats++;
    } else if (m.winnerId === m.teamBId) {
      sb.victories++;
      sa.defeats++;
    }

    sa.pointsFor += m.scoreBoutsA;
    sa.pointsAgainst += m.scoreBoutsB;
    sb.pointsFor += m.scoreBoutsB;
    sb.pointsAgainst += m.scoreBoutsA;

    for (const b of m.bouts) {
      if (b.status !== 'finished' || !b.winnerId) continue;
      // b.fencerAId appartient toujours au roster de l'équipe A par construction
      if (b.winnerId === b.fencerAId) {
        sa.boutsWon++;
        sb.boutsLost++;
      } else if (b.winnerId === b.fencerBId) {
        sb.boutsWon++;
        sa.boutsLost++;
      }
    }
  }

  return stats.sort(
    (a, b) =>
      b.victories - a.victories ||
      b.boutsWon - b.boutsLost - (a.boutsWon - a.boutsLost) ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst)
  );
}

// ============================================================================
// Tableau équipes (élimination directe) — résolution d'un round/position à
// partir des lignes DB (pas d'arbre séparé à persister : round/position
// suffit, exactement comme le tableau individuel avec table_id/round/position).
// ============================================================================

export { calculateTableSize };

/** Place les équipes déjà classées (ordre de seed = ordre du tableau) dans le tableau. */
export function placeRankedTeamsInTable(
  rankedTeams: TeamRow[],
  tableSize: number
): (TeamRow | null)[] {
  const placements: (TeamRow | null)[] = new Array(tableSize).fill(null);
  const seedingChart = generateSeedingChart(tableSize);
  const seedToPosition = new Map<number, number>();
  seedingChart.forEach((seed, pos) => seedToPosition.set(seed, pos));
  rankedTeams.forEach((team, i) => {
    const pos = seedToPosition.get(i + 1);
    if (pos !== undefined) placements[pos] = team;
  });
  return placements;
}

export interface ResolvedTeamSlot {
  team: TeamRow | null; // Connu seulement si exempt (bye) — sinon dépend de `match`
  isBye: boolean;
  match: TeamMatchRow | null;
  teamA: TeamRow | null; // Équipes résolues pour ce match, même si pas encore persisté en DB
  teamB: TeamRow | null;
}

/**
 * Résout qui occupe la position `position` au tour `round` (round = nombre de
 * matchs de ce tour ; tableSize/2 = 1er tour, …, 1 = finale), en descendant
 * récursivement jusqu'aux têtes de série si nécessaire.
 */
export function resolveTeamTableauSlot(
  round: number,
  position: number,
  tableSize: number,
  placements: (TeamRow | null)[],
  matchesByKey: Map<string, TeamMatchRow>,
  teamById: Map<string, TeamRow>
): ResolvedTeamSlot {
  if (round === tableSize / 2) {
    const a = placements[position * 2];
    const b = placements[position * 2 + 1];
    if (a && b) {
      return {
        team: null,
        isBye: false,
        teamA: a,
        teamB: b,
        match: matchesByKey.get(`${round}-${position}`) ?? null,
      };
    }
    return { team: a ?? b ?? null, isBye: true, teamA: null, teamB: null, match: null };
  }

  const childRound = round * 2;
  const childA = resolveTeamTableauSlot(
    childRound,
    position * 2,
    tableSize,
    placements,
    matchesByKey,
    teamById
  );
  const childB = resolveTeamTableauSlot(
    childRound,
    position * 2 + 1,
    tableSize,
    placements,
    matchesByKey,
    teamById
  );

  const resolveWinner = (child: ResolvedTeamSlot): TeamRow | null => {
    if (child.isBye) return child.team;
    if (child.match?.status === 'finished' && child.match.winnerId)
      return teamById.get(child.match.winnerId) ?? null;
    return null;
  };

  const teamA = resolveWinner(childA);
  const teamB = resolveWinner(childB);

  if (teamA && teamB) {
    return {
      team: null,
      isBye: false,
      teamA,
      teamB,
      match: matchesByKey.get(`${round}-${position}`) ?? null,
    };
  }
  if (teamA || teamB) {
    return { team: teamA ?? teamB, isBye: true, teamA: null, teamB: null, match: null };
  }
  return { team: null, isBye: false, teamA: null, teamB: null, match: null }; // Pas encore déterminé
}
