import { describe, it, expect } from 'vitest';
import {
  cyranoCards,
  cyranoFencerId,
  cyranoPCards,
  isActiveCyranoState,
  mapCyranoSides,
  parseCyranoStopwatch,
  pCardValue,
  resolveCyranoSide,
} from './deviceState';
import { buildCyrano, parseCyrano } from './codec';

const A = '7ca21969-e092-4bdc-a987-eac9844968b7';
const B = '08f01fd6-ae32-4aac-930b-f23c2dc97543';
const match = { fencerA: { id: A }, fencerB: { id: B } } as any;

describe('deviceState (#1720)', () => {
  it('Id UUID : le préfixe de 8 caractères qui circule dans les trames', () => {
    expect(cyranoFencerId(A)).toBe('7ca21969');
    // Aller-retour réel par le codec
    const frame = buildCyrano({
      protocol: 'EFP1.1',
      command: 'DISP',
      piste: '1',
      compe: '',
      right: { id: A },
      left: { id: B },
    });
    expect(parseCyrano(frame)?.right?.id).toBe('7ca21969');
  });

  it('resolveCyranoSide : Id tronqué ou complet ; inconnu ou ambigu → null', () => {
    expect(resolveCyranoSide('7ca21969', match)).toBe('A');
    expect(resolveCyranoSide(B, match)).toBe('B');
    expect(resolveCyranoSide('deadbeef', match)).toBeNull();
    expect(resolveCyranoSide(undefined, match)).toBeNull();
    const twin = { fencerA: { id: A }, fencerB: { id: `${A.slice(0, 8)}-ffff` } } as any;
    expect(resolveCyranoSide('7ca21969', twin)).toBeNull();
  });

  it('mapCyranoSides : droite/gauche → A/B, inversion comprise', () => {
    const msg = (r: string, l: string) =>
      ({ right: { id: r, score: 5 }, left: { id: l, score: 2 } }) as any;
    expect(mapCyranoSides(msg('7ca21969', '08f01fd6'), match)).toMatchObject({
      A: { score: 5 },
      B: { score: 2 },
      aOnRight: true,
    });
    expect(mapCyranoSides(msg('08f01fd6', '7ca21969'), match)).toMatchObject({
      A: { score: 2 },
      B: { score: 5 },
      aOnRight: false,
    });
    expect(mapCyranoSides(msg('7ca21969', '7ca21969'), match)).toBeNull();
    expect(mapCyranoSides(msg('7ca21969', 'ffffffff'), match)).toBeNull();
  });

  it('cyranoCards : jaune puis rouges', () => {
    expect(cyranoCards({})).toEqual([]);
    expect(cyranoCards({ yellowCards: 1, redCards: 2 })).toEqual(['yellow', 'red', 'red']);
  });

  it('parseCyranoStopwatch : m:ss et m:ss.cc', () => {
    expect(parseCyranoStopwatch('3:00')).toBe(180);
    expect(parseCyranoStopwatch('2:57')).toBe(177);
    expect(parseCyranoStopwatch('0:09.53')).toBeCloseTo(9.53);
    expect(parseCyranoStopwatch('0:09.5')).toBeCloseTo(9.5);
    expect(parseCyranoStopwatch('')).toBeNull();
    expect(parseCyranoStopwatch(undefined)).toBeNull();
    expect(parseCyranoStopwatch('1:75')).toBeNull();
  });

  it('isActiveCyranoState : F, H, P', () => {
    expect(['F', 'H', 'P', 'E', 'W', undefined].map(s => isActiveCyranoState(s as any))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('cartons P EFP1.1 (#1829)', () => {
  it('champ 12 → cartons P des arènes', () => {
    expect(cyranoPCards({ pCard: 0 })).toEqual([]);
    expect(cyranoPCards({ pCard: 1 })).toEqual([]);
    expect(cyranoPCards({ pCard: 2 })).toEqual(['p-red']);
    expect(cyranoPCards({ pCard: 3 })).toEqual(['p-red', 'p-red']);
    expect(cyranoPCards({ pCard: 4 })).toEqual(['p-black']);
    expect(cyranoPCards({ pCard: 5 })).toEqual(['p-black', 'p-black']);
    expect(cyranoPCards({})).toEqual([]);
  });

  it('cartons P des arènes → champ 12 du DISP (0, 2 ou 4, noir prime)', () => {
    expect(pCardValue(undefined)).toBe(0);
    expect(pCardValue([])).toBe(0);
    expect(pCardValue(['yellow', 'red'])).toBe(0);
    expect(pCardValue(['p-red'])).toBe(2);
    expect(pCardValue(['p-red', 'p-black'])).toBe(4);
  });
});
