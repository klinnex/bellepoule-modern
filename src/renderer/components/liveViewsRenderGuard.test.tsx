// @vitest-environment jsdom
/**
 * Garde-fou de rendus des vues live (#1302) : sans changement de données,
 * aucun rendu superflu sur 10 s (jeu de 200 tireurs généré à la main).
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { Profiler } from 'react';
import { render, act } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }));

import { LiveDashboard } from './LiveDashboard';
import { LiveInterPoolRanking } from './LiveInterPoolRanking';
import PoolPrepView from './PoolPrepView';
import { Weapon, MatchStatus } from '../../shared/types';

const NB_FENCERS = 200;
const POOL_SIZE = 5;

function makeFencers(): any[] {
  return Array.from({ length: NB_FENCERS }, (_, i) => ({
    id: `f${i}`,
    firstName: `Prenom${i}`,
    lastName: `Nom${i}`,
    club: `Club${i % 20}`,
    ranking: i + 1,
    status: 'CHECKED_IN',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

function makePools(fencers: any[]): any[] {
  const pools: any[] = [];
  for (let p = 0; p < NB_FENCERS / POOL_SIZE; p++) {
    const pf = fencers.slice(p * POOL_SIZE, (p + 1) * POOL_SIZE);
    const matches: any[] = [];
    for (let a = 0; a < pf.length; a++)
      for (let b = a + 1; b < pf.length; b++)
        matches.push({
          id: `m${p}-${a}-${b}`,
          fencerA: pf[a],
          fencerB: pf[b],
          scoreA: { value: 5 },
          scoreB: { value: 3 },
          status: MatchStatus.FINISHED,
        });
    pools.push({ id: `p${p}`, number: p + 1, fencers: pf, matches, ranking: [] });
  }
  return pools;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function countCommits(ui: React.ReactElement) {
  let commits = 0;
  const utils = render(
    <Profiler id="guard" onRender={() => commits++}>
      {ui}
    </Profiler>
  );
  commits = 0; // on ignore le montage initial
  return { commits: () => commits, ...utils };
}

describe('garde-fou de rendus — vues live (#1302)', () => {
  it('LiveInterPoolRanking : 0 rendu en 10 s', () => {
    vi.useFakeTimers();
    const pools = makePools(makeFencers());
    const r = countCommits(
      <LiveInterPoolRanking
        pools={pools}
        weapon={Weapon.EPEE}
        isLaserSabre={false}
        onClose={() => {}}
      />
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(r.commits()).toBe(0);
  });

  it('PoolPrepView : 0 rendu en 10 s', () => {
    vi.useFakeTimers();
    const r = countCommits(
      <PoolPrepView fencers={makeFencers()} maxScore={5} onPoolsConfirm={() => {}} />
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(r.commits()).toBe(0);
  });

  it("LiveDashboard : seule l'horloge (1 Hz) rend, soit au plus 10 rendus en 10 s", () => {
    vi.useFakeTimers();
    const pools = makePools(makeFencers());
    const r = countCommits(
      <LiveDashboard
        competition={{ id: 'c1', name: 'C', weapon: Weapon.EPEE } as any}
        pools={pools}
        currentPhase="pools"
        weapon={Weapon.EPEE}
      />
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(r.commits()).toBeLessThanOrEqual(10);
  });
});
