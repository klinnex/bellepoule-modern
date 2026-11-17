/**
 * État d'appareil rapporté au match (#1829) : côtés par Id, cartons, états actifs.
 * Repris des tests de `cyrano/deviceState` (#1720), sur le modèle commun.
 */
import { describe, it, expect } from 'vitest';
import { cyranoFencerId } from '../cyrano/deviceState';
import { cardCounts, isActiveState, mapPisteSides, resolveSide, sideCards } from './pisteState';
import type { PisteState } from './types';

const A = '7ca21969-e092-4bdc-a987-eac9844968b7';
const B = '08f01fd6-ae32-4aac-930b-f23c2dc97543';
const match = { fencerA: { id: A }, fencerB: { id: B } };

describe('pisteState', () => {
  it('resolveSide : Id tronqué (pilote) ou complet ; inconnu ou ambigu → null', () => {
    expect(resolveSide('7ca21969', match, cyranoFencerId)).toBe('A');
    expect(resolveSide(B, match, cyranoFencerId)).toBe('B');
    expect(resolveSide('deadbeef', match, cyranoFencerId)).toBeNull();
    expect(resolveSide(undefined, match, cyranoFencerId)).toBeNull();
    const twin = { fencerA: { id: A }, fencerB: { id: `${A.slice(0, 8)}-ffff` } };
    expect(resolveSide('7ca21969', twin, cyranoFencerId)).toBeNull();
  });

  it('mapPisteSides : droite/gauche → A/B, inversion comprise', () => {
    const st = (r: string, l: string): PisteState => ({
      right: { id: r, score: 5 },
      left: { id: l, score: 2 },
    });
    expect(mapPisteSides(st('7ca21969', '08f01fd6'), match, cyranoFencerId)).toMatchObject({
      A: { score: 5 },
      B: { score: 2 },
      aOnRight: true,
    });
    expect(mapPisteSides(st('08f01fd6', '7ca21969'), match, cyranoFencerId)).toMatchObject({
      A: { score: 2 },
      B: { score: 5 },
      aOnRight: false,
    });
    expect(mapPisteSides(st('7ca21969', '7ca21969'), match, cyranoFencerId)).toBeNull();
    expect(mapPisteSides(st('7ca21969', 'ffffffff'), match, cyranoFencerId)).toBeNull();
  });

  it('sideCards : jaune, rouges, puis rouges et noirs P (jaune P non repris)', () => {
    expect(sideCards({})).toEqual([]);
    expect(sideCards({ yellowCards: 1, redCards: 2 })).toEqual(['yellow', 'red', 'red']);
    expect(sideCards({ pYellow: 1 })).toEqual([]);
    expect(sideCards({ pRed: 2 })).toEqual(['p-red', 'p-red']);
    expect(sideCards({ yellowCards: 1, pBlack: 1 })).toEqual(['yellow', 'p-black']);
  });

  it('cardCounts : cartons d’arène → compteurs à afficher', () => {
    expect(cardCounts(undefined)).toEqual({ yellowCards: 0, redCards: 0, pRed: 0, pBlack: 0 });
    expect(cardCounts(['yellow', 'red', 'red', 'p-red', 'p-black'])).toEqual({
      yellowCards: 1,
      redCards: 2,
      pRed: 1,
      pBlack: 1,
    });
  });

  it('isActiveState : assaut, halte, pause', () => {
    expect(
      (['fencing', 'halt', 'pause', 'ending', 'waiting', undefined] as const).map(isActiveState)
    ).toEqual([true, true, true, false, false, false]);
  });
});
