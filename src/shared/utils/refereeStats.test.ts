import { describe, it, expect } from 'vitest';
import { computeRefereeMatchStats, TableauMatchLike } from './refereeStats';
import { Match, MatchStatus, Referee } from '../types';

const ref = (id: string, firstName: string, lastName: string): Referee =>
  ({ id, firstName, lastName, club: 'C' }) as unknown as Referee;

const poolMatch = (id: string, refereeId: string | null, status: MatchStatus): Match =>
  ({ id, status, referee: refereeId ? { id: refereeId } : undefined }) as unknown as Match;

describe('computeRefereeMatchStats', () => {
  const referees = [
    ref('r1', 'Anne', 'Martin'),
    ref('r2', 'Bob', 'Durand'),
    ref('r3', 'Zoé', 'Petit'),
  ];

  it('compte matchs de poule terminés et en attente', () => {
    const stats = computeRefereeMatchStats(
      referees,
      [
        poolMatch('m1', 'r1', MatchStatus.FINISHED),
        poolMatch('m2', 'r1', MatchStatus.FINISHED),
        poolMatch('m3', 'r1', MatchStatus.NOT_STARTED),
        poolMatch('m4', 'r2', MatchStatus.CANCELLED),
        poolMatch('m5', null, MatchStatus.FINISHED),
        poolMatch('m1', 'r1', MatchStatus.FINISHED), // doublon
      ],
      []
    );
    const r1 = stats.find(s => s.refereeId === 'r1')!;
    expect(r1).toMatchObject({
      poolMatches: 2,
      tableauMatches: 0,
      totalMatches: 2,
      pendingMatches: 1,
    });
    expect(stats.find(s => s.refereeId === 'r2')!.totalMatches).toBe(0);
  });

  it('compte matchs de tableau, ignore les exempts, crédite chaque arbitre en mode expert', () => {
    const tableau: TableauMatchLike[] = [
      { id: 't1', isBye: false, winner: {}, referee: { id: 'r2' } },
      {
        id: 't2',
        isBye: false,
        winner: {},
        referee: { id: 'r2' },
        referees: [{ id: 'r2' }, { id: 'r3' }],
      },
      { id: 't3', isBye: true, winner: {}, referee: { id: 'r2' } },
      { id: 't4', isBye: false, winner: null, referee: { id: 'r3' } },
    ];
    const stats = computeRefereeMatchStats(referees, [], tableau);
    expect(stats.find(s => s.refereeId === 'r2')).toMatchObject({
      tableauMatches: 2,
      totalMatches: 2,
      pendingMatches: 0,
    });
    expect(stats.find(s => s.refereeId === 'r3')).toMatchObject({
      tableauMatches: 1,
      totalMatches: 1,
      pendingMatches: 1,
    });
  });

  it('trie par total décroissant puis nom', () => {
    const stats = computeRefereeMatchStats(
      referees,
      [poolMatch('m1', 'r3', MatchStatus.FINISHED)],
      []
    );
    expect(stats.map(s => s.refereeId)).toEqual(['r3', 'r1', 'r2']);
  });
});
