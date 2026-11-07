import { describe, it, expect } from 'vitest';
import { MAX_STRIP, normalizeStripRange, stripAtIndex, stripNumbers } from './stripRange';
import { computePoolStrips } from './poolStrips';

describe('stripRange (#1501)', () => {
  it('liste les pistes de l’intervalle', () => {
    expect(stripNumbers(5, 8)).toEqual([5, 6, 7, 8]);
    expect(stripNumbers(1, 1)).toEqual([1]);
  });

  it('normalise les bornes invalides', () => {
    expect(normalizeStripRange(0, 0)).toEqual({ start: 1, end: 1 });
    expect(normalizeStripRange(6, 2)).toEqual({ start: 6, end: 6 });
    expect(normalizeStripRange(1, 500).end).toBe(MAX_STRIP);
    expect(normalizeStripRange(NaN, NaN)).toEqual({ start: 1, end: 1 });
  });

  it('répartit en rotation sur l’intervalle', () => {
    expect([0, 1, 2, 3, 4].map(i => stripAtIndex(5, 7, i))).toEqual([5, 6, 7, 5, 6]);
  });

  it('computePoolStrips n’utilise que les pistes de l’intervalle', () => {
    const pools = [
      { id: 'a', number: 1 },
      { id: 'b', number: 2, strip: 2 }, // hors intervalle : ignorée
      { id: 'c', number: 3, strip: 6 },
    ];
    const res = computePoolStrips(pools, 7, 5);
    expect(res.get('c')).toBe(6);
    expect(res.get('a')).toBe(5);
    expect(res.get('b')).toBe(7);
  });
});
