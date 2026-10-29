import { describe, it, expect } from 'vitest';
import { appendHistory, MAX_HISTORY_ENTRIES } from './poolPrepHistory';

const W = 5 * 60 * 1000;
const e = (timestamp: number) => ({ timestamp });

describe('appendHistory', () => {
  it('plafonne le nombre d’entrées', () => {
    let h: { timestamp: number }[] = [];
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 15; i++) {
      h = appendHistory(h, h.length - 1, e(1000 + i), W);
    }
    expect(h).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(h[h.length - 1].timestamp).toBe(1000 + MAX_HISTORY_ENTRIES + 14);
  });

  it('abandonne les états après l’index courant', () => {
    const h = appendHistory([e(1), e(2), e(3)], 0, e(4), W);
    expect(h.map(x => x.timestamp)).toEqual([1, 4]);
  });

  it('retire les états hors fenêtre', () => {
    const h = appendHistory([e(0), e(W + 10)], 1, e(W + 20), W);
    expect(h.map(x => x.timestamp)).toEqual([W + 10, W + 20]);
  });
});
