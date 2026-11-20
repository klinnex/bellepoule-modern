import { describe, it, expect } from 'vitest';
import {
  computeRefereeMatchStats,
  propagatePoolReferee,
  getRefereePresence,
  TableauMatchLike,
} from './refereeStats';
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

describe('getRefereePresence (#1016)', () => {
  const r1 = { id: 'r1', status: 'available' as const };
  const m = (status: MatchStatus, refereeId?: string) =>
    ({ status, referee: refereeId ? ({ id: refereeId } as any) : undefined }) as any;

  it('non pointé si indisponible', () => {
    expect(getRefereePresence({ ...r1, status: 'unavailable' }, [])).toBe('not_checked_in');
  });
  it('pointé tant qu’aucun match n’est généré', () => {
    expect(getRefereePresence(r1, [])).toBe('checked_in');
  });
  it('occupé avec un match assigné non terminé', () => {
    expect(getRefereePresence(r1, [m(MatchStatus.NOT_STARTED, 'r1')])).toBe('busy');
  });
  it('libre quand ses matchs sont terminés', () => {
    expect(
      getRefereePresence(r1, [m(MatchStatus.FINISHED, 'r1'), m(MatchStatus.NOT_STARTED)])
    ).toBe('free');
  });
  it('occupé quand la limite d’assignations est atteinte', () => {
    expect(
      getRefereePresence({ ...r1, maxMatchesPerDay: 1 }, [m(MatchStatus.FINISHED, 'r1')])
    ).toBe('busy');
  });
});

describe('propagatePoolReferee (#977)', () => {
  const refOf = (id: string) => ({ id, firstName: id, lastName: '' }) as unknown as Referee;
  const m = (id: string, refereeId?: string) => ({
    id,
    referee: refereeId ? refOf(refereeId) : undefined,
  });

  it('assigne le principal aux matchs sans arbitre', () => {
    const { matches, changes } = propagatePoolReferee([m('1'), m('2')], undefined, refOf('A'));
    expect(matches.map(x => x.referee?.id)).toEqual(['A', 'A']);
    expect(changes).toEqual([
      { matchId: '1', refereeId: 'A' },
      { matchId: '2', refereeId: 'A' },
    ]);
  });

  it("remplace l'ancien principal mais conserve une assignation manuelle", () => {
    const { matches, changes } = propagatePoolReferee([m('1', 'A'), m('2', 'X')], 'A', refOf('B'));
    expect(matches.map(x => x.referee?.id)).toEqual(['B', 'X']);
    expect(changes).toEqual([{ matchId: '1', refereeId: 'B' }]);
  });

  it("retire l'ancien principal quand la poule n'a plus d'arbitre", () => {
    const { matches, changes } = propagatePoolReferee([m('1', 'A'), m('2', 'X')], 'A', undefined);
    expect(matches.map(x => x.referee?.id)).toEqual([undefined, 'X']);
    expect(changes).toEqual([{ matchId: '1', refereeId: null }]);
  });
});
