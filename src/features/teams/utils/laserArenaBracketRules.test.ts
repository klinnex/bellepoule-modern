/**
 * Tests unitaires - laserArenaBracketRules
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { applyRematchAvoidanceSwap, buildPoolPairHistory } from './laserArenaBracketRules';
import { calculateTableSize, placeRankedTeamsInTable } from './teamCalculations';
import { TeamRow, TeamMatchRow } from '../types/team.types';

const makeTeams = (count: number): TeamRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Équipe ${i + 1}`,
    club: 'C',
    fencers: [],
  }));

describe('buildPoolPairHistory', () => {
  it("n'enregistre que les rencontres de poule terminées", () => {
    const matches: TeamMatchRow[] = [
      {
        id: 'm1',
        teamAId: 'a',
        teamBId: 'b',
        scoreBoutsA: 5,
        scoreBoutsB: 2,
        status: 'finished',
        winnerId: 'a',
        currentBoutIndex: 3,
        bouts: [],
      },
      {
        id: 'm2',
        teamAId: 'c',
        teamBId: 'd',
        scoreBoutsA: 0,
        scoreBoutsB: 0,
        status: 'not_started',
        winnerId: null,
        currentBoutIndex: 0,
        bouts: [],
      },
    ];
    const history = buildPoolPairHistory(matches);
    expect(history.has(['a', 'b'].sort().join('|'))).toBe(true);
    expect(history.has(['c', 'd'].sort().join('|'))).toBe(false);
  });
});

describe('applyRematchAvoidanceSwap', () => {
  it('ne modifie rien avec moins de 6 équipes classées', () => {
    const teams = makeTeams(4);
    const result = applyRematchAvoidanceSwap(teams, new Set());
    expect(result.map(t => t.id)).toEqual(teams.map(t => t.id));
  });

  it("ne modifie rien si aucune revanche n'est détectée au 1er tour", () => {
    const teams = makeTeams(8);
    const result = applyRematchAvoidanceSwap(teams, new Set());
    expect(result.map(t => t.id)).toEqual(teams.map(t => t.id));
  });

  it('échange les équipes classées 5 et 6 si leur confrontation au 1er tour est une revanche de poule', () => {
    const teams = makeTeams(8);
    const tableSize = calculateTableSize(teams.length);
    const placements = placeRankedTeamsInTable(teams, tableSize);
    const seed5 = teams[4];
    const pos5 = placements.findIndex(t => t?.id === seed5.id);
    const opponentPos = pos5 % 2 === 0 ? pos5 + 1 : pos5 - 1;
    const opponent = placements[opponentPos];
    expect(opponent).not.toBeNull();

    const history = new Set([[seed5.id, opponent!.id].sort().join('|')]);
    const result = applyRematchAvoidanceSwap(teams, history);

    // Seed 5 et seed 6 ont été échangés (et eux seuls)
    expect(result[4].id).toBe(teams[5].id);
    expect(result[5].id).toBe(teams[4].id);
    expect(result[0].id).toBe(teams[0].id);
    expect(result[6].id).toBe(teams[6].id);
  });
});
