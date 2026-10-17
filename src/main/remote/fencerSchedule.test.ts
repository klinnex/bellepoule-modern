import { describe, it, expect } from 'vitest';
import { buildFencerSchedule, ScheduleMatchInput } from './fencerSchedule';

const f = (id: string, lastName: string, club = 'C') => ({ id, lastName, firstName: 'X', club });
const A = f('a', 'Alpha', 'Paris');
const B = f('b', 'Bravo');
const C = f('c', 'Charlie');
const D = f('d', 'Delta');

const matches: ScheduleMatchInput[] = [
  {
    id: 'm1',
    number: 1,
    poolId: 'p1',
    fencerA: A,
    fencerB: B,
    scoreA: 5,
    scoreB: 3,
    status: 'finished',
  },
  { id: 'm2', number: 2, poolId: 'p1', fencerA: C, fencerB: D, status: 'not_started' },
  { id: 'm3', number: 3, poolId: 'p1', fencerA: C, fencerB: A, status: 'not_started' },
  {
    id: 'm4',
    number: 4,
    poolId: 'p1',
    fencerA: A,
    fencerB: D,
    scoreA: { value: 2 },
    scoreB: { value: 5 },
    status: 'finished',
  },
];

describe('buildFencerSchedule (#1078)', () => {
  it('liste les matchs du tireur avec scores de son point de vue', () => {
    const s = buildFencerSchedule('a', matches, [{ number: 3, activePoolId: 'p1' }])!;
    expect(s.fencer).toEqual({ id: 'a', name: 'ALPHA X', club: 'Paris' });
    expect(
      s.matches.map(m => [m.order, m.opponent, m.myScore, m.opponentScore, m.victory])
    ).toEqual([
      [1, 'BRAVO X', 5, 3, true],
      [3, 'CHARLIE X', null, null, null],
      [4, 'DELTA X', 2, 5, false],
    ]);
    expect(s.victories).toBe(1);
    expect(s.defeats).toBe(1);
  });

  it('donne le prochain match, sa piste et le nombre de matchs avant', () => {
    const s = buildFencerSchedule('a', matches, [{ number: 3, activePoolId: 'p1' }])!;
    expect(s.next?.matchId).toBe('m3');
    expect(s.next?.arena).toBe(3);
    expect(s.matchesBeforeNext).toBe(1); // m2 encore à jouer
  });

  it('marque le match en cours sur une piste', () => {
    const s = buildFencerSchedule('a', matches, [
      { number: 1, currentMatchId: 'm3', currentPoolId: 'p1' },
    ])!;
    expect(s.next?.status).toBe('current');
    expect(s.next?.arena).toBe(1);
  });

  it('piste inconnue si la poule n’est assignée à aucune arène', () => {
    expect(buildFencerSchedule('a', matches, [])!.next?.arena).toBeNull();
  });

  it('null pour un tireur sans match', () => {
    expect(buildFencerSchedule('zz', matches, [])).toBeNull();
  });

  describe('tableau (#1078)', () => {
    const allPoolsDone = matches.map(m => ({ ...m, status: 'finished', scoreA: 5, scoreB: 1 }));
    const tableau: ScheduleMatchInput[] = [
      {
        id: 't8',
        isTableau: true,
        round: 8,
        fencerA: A,
        fencerB: C,
        status: 'not_started',
        arena: 4,
      },
      {
        id: 't16',
        isTableau: true,
        round: 16,
        fencerA: D,
        fencerB: A,
        scoreA: 8,
        scoreB: 15,
        status: 'finished',
      },
    ];

    it('sépare poules et tableau, tableau trié par tour', () => {
      const s = buildFencerSchedule('a', [...allPoolsDone, ...tableau], [])!;
      expect(s.matches.map(m => [m.phase, m.round])).toEqual([
        ['pool', null],
        ['pool', null],
        ['pool', null],
        ['tableau', 16],
        ['tableau', 8],
      ]);
      expect(s.matches[3]).toMatchObject({ myScore: 15, opponentScore: 8, victory: true });
    });

    it('prochain match de tableau : piste assignée au match', () => {
      const s = buildFencerSchedule(
        'a',
        [...allPoolsDone, ...tableau],
        [{ number: 1, activePoolId: 'p1' }]
      )!;
      expect(s.next).toMatchObject({ matchId: 't8', phase: 'tableau', arena: 4 });
      expect(s.matchesBeforeNext).toBeNull();
    });

    it('piste du match en cours prioritaire sur la piste prévue', () => {
      const s = buildFencerSchedule(
        'a',
        [...allPoolsDone, ...tableau],
        [{ number: 2, currentMatchId: 't8' }]
      )!;
      expect(s.next).toMatchObject({ status: 'current', arena: 2 });
    });
  });
});
