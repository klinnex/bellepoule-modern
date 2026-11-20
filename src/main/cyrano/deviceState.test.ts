import { describe, it, expect } from 'vitest';
import {
  cyranoFencerId,
  cyranoPCardCounts,
  cyranoPCardField,
  parseCyranoStopwatch,
} from './deviceState';
import { buildCyrano, parseCyrano } from './codec';

const A = '7ca21969-e092-4bdc-a987-eac9844968b7';
const B = '08f01fd6-ae32-4aac-930b-f23c2dc97543';

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

  it('parseCyranoStopwatch : m:ss et m:ss.cc', () => {
    expect(parseCyranoStopwatch('3:00')).toBe(180);
    expect(parseCyranoStopwatch('2:57')).toBe(177);
    expect(parseCyranoStopwatch('0:09.53')).toBeCloseTo(9.53);
    expect(parseCyranoStopwatch('0:09.5')).toBeCloseTo(9.5);
    expect(parseCyranoStopwatch('')).toBeNull();
    expect(parseCyranoStopwatch(undefined)).toBeNull();
    expect(parseCyranoStopwatch('1:75')).toBeNull();
  });
});

describe('cartons P EFP1.1 (#1829)', () => {
  it('champ 12 → compteurs jaune / rouge / noir P', () => {
    expect([0, 1, 2, 3, 4, 5, undefined].map(cyranoPCardCounts)).toEqual([
      {},
      { pYellow: 1 },
      { pRed: 1 },
      { pRed: 2 },
      { pBlack: 1 },
      { pBlack: 2 },
      {},
    ]);
  });

  it('compteurs → champ 12 du DISP (0, 2 ou 4, noir prime)', () => {
    expect(cyranoPCardField({})).toBe(0);
    expect(cyranoPCardField({ pYellow: 1 })).toBe(0);
    expect(cyranoPCardField({ pRed: 2 })).toBe(2);
    expect(cyranoPCardField({ pRed: 1, pBlack: 1 })).toBe(4);
  });
});
