// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PINNED_KEY,
  RECENT_KEY,
  pickRecent,
  readIds,
  recordOpen,
  togglePinned,
} from './competitionListRecent';
import type { Competition } from '../../shared/types';

const comps = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => ({ id, title: id }) as Competition);

describe('competitionListRecent', () => {
  beforeEach(() => localStorage.clear());

  it('mémorise les ouvertures sans doublon, la plus récente en tête', () => {
    recordOpen('a');
    recordOpen('b');
    expect(recordOpen('a')).toEqual(['a', 'b']);
  });

  it('épingle puis désépingle', () => {
    expect(togglePinned('c')).toEqual(['c']);
    expect(togglePinned('c')).toEqual([]);
  });

  it('épinglées d’abord, identifiants disparus ignorés, 5 au plus', () => {
    const picked = pickRecent(comps, ['a', 'zzz', 'b', 'c', 'd', 'e'], ['g']);
    expect(picked.map(c => c.id)).toEqual(['g', 'a', 'b', 'c', 'd']);
  });

  it('tolère un stockage corrompu', () => {
    localStorage.setItem(RECENT_KEY, '{oops');
    localStorage.setItem(PINNED_KEY, '"x"');
    expect(readIds(RECENT_KEY)).toEqual([]);
    expect(readIds(PINNED_KEY)).toEqual([]);
  });
});
