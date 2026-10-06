/**
 * Tests unitaires - performanceService
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CacheService,
  memoize,
  calculateVirtualListState,
  debounce,
  throttle,
} from './performanceService';

describe('CacheService', () => {
  it('stocke et relit une valeur', () => {
    const c = new CacheService();
    c.set('a', 42);
    expect(c.get<number>('a')).toBe(42);
    expect(c.has('a')).toBe(true);
  });

  it('retourne undefined pour une clé absente', () => {
    const c = new CacheService();
    expect(c.get('x')).toBeUndefined();
    expect(c.has('x')).toBe(false);
  });

  it('supprime et vide le cache', () => {
    const c = new CacheService();
    c.set('a', 1);
    c.set('b', 2);
    c.delete('a');
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    c.clear();
    expect(c.has('b')).toBe(false);
  });

  describe('expiration TTL', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('expire une entrée après son TTL', () => {
      const c = new CacheService(1000);
      c.set('a', 1);
      vi.advanceTimersByTime(999);
      expect(c.get('a')).toBe(1);
      vi.advanceTimersByTime(2);
      expect(c.get('a')).toBeUndefined();
      expect(c.has('a')).toBe(false);
    });

    it('respecte un TTL par entrée', () => {
      const c = new CacheService(10000);
      c.set('a', 1, 500);
      vi.advanceTimersByTime(600);
      expect(c.get('a')).toBeUndefined();
    });
  });

  it('calcule le hitRate et la taille', () => {
    const c = new CacheService();
    c.set('a', 1);
    c.get('a'); // hit
    c.get('b'); // miss
    const stats = c.getStats();
    expect(stats.size).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it('a un hitRate de 0 sans accès', () => {
    expect(new CacheService().getStats().hitRate).toBe(0);
  });
});

describe('memoize', () => {
  it('ne calcule qu’une fois pour les mêmes arguments', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const m = memoize(fn as any);
    expect(m(1, 2)).toBe(3);
    expect(m(1, 2)).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recalcule pour des arguments différents', () => {
    const fn = vi.fn((a: number) => a * 2);
    const m = memoize(fn as any);
    m(2);
    m(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('utilise le générateur de clé fourni', () => {
    const fn = vi.fn((o: { id: number; t: number }) => o.id);
    const m = memoize(fn as any, (o: any) => String(o.id));
    m({ id: 1, t: 100 });
    m({ id: 1, t: 999 }); // même clé → cache
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('calculateVirtualListState', () => {
  const config = { itemHeight: 50, overscan: 2, containerHeight: 500 };

  it('démarre à 0 en haut de liste', () => {
    const s = calculateVirtualListState(0, 100, config);
    expect(s.startIndex).toBe(0);
    expect(s.totalHeight).toBe(5000);
    expect(s.offsetY).toBe(0);
  });

  it('décale start/offset selon le scroll et l’overscan', () => {
    const s = calculateVirtualListState(500, 100, config);
    // floor(500/50) - 2 = 8
    expect(s.startIndex).toBe(8);
    expect(s.offsetY).toBe(400);
  });

  it('borne endIndex au dernier élément', () => {
    const s = calculateVirtualListState(100000, 20, config);
    expect(s.endIndex).toBe(19);
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ne déclenche qu’après le délai et une seule fois', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('exécute immédiatement puis limite les appels', () => {
    const fn = vi.fn();
    const t = throttle(fn, 200);
    t();
    t();
    t();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    t();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
