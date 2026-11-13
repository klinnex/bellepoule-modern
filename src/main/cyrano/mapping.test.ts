import { describe, it, expect } from 'vitest';
import { buildCyrano, parseCyrano } from './codec';
import { buildDisp } from './disp';
import { fencersOfMatch, mergeDeviceCards, parseCyranoTime, cyranoFencerId } from './mapping';

const ID_A = '7ca21969-e092-4a1b-9c3d-000000000001';
const ID_B = 'b3f0a1c2-5d6e-4f70-8a9b-000000000002';
const match = {
  fencerA: { id: ID_A },
  fencerB: { id: ID_B },
} as never;

describe('cyranoFencerId', () => {
  it('tronque l’Id à 8 caractères, comme la trame', () => {
    expect(cyranoFencerId(ID_A)).toBe('7ca21969');
  });

  it('un DISP émis avec un UUID porte le même Id que celui relu dans un INFO', () => {
    const disp = buildCyrano({
      protocol: 'EFP1.1',
      command: 'DISP',
      piste: '1',
      compe: 'test',
      right: { id: ID_A, name: 'MARTIN P', nat: 'FRA', score: 0, status: 'U' },
      left: { id: ID_B, name: 'DURAND P', nat: 'FRA', score: 0, status: 'U' },
    } as never);
    const parsed = parseCyrano(disp.replace('|DISP|', '|INFO|'));
    expect(parsed?.right?.id).toBe(cyranoFencerId(ID_A));
    expect(parsed?.left?.id).toBe(cyranoFencerId(ID_B));
  });

  it('buildDisp reste compatible avec un tireur sans Id', () => {
    const d = buildDisp({
      phase: 1,
      poulTab: '1',
      match: 1,
      weapon: 'E',
      right: { id: ID_A, lastName: 'Martin', firstName: 'Pierre' },
      left: { id: ID_B, lastName: 'Durand', firstName: 'Paul' },
    });
    expect(d.weapon).toBe('E');
  });
});

describe('fencersOfMatch', () => {
  const base = { protocol: 'EFP1.1', command: 'INFO', piste: '1', compe: 'test' } as const;

  it('range les tireurs par côté A / B, quel que soit le côté physique', () => {
    const straight = fencersOfMatch(
      { ...base, right: { id: '7ca21969', score: 2 }, left: { id: 'b3f0a1c2', score: 1 } },
      match
    );
    expect(straight?.A.score).toBe(2);
    expect(straight?.B.score).toBe(1);
    const swapped = fencersOfMatch(
      { ...base, right: { id: 'b3f0a1c2', score: 1 }, left: { id: '7ca21969', score: 2 } },
      match
    );
    expect(swapped?.A.score).toBe(2);
    expect(swapped?.B.score).toBe(1);
  });

  it('retourne null si un Id ne correspond pas au match', () => {
    expect(
      fencersOfMatch({ ...base, right: { id: '7ca21969' }, left: { id: 'zzzzzzzz' } }, match)
    ).toBeNull();
  });

  it('retourne null sans les deux tireurs', () => {
    expect(fencersOfMatch({ ...base, right: { id: '7ca21969' } }, match)).toBeNull();
  });
});

describe('parseCyranoTime', () => {
  it('m:ss et m:ss.cc en secondes', () => {
    expect(parseCyranoTime('3:00')).toBe(180);
    expect(parseCyranoTime('2:57')).toBe(177);
    expect(parseCyranoTime('1:00.25')).toBe(60);
    expect(parseCyranoTime('0:09.99')).toBe(9);
  });

  it('valeurs illisibles : undefined', () => {
    expect(parseCyranoTime(undefined)).toBeUndefined();
    expect(parseCyranoTime('')).toBeUndefined();
    expect(parseCyranoTime('3:75')).toBeUndefined();
    expect(parseCyranoTime('abc')).toBeUndefined();
  });
});

describe('mergeDeviceCards', () => {
  it('reconstruit jaunes et rouges depuis les compteurs', () => {
    expect(mergeDeviceCards([], { yellow: 1, red: 1 })).toEqual(['yellow', 'red']);
  });

  it('garde blanc et noir', () => {
    expect(mergeDeviceCards(['black'], { yellow: 1 })).toEqual(['yellow', 'black']);
  });

  it('compteur absent : valeur actuelle conservée', () => {
    expect(mergeDeviceCards(['yellow', 'red'], {})).toEqual(['yellow', 'red']);
  });

  it('inchangé : ordre conservé', () => {
    expect(mergeDeviceCards(['white', 'yellow'], { yellow: 1 })).toEqual(['white', 'yellow']);
  });
});
