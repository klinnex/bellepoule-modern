import { describe, it, expect } from 'vitest';
import { normalizeStripPlan, nextFreeStrip, visibleArenas, DEFAULT_STRIP_PLAN } from './stripPlan';

describe('normalizeStripPlan', () => {
  it('valeurs par défaut pour une entrée invalide', () => {
    expect(normalizeStripPlan(null)).toEqual(DEFAULT_STRIP_PLAN);
    expect(normalizeStripPlan({ start: 0, unavailable: 'x' })).toEqual(DEFAULT_STRIP_PLAN);
  });
  it('trie, déduplique et filtre les pistes indisponibles', () => {
    expect(normalizeStripPlan({ start: 5, unavailable: [7, 6, 7, -1, 1.5, 'a'] })).toEqual({
      start: 5,
      unavailable: [6, 7],
    });
  });
});

describe('visibleArenas', () => {
  const arenas = [1, 2, 3, 4, 5, 6].map(number => ({ number }));
  it('masque les arènes avant la piste de départ', () => {
    expect(visibleArenas(arenas, { start: 5, unavailable: [] }).map(a => a.number)).toEqual([5, 6]);
  });
  it('tout visible par défaut', () => {
    expect(visibleArenas(arenas, DEFAULT_STRIP_PLAN)).toHaveLength(6);
  });
});

describe('nextFreeStrip (#1878)', () => {
  it('première piste libre dans l’intervalle, hors pistes prises ou indisponibles', () => {
    expect(nextFreeStrip(DEFAULT_STRIP_PLAN, new Set([1]), 4)).toBe(2);
    expect(nextFreeStrip({ start: 3, unavailable: [] }, new Set(), 4)).toBe(3);
    expect(nextFreeStrip({ start: 3, unavailable: [3] }, new Set(), 4)).toBe(4);
  });
  it('aucune piste libre dans l’intervalle : null (la poule attend)', () => {
    expect(nextFreeStrip({ start: 3, unavailable: [] }, new Set([3, 4]), 4)).toBeNull();
    expect(nextFreeStrip({ start: 5, unavailable: [] }, new Set(), 4)).toBeNull();
  });
});
