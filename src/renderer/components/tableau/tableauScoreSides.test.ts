import { describe, it, expect } from 'vitest';
import { tableauLeftSide } from './tableauScoreSides';

const f = (handedness?: 'L' | 'R') => ({ id: 'x', firstName: 'a', lastName: 'b', handedness });

describe('tableauLeftSide (#1826)', () => {
  it('droitiers : le second appelé à gauche', () => {
    expect(tableauLeftSide({ fencerA: f('R') as never, fencerB: f() as never })).toBe('B');
  });
  it('deux gauchers : le second appelé à gauche', () => {
    expect(tableauLeftSide({ fencerA: f('L') as never, fencerB: f('L') as never })).toBe('B');
  });
  it('gaucher contre droitier : le gaucher à gauche', () => {
    expect(tableauLeftSide({ fencerA: f('L') as never, fencerB: f('R') as never })).toBe('A');
    expect(tableauLeftSide({ fencerA: f() as never, fencerB: f('L') as never })).toBe('B');
  });
  it('tireur absent : second appelé à gauche', () => {
    expect(tableauLeftSide({ fencerA: null, fencerB: null })).toBe('B');
  });
});
