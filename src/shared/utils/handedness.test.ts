import { describe, it, expect } from 'vitest';
import { needsLeftHandedSwap } from './handedness';

const L = { handedness: 'L' as const };
const R = { handedness: 'R' as const };

describe('needsLeftHandedSwap (#1439)', () => {
  it('gaucher A contre droitier B : inversion', () => {
    for (const w of ['E', 'F', 'S']) expect(needsLeftHandedSwap(w, L, R)).toBe(true);
    expect(needsLeftHandedSwap('E', L, {})).toBe(true);
  });
  it('gaucher B contre droitier A : déjà à gauche', () => {
    expect(needsLeftHandedSwap('E', R, L)).toBe(false);
  });
  it('deux gauchers ou deux droitiers : placement de l’appel', () => {
    expect(needsLeftHandedSwap('F', L, L)).toBe(false);
    expect(needsLeftHandedSwap('F', R, R)).toBe(false);
  });
  it('armes non olympiques : jamais', () => {
    expect(needsLeftHandedSwap('L', L, R)).toBe(false);
    expect(needsLeftHandedSwap('C', L, R)).toBe(false);
    expect(needsLeftHandedSwap(null, L, R)).toBe(false);
  });
});
