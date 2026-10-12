/**
 * Tests unitaires - laserArenaCalculations
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  getLaserArenaBoutCap,
  isLaserArenaBoutComplete,
  calculateLaserArenaMatchScore,
  isLaserArenaMatchComplete,
  getLaserArenaMatchWinner,
  calculateLaserArenaPoolRanking,
} from './laserArenaCalculations';
import { TeamRow, TeamMatchRow, TeamBoutRow } from '../types/team.types';

const team = (id: string): TeamRow => ({ id, name: id, club: 'C', fencers: [] });

const bout = (overrides: Partial<TeamBoutRow> = {}): TeamBoutRow => ({
  id: overrides.id ?? 'b',
  boutOrder: overrides.boutOrder ?? 1,
  fencerAId: overrides.fencerAId ?? 'fa',
  fencerBId: overrides.fencerBId ?? 'fb',
  scoreA: overrides.scoreA ?? 0,
  scoreB: overrides.scoreB ?? 0,
  maxScore: overrides.maxScore ?? 5,
  status: overrides.status ?? 'not_started',
  winnerId: overrides.winnerId ?? null,
});

const match = (bouts: TeamBoutRow[], overrides: Partial<TeamMatchRow> = {}): TeamMatchRow => ({
  id: overrides.id ?? 'm',
  teamAId: overrides.teamAId ?? 'A',
  teamBId: overrides.teamBId ?? 'B',
  scoreBoutsA: overrides.scoreBoutsA ?? 0,
  scoreBoutsB: overrides.scoreBoutsB ?? 0,
  status: overrides.status ?? 'not_started',
  winnerId: overrides.winnerId ?? null,
  currentBoutIndex: overrides.currentBoutIndex ?? 0,
  bouts,
});

describe('getLaserArenaBoutCap', () => {
  it('plafonne à 5 touches ou 3 minutes', () => {
    expect(getLaserArenaBoutCap()).toEqual({ maxTouches: 5, maxDurationSec: 180 });
  });
});

describe('isLaserArenaBoutComplete', () => {
  const cap = getLaserArenaBoutCap();

  it('se termine dès que le cumul des deux côtés atteint 5', () => {
    expect(isLaserArenaBoutComplete(3, 1, 0, cap)).toBe(false);
    expect(isLaserArenaBoutComplete(3, 2, 0, cap)).toBe(true);
    expect(isLaserArenaBoutComplete(5, 0, 0, cap)).toBe(true);
  });

  it('se termine au bout de 3 minutes même sans 5 touches', () => {
    expect(isLaserArenaBoutComplete(1, 1, 179, cap)).toBe(false);
    expect(isLaserArenaBoutComplete(1, 1, 180, cap)).toBe(true);
  });
});

describe('calculateLaserArenaMatchScore', () => {
  it('additionne uniquement les assauts terminés', () => {
    const m = match([
      bout({ scoreA: 3, scoreB: 2, status: 'finished' }),
      bout({ scoreA: 5, scoreB: 0, status: 'finished' }),
      bout({ scoreA: 2, scoreB: 3, status: 'in_progress' }),
    ]);
    expect(calculateLaserArenaMatchScore(m)).toEqual({ scoreA: 8, scoreB: 2 });
  });
});

describe('isLaserArenaMatchComplete / getLaserArenaMatchWinner', () => {
  it("n'est pas terminée tant que tous les assauts ne le sont pas", () => {
    const m = match([bout({ status: 'finished' }), bout({ status: 'not_started' })]);
    expect(isLaserArenaMatchComplete(m)).toBe(false);
    expect(getLaserArenaMatchWinner(m)).toBeNull();
  });

  it('désigne le vainqueur au total de points, pas au nombre d’assauts gagnés', () => {
    const m = match([
      bout({ scoreA: 1, scoreB: 5, status: 'finished' }),
      bout({ scoreA: 1, scoreB: 5, status: 'finished' }),
      bout({ scoreA: 5, scoreB: 0, status: 'finished' }),
    ]);
    // A gagne 1 assaut (5-0) mais B totalise plus de points (10 vs 7)
    expect(isLaserArenaMatchComplete(m)).toBe(true);
    expect(getLaserArenaMatchWinner(m)).toBe('B');
  });

  it('renvoie null en cas d’égalité totale (départage au niveau poule)', () => {
    const m = match([
      bout({ scoreA: 5, scoreB: 0, status: 'finished' }),
      bout({ scoreA: 0, scoreB: 5, status: 'finished' }),
    ]);
    expect(getLaserArenaMatchWinner(m)).toBeNull();
  });
});

describe('calculateLaserArenaPoolRanking', () => {
  it('classe par total de points marqués, pas par nombre de victoires', () => {
    const teamA = team('A');
    const teamB = team('B');
    const teamC = team('C');
    const matches: TeamMatchRow[] = [
      // A bat B et C de justesse (2 victoires) mais peu de points marqués
      match([bout({ scoreA: 3, scoreB: 2, status: 'finished' })], {
        id: 'm1',
        teamAId: 'A',
        teamBId: 'B',
        status: 'finished',
      }),
      match([bout({ scoreA: 3, scoreB: 2, status: 'finished' })], {
        id: 'm2',
        teamAId: 'A',
        teamBId: 'C',
        status: 'finished',
      }),
      // B et C, un gros score (beaucoup de points marqués au total pour B)
      match([bout({ scoreA: 15, scoreB: 3, status: 'finished' })], {
        id: 'm3',
        teamAId: 'B',
        teamBId: 'C',
        status: 'finished',
      }),
    ];
    const ranking = calculateLaserArenaPoolRanking([teamA, teamB, teamC], matches);
    // Points marqués : A = 3+3 = 6, B = 2+15 = 17, C = 2+3 = 5
    expect(ranking[0].team.id).toBe('B');
    expect(ranking[0].pointsFor).toBe(17);
    expect(ranking[1].team.id).toBe('A');
    expect(ranking[2].team.id).toBe('C');
  });

  it('signale une égalité totale (points et ratio) sans la départager', () => {
    const teamA = team('A');
    const teamB = team('B');
    const matches: TeamMatchRow[] = [
      match([bout({ scoreA: 5, scoreB: 5, status: 'finished' })], {
        id: 'm1',
        teamAId: 'A',
        teamBId: 'B',
        status: 'finished',
      }),
    ];
    const ranking = calculateLaserArenaPoolRanking([teamA, teamB], matches);
    expect(ranking[0].tied).toBe(true);
    expect(ranking[1].tied).toBe(true);
  });
});
