import { describe, expect, it } from 'vitest';
import {
  allPlacesBracketBouts,
  allPlacesCompetitionBouts,
  allPlacesFieldSize,
  countCompetitionBouts,
  countTableauBouts,
  firstTableauRound,
  isTableauBout,
  tableauRemainingWaves,
  type TableauBoutLike,
} from './tableauBouts';

const F = {};
const m = (round: number, a: unknown, b: unknown, winner: unknown = null): TableauBoutLike => ({
  round,
  fencerA: a,
  fencerB: b,
  winner,
});

/** Tableau de 8 (6 tireurs, 2 exempts) : seul le 1er tour est connu. */
const table8 = (): TableauBoutLike[] => [
  m(8, F, null, F),
  m(8, F, F),
  m(8, F, F),
  m(8, F, null, F),
  m(4, F, null),
  m(4, null, F),
  m(2, null, null),
];

describe('tableauBouts (#1817)', () => {
  it('premier tour = plus grand numéro de tour', () => {
    expect(firstTableauRound(table8())).toBe(8);
    expect(firstTableauRound([])).toBe(-Infinity);
  });

  it('compte les tours suivants même sans tireurs connus, exempts exclus', () => {
    const c = countTableauBouts(table8());
    expect(c.total).toBe(5); // 2 matchs de T8 + 2 demies + finale
    expect(c.done).toBe(0);
    expect(c.remainingByRound.get(8)).toBe(2);
    expect(c.remainingByRound.get(4)).toBe(2);
    expect(c.remainingByRound.get(2)).toBe(1);
  });

  it('tableau de 64 complet : 63 matchs dès le premier tour', () => {
    const ms: TableauBoutLike[] = [];
    for (let r = 64; r >= 2; r /= 2)
      for (let i = 0; i < r / 2; i++) ms.push(r === 64 ? m(r, F, F) : m(r, null, null));
    expect(countTableauBouts(ms).total).toBe(63);
  });

  it('qualification d’office (vainqueur sans adversaire) hors décompte', () => {
    expect(isTableauBout(m(4, F, null, F), 8)).toBe(false);
    expect(isTableauBout(m(4, F, F, F), 8)).toBe(true);
  });

  it('petite finale comptée avec la finale', () => {
    const c = countTableauBouts([m(4, F, F), m(4, F, F), m(3, null, null), m(2, null, null)]);
    expect(c.total).toBe(4);
    expect(c.remainingByRound.get(2)).toBe(2);
    expect(tableauRemainingWaves(c, 2)).toBe(2);
  });

  it('sans numéro de tour : seuls les matchs aux deux tireurs connus', () => {
    const c = countTableauBouts([
      { fencerA: F, fencerB: F, winner: F },
      { fencerA: F, fencerB: null, winner: null },
    ]);
    expect(c).toMatchObject({ done: 1, total: 1 });
  });

  it('vagues restantes : tours enchaînés, pistes partagées dans un tour', () => {
    const c = countTableauBouts(table8());
    expect(tableauRemainingWaves(c, 1)).toBe(5);
    expect(tableauRemainingWaves(c, 4)).toBe(3);
  });
});

describe('toutes les places (#1817)', () => {
  it('tableau complet de 2^k : 2^(k−1) × k matchs', () => {
    expect(allPlacesBracketBouts(2)).toBe(1);
    expect(allPlacesBracketBouts(4)).toBe(4);
    expect(allPlacesBracketBouts(8)).toBe(12);
    expect(allPlacesBracketBouts(64)).toBe(192);
  });

  it('exempts au premier tour', () => {
    // 6 tireurs, tableau de 8 : 2 + (2 + 1 + 1) + 1, perdants du 1er tour en finale de places
    expect(allPlacesBracketBouts(6)).toBe(2 + 1 + 2 + 1 + 1);
  });

  it('barrages : tireurs au-delà de la puissance de 2', () => {
    // 10 tireurs : 2 barrages + tableau de 8 complet + places 9-10
    expect(allPlacesCompetitionBouts(10)).toBe(2 + 12 + 1);
  });

  it('taille du champ déduite des barrages', () => {
    const main: TableauBoutLike[] = [m(16, F, F), m(16, F, F)];
    for (let r = 8; r >= 2; r /= 2) for (let i = 0; i < r / 2; i++) main.push(m(r, null, null));
    expect(allPlacesFieldSize(main)).toBe(10);
  });

  it('deux décomptes : principal et compétition, consolantes jouées comprises', () => {
    const main: TableauBoutLike[] = [];
    for (let r = 8; r >= 2; r /= 2) for (let i = 0; i < r / 2; i++) main.push(m(r, F, F, F));
    main.push(m(3, null, null));
    const cons = [{ matches: [m(4, F, F, F), m(4, F, F), m(3, null, null), m(2, null, null)] }];
    const c = countCompetitionBouts(main, cons, true);
    expect(c.main).toMatchObject({ done: 7, total: 8 });
    expect(c).toMatchObject({ done: 8, total: 12, allPlaces: true });
    expect(countCompetitionBouts(main, cons, false)).toMatchObject({ total: 8, allPlaces: false });
  });
});
