import { describe, it, expect } from 'vitest';
import { autoAssignReferees } from './refereeAutoAssign';
import type { Fencer, Match, Pool, Referee } from '../types';
import { MatchStatus } from '../types';

const fencer = (id: string, club: string, extra: Partial<Fencer> = {}): Fencer =>
  ({ id, firstName: id, lastName: id, club, nationality: 'FRA', ...extra }) as Fencer;

const referee = (id: string, club: string, extra: Partial<Referee> = {}): Referee =>
  ({
    id,
    firstName: id,
    lastName: '',
    club,
    nationality: 'FRA',
    status: 'available',
    ...extra,
  }) as Referee;

let n = 0;
const match = (a: Fencer, b: Fencer, extra: Partial<Match> = {}): Match =>
  ({
    id: `m${++n}`,
    number: n,
    fencerA: a,
    fencerB: b,
    status: MatchStatus.NOT_STARTED,
    ...extra,
  }) as Match;

const pool = (id: string, number: number, fencers: Fencer[]): Pool => {
  const matches = [match(fencers[0], fencers[1], { poolId: id })];
  return { id, number, fencers, matches } as Pool;
};

describe('autoAssignReferees', () => {
  it('exemple de l’issue : chaque poule a un arbitre neutre, même arbitre pour toute la poule', () => {
    const p1 = pool('p1', 1, [fencer('a1', 'A'), fencer('b1', 'B')]);
    const p2 = pool('p2', 2, [fencer('a2', 'A'), fencer('c2', 'C')]);
    p1.matches.push(match(p1.fencers[1], p1.fencers[0], { poolId: 'p1' }));
    const refs = [
      referee('R1', 'C', { category: 'Régional' }),
      referee('R2', 'X', { category: 'National' }),
    ];
    const pending = [...p1.matches, ...p2.matches];
    const res = autoAssignReferees(pending, [p1, p2], refs, {
      neutrality: { club: true, nationality: false, region: false },
    });
    expect(res.shortages).toEqual([]);
    for (const m of p1.matches) expect(res.assignments.get(m.id)?.id).toBe('R1');
    expect(res.assignments.get(p2.matches[0].id)?.id).toBe('R2');
  });

  it('ignore les arbitres occupés dans une autre épreuve et diagnostique le manque', () => {
    const p1 = pool('p1', 4, [fencer('a', 'Lyon'), fencer('b', 'Paris')]);
    const refs = [referee('R1', 'Lyon'), referee('R5', 'Metz')];
    const res = autoAssignReferees(p1.matches, [p1], refs, {
      neutrality: { club: true, nationality: false, region: false },
      busyElsewhere: new Set(['R5']),
    });
    expect(res.assignments.size).toBe(0);
    expect(res.shortages).toHaveLength(1);
    expect(res.shortages[0].slots).toEqual([{ kind: 'pool', number: 4 }]);
    expect(res.shortages[0].compatible).toEqual([]);
    expect(res.shortages[0].conflicts[0].referee.id).toBe('R1');
    expect(res.shortages[0].conflicts[0].reasons).toEqual(['club']);
  });

  it('garde l’arbitre verrouillé à la main', () => {
    const p1 = pool('p1', 1, [fencer('a', 'A'), fencer('b', 'B')]);
    const refs = [referee('R1', 'X'), referee('R2', 'Y')];
    const m = p1.matches[0];
    const res = autoAssignReferees(p1.matches, [p1], refs, {
      neutrality: { club: true, nationality: false, region: false },
      lockedMatchIds: new Set([m.id]),
      current: new Map([[m.id, refs[1]]]),
      matchesToday: new Map([['R2', 50]]),
    });
    expect(res.assignments.get(m.id)?.id).toBe('R2');
  });

  it('tableau : neutralité sur les deux tireurs, un arbitre par match du tour', () => {
    const m1 = match(fencer('x', 'A'), fencer('y', 'B'), { round: 8 });
    const m2 = match(fencer('z', 'C'), fencer('w', 'D'), { round: 8 });
    const refs = [referee('RA', 'C'), referee('RC', 'A')];
    const res = autoAssignReferees([m1, m2], [], refs, {
      neutrality: { club: true, nationality: false, region: false },
    });
    expect(res.assignments.get(m1.id)?.id).toBe('RA');
    expect(res.assignments.get(m2.id)?.id).toBe('RC');
    expect(res.shortages).toEqual([]);
  });
});
