import { describe, it, expect } from 'vitest';
import { moveItem } from './BookSectionsModal';

describe('moveItem', () => {
  it('déplace vers le haut et le bas', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('borne aux extrémités', () => {
    const l = ['a', 'b'];
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 1, 1)).toBe(l);
  });
});
