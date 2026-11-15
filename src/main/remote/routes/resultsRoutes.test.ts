/**
 * Tests de la page publique des résultats : tours du tableau (#1858).
 */
import { describe, it, expect } from 'vitest';
import { publicTableauRounds } from './resultsRoutes';

const f = (id: string) => ({ id, lastName: id.toUpperCase(), firstName: 'X', club: 'C' });

describe('publicTableauRounds (#1858)', () => {
  it('finale en premier, exempts exclus, score et vainqueur exposés', () => {
    const rounds = publicTableauRounds([
      {
        id: 'm1',
        round: 4,
        position: 1,
        fencerA: f('a'),
        fencerB: f('b'),
        winner: f('a'),
        scoreA: { value: 15 },
        scoreB: { value: 9 },
      },
      { id: 'm2', round: 4, position: 0, fencerA: f('c'), fencerB: null, isBye: true },
      { id: 'm3', round: 2, position: 0, fencerA: f('a'), fencerB: f('c'), status: 'not_started' },
    ] as never);
    expect(rounds.map(r => r.round)).toEqual([2, 4]);
    expect(rounds[1].matches).toHaveLength(1);
    expect(rounds[1].matches[0]).toMatchObject({
      scoreA: 15,
      scoreB: 9,
      winnerId: 'a',
      finished: true,
    });
    expect(rounds[0].matches[0]).toMatchObject({ finished: false, winnerId: null });
    expect(rounds[0].matches[0].fencerA).toEqual({
      id: 'a',
      lastName: 'A',
      firstName: 'X',
      club: 'C',
    });
  });

  it('sans tableau : liste vide', () => {
    expect(publicTableauRounds(undefined)).toEqual([]);
  });
});
