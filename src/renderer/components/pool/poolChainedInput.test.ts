import { describe, it, expect } from 'vitest';
import { nextChainedPair } from './poolChainedInput';

const all = () => true;

describe('nextChainedPair', () => {
  it('parcourt la ligne 1 de gauche à droite, puis la ligne 2 au-dessus de la diagonale', () => {
    const seq: string[] = [];
    let cur = nextChainedPair(4, { rowIdx: 0, colIdx: 0 }, all);
    while (cur) {
      seq.push(`${cur.rowIdx}-${cur.colIdx}`);
      cur = nextChainedPair(4, cur, all);
    }
    expect(seq).toEqual(['0-1', '0-2', '0-3', '1-2', '1-3', '2-3']);
  });

  it('visite chaque match une seule fois (pas de case miroir)', () => {
    const n = 5;
    const seen = new Set<string>();
    let cur = nextChainedPair(n, { rowIdx: 0, colIdx: 0 }, all);
    let count = 0;
    while (cur) {
      expect(cur.colIdx).toBeGreaterThan(cur.rowIdx);
      seen.add(`${cur.rowIdx}-${cur.colIdx}`);
      count++;
      cur = nextChainedPair(n, cur, all);
    }
    expect(count).toBe((n * (n - 1)) / 2);
    expect(seen.size).toBe(count);
  });

  it('saute les cases non jouables', () => {
    const blocked = (p: { rowIdx: number; colIdx: number }) => !(p.rowIdx === 0 && p.colIdx === 2);
    expect(nextChainedPair(4, { rowIdx: 0, colIdx: 1 }, blocked)).toEqual({ rowIdx: 0, colIdx: 3 });
  });

  it('renvoie null en fin de poule', () => {
    expect(nextChainedPair(3, { rowIdx: 1, colIdx: 2 }, all)).toBeNull();
  });

  it('reprend depuis une case de la moitié inférieure sans revenir en arrière', () => {
    expect(nextChainedPair(4, { rowIdx: 2, colIdx: 3 }, all)).toBeNull();
    expect(nextChainedPair(4, { rowIdx: 1, colIdx: 3 }, all)).toEqual({ rowIdx: 2, colIdx: 3 });
  });
});
