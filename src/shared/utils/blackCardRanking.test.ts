/**
 * Tests - classement final avec carton noir (#1418)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { applyBlackCardRanking, isBlackCarded } from './blackCardRanking';
import { FencerStatus } from '../types';

type R = Parameters<typeof applyBlackCardRanking>[0][number];

const mk = (id: string, rank: number | null, card = false, status?: FencerStatus): R => ({
  rank,
  fencer: {
    id,
    status: card ? FencerStatus.EXCLUDED : (status ?? FencerStatus.CHECKED_IN),
    exclusionReason: card ? 'black_card' : null,
  },
});

const ids = (l: R[]) => l.map(r => `${r.fencer.id}:${r.rank}`);

describe('isBlackCarded', () => {
  it('exclusion avec motif black_card uniquement', () => {
    expect(isBlackCarded(mk('a', 1, true).fencer)).toBe(true);
    expect(isBlackCarded({ status: FencerStatus.EXCLUDED, exclusionReason: null })).toBe(false);
    expect(isBlackCarded(mk('a', 1, false, FencerStatus.FORFAIT).fencer)).toBe(false);
  });
});

describe('applyBlackCardRanking', () => {
  const base = [mk('a', 1), mk('b', 2), mk('c', 3), mk('d', 4), mk('e', 5)];

  it('sans carton noir : liste inchangée', () => {
    expect(ids(applyBlackCardRanking(base))).toEqual(['a:1', 'b:2', 'c:3', 'd:4', 'e:5']);
  });

  it('le 2e exclu : 3e->2e, 4e->3e, 5e->4e, exclu en bas sans rang', () => {
    const l = [mk('a', 1), mk('b', 2, true), mk('c', 3), mk('d', 4), mk('e', 5)];
    expect(ids(applyBlackCardRanking(l))).toEqual(['a:1', 'c:2', 'd:3', 'e:4', 'b:null']);
  });

  it('le vainqueur exclu : tous remontent', () => {
    const l = [mk('a', 1, true), mk('b', 2), mk('c', 3)];
    expect(ids(applyBlackCardRanking(l))).toEqual(['b:1', 'c:2', 'a:null']);
  });

  it('le dernier exclu : les autres gardent leur rang', () => {
    const l = [mk('a', 1), mk('b', 2), mk('c', 3, true)];
    expect(ids(applyBlackCardRanking(l))).toEqual(['a:1', 'b:2', 'c:null']);
  });

  it('ex aequo 3e derrière un exclu : départagés par le classement du tableau', () => {
    const l = [mk('a', 1, true), mk('b', 2), mk('c', 3), mk('d', 3)];
    const seed = new Map([
      ['c', 7],
      ['d', 2],
    ]);
    expect(ids(applyBlackCardRanking(l, seed))).toEqual(['b:1', 'd:2', 'c:3', 'a:null']);
  });

  it("ex aequo 3e AU-DESSUS de l'exclu : inchangés", () => {
    const l = [mk('a', 1), mk('b', 2), mk('c', 3), mk('d', 3), mk('e', 5, true)];
    expect(ids(applyBlackCardRanking(l))).toEqual(['a:1', 'b:2', 'c:3', 'd:3', 'e:null']);
  });

  it('plusieurs cartons noirs', () => {
    const l = [mk('a', 1), mk('b', 2, true), mk('c', 3), mk('d', 4, true), mk('e', 5)];
    expect(ids(applyBlackCardRanking(l))).toEqual(['a:1', 'c:2', 'e:3', 'b:null', 'd:null']);
  });

  it('idempotent', () => {
    const l = [mk('a', 1), mk('b', 2, true), mk('c', 3), mk('d', 4)];
    const once = applyBlackCardRanking(l);
    expect(ids(applyBlackCardRanking(once))).toEqual(ids(once));
  });

  it('exclu simple (sans carton noir) : rang conservé', () => {
    const l = [
      mk('a', 1),
      { rank: 2, fencer: { id: 'b', status: FencerStatus.EXCLUDED, exclusionReason: null } },
      mk('c', 3),
    ];
    expect(ids(applyBlackCardRanking(l))).toEqual(['a:1', 'b:2', 'c:3']);
  });
});
