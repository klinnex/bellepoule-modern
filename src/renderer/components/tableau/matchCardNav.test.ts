import { describe, it, expect } from 'vitest';
import { pickNeighbour, isNavKey, NavRect } from './matchCardNav';

const r = (col: number, row: number): NavRect => ({
  left: col * 250,
  right: col * 250 + 200,
  top: row * 120,
  bottom: row * 120 + 100,
});

describe('matchCardNav', () => {
  // Colonne 0 : 4 matchs ; colonne 1 : 2 matchs alignés entre eux
  const cards = [r(0, 0), r(0, 1), r(0, 2), r(0, 3), r(1, 0.5), r(1, 2.5)];

  it('isNavKey', () => {
    expect(isNavKey('ArrowLeft')).toBe(true);
    expect(isNavKey('Tab')).toBe(false);
  });

  it('bas / haut restent dans la colonne', () => {
    expect(pickNeighbour(cards[0], cards.slice(1), 'ArrowDown')).toBe(0); // cards[1]
    expect(pickNeighbour(cards[1], [cards[0], cards[2], cards[3]], 'ArrowUp')).toBe(0);
  });

  it('droite : tour suivant le plus proche', () => {
    const others = cards.filter((_, i) => i !== 0);
    expect(others[pickNeighbour(cards[0], others, 'ArrowRight')]).toBe(cards[4]);
    const others3 = cards.filter((_, i) => i !== 3);
    expect(others3[pickNeighbour(cards[3], others3, 'ArrowRight')]).toBe(cards[5]);
  });

  it('gauche : tour précédent', () => {
    const others = cards.filter((_, i) => i !== 4);
    expect(others[pickNeighbour(cards[4], others, 'ArrowLeft')]).toBe(cards[0]);
  });

  it('bord : -1', () => {
    expect(pickNeighbour(cards[0], cards.slice(1), 'ArrowUp')).toBe(-1);
    expect(pickNeighbour(cards[5], cards.slice(0, 5), 'ArrowRight')).toBe(-1);
  });
});
