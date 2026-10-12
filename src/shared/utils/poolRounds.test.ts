import { describe, it, expect } from 'vitest';
import { Fencer, FencerStatus, PoolRanking } from '../types';
import {
  getRoundQualifierCount,
  selectNextRoundFencers,
  seedFencersFromRanking,
  mergeRoundRankings,
} from './poolRounds';
import { distributeFencersToPoolsSerpentine } from './poolCalculations';

const fencer = (id: string, ranking?: number, status = FencerStatus.CHECKED_IN): Fencer =>
  ({ id, lastName: `N${id}`, firstName: `P${id}`, club: `C${id}`, ranking, status }) as Fencer;

const entry = (f: Fencer, rank: number): PoolRanking => ({
  fencer: f,
  rank,
  victories: 0,
  defeats: 0,
  matchesPlayed: 0,
  touchesScored: 0,
  touchesReceived: 0,
  index: 0,
  ratio: 0,
});

describe('getRoundQualifierCount', () => {
  it('retourne le nombre pour le tour demandé', () => {
    expect(getRoundQualifierCount([64, 32], 2)).toBe(64);
    expect(getRoundQualifierCount([64, 32], 3)).toBe(32);
  });
  it('0 ou absent = tous', () => {
    expect(getRoundQualifierCount([0], 2)).toBeUndefined();
    expect(getRoundQualifierCount(undefined, 2)).toBeUndefined();
    expect(getRoundQualifierCount([64], 3)).toBeUndefined();
  });
});

describe('selectNextRoundFencers', () => {
  const fs = Array.from({ length: 6 }, (_, i) => fencer(`f${i + 1}`, 100 - i));
  const ranking = fs.map((f, i) => entry(f, i + 1));

  it('garde les N premiers et seed = place du tour', () => {
    const { qualified, eliminated } = selectNextRoundFencers(ranking, 4);
    expect(qualified.map(f => f.id)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(qualified.map(f => f.ranking)).toEqual([1, 2, 3, 4]);
    expect(eliminated.map(f => f.id)).toEqual(['f5', 'f6']);
  });

  it('garde tous les ex-aequo à la coupure', () => {
    const tied = ranking.map((r, i) => (i === 4 ? { ...r, rank: 4 } : r));
    const { qualified } = selectNextRoundFencers(tied, 4);
    expect(qualified).toHaveLength(5);
  });

  it('écarte abandons / exclusions', () => {
    const withAb = [entry(fencer('x', 1, FencerStatus.ABANDONED), 1), ...ranking.slice(1)];
    const { qualified, eliminated } = selectNextRoundFencers(withAb);
    expect(qualified.map(f => f.id)).not.toContain('x');
    expect(eliminated.map(f => f.id)).toEqual(['x']);
  });

  it('sans quota : tous les actifs', () => {
    expect(selectNextRoundFencers(ranking).qualified).toHaveLength(6);
  });
});

describe('seedFencersFromRanking', () => {
  it('nouveau tirage différent du tirage initial', () => {
    // Classement initial : f1..f8 ; classement du tour 1 inversé
    const fs = Array.from({ length: 8 }, (_, i) => fencer(`f${i + 1}`, i + 1));
    const round1 = [...fs].reverse().map((f, i) => entry(f, i + 1));
    const initial = distributeFencersToPoolsSerpentine(fs, 2, []);
    const seeded = seedFencersFromRanking(fs, round1);
    expect(seeded.map(f => f.id)).toEqual(['f8', 'f7', 'f6', 'f5', 'f4', 'f3', 'f2', 'f1']);
    const ids = (pools: Fencer[][]) => pools.map(p => p.map(f => f.id).sort());
    const next = distributeFencersToPoolsSerpentine(seeded, 2, []);
    // Têtes de série : f1 (tirage initial) vs f8 (tour 2)
    expect(ids(initial)[0]).toContain('f1');
    expect(ids(next)[0]).toContain('f8');
  });

  it('tireurs absents du classement précédent en fin', () => {
    const a = fencer('a');
    const b = fencer('b');
    const seeded = seedFencersFromRanking([a, b], [entry(b, 1)]);
    expect(seeded.map(f => f.id)).toEqual(['b', 'a']);
  });
});

describe('mergeRoundRankings', () => {
  it('dernier tour puis éliminés, sans cumul, éliminés marqués', () => {
    const fs = Array.from({ length: 5 }, (_, i) => fencer(`f${i + 1}`));
    const round1 = fs.map((f, i) => entry(f, i + 1));
    // Tour 2 : f1..f3, ordre f3, f1, f2
    const round2 = [entry(fs[2], 1), entry(fs[0], 2), entry(fs[1], 3)];
    const merged = mergeRoundRankings([round1, round2]);
    expect(merged.map(r => r.fencer.id)).toEqual(['f3', 'f1', 'f2', 'f4', 'f5']);
    expect(merged.map(r => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(merged[0].fencer.status).toBe(FencerStatus.CHECKED_IN);
    expect(merged[3].fencer.status).toBe(FencerStatus.ELIMINATED);
  });

  it('conserve les ex-aequo des éliminés', () => {
    const fs = Array.from({ length: 4 }, (_, i) => fencer(`f${i + 1}`));
    const round1 = [entry(fs[0], 1), entry(fs[1], 2), entry(fs[2], 3), entry(fs[3], 3)];
    const round2 = [entry(fs[1], 1), entry(fs[0], 2)];
    expect(mergeRoundRankings([round1, round2]).map(r => r.rank)).toEqual([1, 2, 3, 3]);
  });
});
