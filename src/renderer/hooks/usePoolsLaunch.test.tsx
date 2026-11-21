// @vitest-environment jsdom
/**
 * Lancement des poules par le moteur (docs/adr/0017) : composition préparée envoyée telle quelle.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { poolComposition, usePoolsLaunch } from './usePoolsLaunch';
import { BpmClientProvider } from '../api/BpmClientContext';
import { ApiError, type BpmClient } from '../../shared/api/client';
import type { Pool } from '../../shared/types';

const showToast = vi.fn();
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('./useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const pools = [
  {
    id: 'p1',
    number: 1,
    strip: 2,
    fencers: [{ id: 'a' }, { id: 'b' }],
    matches: [{ id: 'm1', fencerA: { id: 'b' }, fencerB: { id: 'a' } }],
  },
] as unknown as Pool[];

let call: ReturnType<typeof vi.fn>;
const flush = vi.fn(async () => {});
const setup = () =>
  renderHook(() => usePoolsLaunch('c1', flush), {
    wrapper: ({ children }) => (
      <BpmClientProvider client={{ call } as unknown as BpmClient}>{children}</BpmClientProvider>
    ),
  }).result;

beforeEach(() => {
  call = vi.fn(async () => ({}));
  showToast.mockClear();
});

describe('usePoolsLaunch', () => {
  it('composition : identifiants, piste, ordre des matchs', () => {
    expect(poolComposition(pools)).toEqual([
      {
        poolId: 'p1',
        number: 1,
        strip: 2,
        fencerIds: ['a', 'b'],
        matches: [{ matchId: 'm1', fencerAId: 'b', fencerBId: 'a' }],
      },
    ]);
  });

  it('generatePools avec la composition, remplacement admis', async () => {
    expect(await setup().current(pools)).toBe('recorded');
    expect(call).toHaveBeenCalledWith('generatePools', {
      competitionId: 'c1',
      composition: poolComposition(pools),
      replace: true,
    });
    expect(flush).toHaveBeenCalled();
  });

  it('hors moteur : local ; refus : message', async () => {
    call.mockRejectedValueOnce(new ApiError('unavailable', 'x'));
    expect(await setup().current(pools)).toBe('local');
    call.mockRejectedValueOnce(new ApiError('invalid_composition', 'Composition refusée'));
    expect(await setup().current(pools)).toBe('refused');
    expect(showToast).toHaveBeenCalledWith('pools.launch_failed', 'error');
  });
});
