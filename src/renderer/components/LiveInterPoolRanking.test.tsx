// @vitest-environment jsdom
/**
 * Tests de composant - LiveInterPoolRanking (#1288)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }));

const calculateOverallRanking = vi.fn(() => []);
vi.mock('../../shared/utils/poolCalculations', async importOriginal => ({
  ...(await importOriginal<object>()),
  calculateOverallRanking: (...a: unknown[]) => (calculateOverallRanking as any)(...a),
}));
import { LiveInterPoolRanking } from './LiveInterPoolRanking';
import { Weapon } from '../../shared/types';

afterEach(() => {
  vi.restoreAllMocks();
  calculateOverallRanking.mockClear();
});

describe('LiveInterPoolRanking', () => {
  it('ne lance aucun timer et ne recalcule que lorsque les poules changent', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const poolsA: any[] = [{ number: 1, fencers: [], matches: [] }];
    const { rerender } = render(
      <LiveInterPoolRanking
        pools={poolsA}
        weapon={Weapon.EPEE}
        isLaserSabre={false}
        onClose={() => {}}
      />
    );
    expect(spy).not.toHaveBeenCalled();
    expect(calculateOverallRanking).toHaveBeenCalledTimes(1);
    rerender(
      <LiveInterPoolRanking
        pools={poolsA}
        weapon={Weapon.EPEE}
        isLaserSabre={false}
        onClose={() => {}}
      />
    );
    expect(calculateOverallRanking).toHaveBeenCalledTimes(1);
    rerender(
      <LiveInterPoolRanking
        pools={[...poolsA]}
        weapon={Weapon.EPEE}
        isLaserSabre={false}
        onClose={() => {}}
      />
    );
    expect(calculateOverallRanking).toHaveBeenCalledTimes(2);
  });
});
