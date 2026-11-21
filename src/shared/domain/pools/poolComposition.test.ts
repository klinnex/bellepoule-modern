/**
 * Poules composées par le DT (docs/adr/0017) : identifiants et ordre conservés, contrôles.
 */
import { describe, it, expect } from 'vitest';
import { MatchStatus, type Fencer } from '../../types';
import { composePools } from './poolComposition';

const now = new Date('2026-12-06T09:00:00Z');
const fencers = new Map(['a', 'b', 'c', 'd'].map(id => [id, { id, lastName: id } as Fencer]));
const opts = { poolMaxScore: 5, round: 2, now };
const pool = (over: Record<string, unknown> = {}) => ({
  poolId: 'p1',
  number: 1,
  strip: 3,
  fencerIds: ['a', 'b', 'c'],
  matches: [
    { matchId: 'm2', fencerAId: 'b', fencerBId: 'c' },
    { matchId: 'm1', fencerAId: 'a', fencerBId: 'b' },
  ],
  ...over,
});

describe('composePools', () => {
  it('identifiants, piste, ordre des matchs et tour conservés', () => {
    const res = composePools([pool()], fencers, opts);
    if (!res.ok) throw new Error(res.code);
    const [p] = res.pools;
    expect(p).toMatchObject({ id: 'p1', number: 1, strip: 3, phaseId: 'phase-pools-r2' });
    expect(p.matches.map(m => [m.id, m.number, m.fencerA?.id, m.fencerB?.id])).toEqual([
      ['m2', 1, 'b', 'c'],
      ['m1', 2, 'a', 'b'],
    ]);
    expect(p.matches.every(m => m.status === MatchStatus.NOT_STARTED && m.maxScore === 5)).toBe(
      true
    );
  });

  it.each([
    [{ fencerIds: ['a', 'x'] }, 'unknown_fencer'],
    [{ fencerIds: ['a'] }, 'pool_too_small'],
    [{ matches: [{ matchId: 'm', fencerAId: 'a', fencerBId: 'd' }] }, 'invalid_match'],
    [{ matches: [{ matchId: 'm', fencerAId: 'a', fencerBId: 'a' }] }, 'invalid_match'],
  ])('refus %#', (over, code) => {
    expect(composePools([pool(over)], fencers, opts)).toMatchObject({ ok: false, code });
  });

  it('un tireur dans deux poules, identifiant répété : refus', () => {
    const second = pool({ poolId: 'p2', number: 2, fencerIds: ['a', 'd'], matches: [] });
    expect(composePools([pool(), second], fencers, opts)).toMatchObject({
      ok: false,
      code: 'duplicate_fencer',
    });
    const sameId = pool({ poolId: 'p1', number: 2, fencerIds: ['d', 'c'], matches: [] });
    expect(
      composePools([pool({ fencerIds: ['a', 'b'], matches: [] }), sameId], fencers, opts)
    ).toMatchObject({
      ok: false,
      code: 'duplicate_id',
    });
  });
});
