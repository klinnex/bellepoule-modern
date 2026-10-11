import { describe, it, expect } from 'vitest';
import { computePoolStrips } from './poolStrips';

describe('computePoolStrips', () => {
  it('attribue les pistes dans l’ordre des poules', () => {
    const m = computePoolStrips(
      [
        { id: 'b', number: 2 },
        { id: 'a', number: 1 },
      ],
      4
    );
    expect(m.get('a')).toBe(1);
    expect(m.get('b')).toBe(2);
  });

  it('respecte les pistes imposées et saute les pistes prises', () => {
    const m = computePoolStrips(
      [
        { id: 'a', number: 1 },
        { id: 'b', number: 2, strip: 1 },
        { id: 'c', number: 3 },
      ],
      3
    );
    expect(m.get('b')).toBe(1);
    expect(m.get('a')).toBe(2);
    expect(m.get('c')).toBe(3);
  });

  it('ignore les poules au-delà du nombre de pistes', () => {
    const m = computePoolStrips(
      [
        { id: 'a', number: 1 },
        { id: 'b', number: 2 },
      ],
      1
    );
    expect(m.get('a')).toBe(1);
    expect(m.has('b')).toBe(false);
  });
});
