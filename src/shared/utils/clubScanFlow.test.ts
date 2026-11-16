import { describe, it, expect } from 'vitest';
import { EMPTY_SCAN, applyScan, isRepeatScan } from './clubScanFlow';

describe('scan webcam : piste puis 2 cartes (#1872)', () => {
  it('piste puis tireurs → complet', () => {
    let r = applyScan(EMPTY_SCAN, { kind: 'arena', number: 2 }, 4);
    expect(r).toMatchObject({ complete: false, state: { strip: 2, memberIds: [] } });
    r = applyScan(r.state, { kind: 'member', id: 'a' }, 4);
    expect(r.complete).toBe(false);
    r = applyScan(r.state, { kind: 'member', id: 'b' }, 4);
    expect(r).toEqual({ complete: true, state: { strip: 2, memberIds: ['a', 'b'] } });
  });

  it('ordre libre : tireurs puis piste', () => {
    let r = applyScan(EMPTY_SCAN, { kind: 'member', id: 'a' }, 2);
    r = applyScan(r.state, { kind: 'member', id: 'b' }, 2);
    expect(r.complete).toBe(false);
    r = applyScan(r.state, { kind: 'arena', number: 1 }, 2);
    expect(r.complete).toBe(true);
  });

  it('erreurs : piste hors séance, même tireur deux fois', () => {
    expect(applyScan(EMPTY_SCAN, { kind: 'arena', number: 5 }, 4).error).toBe('strip_unknown');
    const s = { strip: 1, memberIds: ['a'] };
    expect(applyScan(s, { kind: 'member', id: 'a' }, 4)).toEqual({
      state: s,
      complete: false,
      error: 'same_member',
    });
  });

  it('troisième carte : remplace le second tireur ; nouvelle piste : change la piste', () => {
    const s = { strip: null, memberIds: ['a', 'b'] };
    expect(applyScan(s, { kind: 'member', id: 'c' }, 4).state.memberIds).toEqual(['a', 'c']);
    expect(
      applyScan({ strip: 1, memberIds: [] }, { kind: 'arena', number: 3 }, 4).state.strip
    ).toBe(3);
  });

  it('anti-répétition du même QR', () => {
    expect(isRepeatScan(null, 'x', 1000)).toBe(false);
    expect(isRepeatScan({ text: 'x', at: 1000 }, 'x', 2000)).toBe(true);
    expect(isRepeatScan({ text: 'x', at: 1000 }, 'x', 4000)).toBe(false);
    expect(isRepeatScan({ text: 'x', at: 1000 }, 'y', 1100)).toBe(false);
  });
});
