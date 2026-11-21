// @vitest-environment jsdom
/**
 * Lancement des poules par le moteur (docs/adr/0017) : composition préparée envoyée telle quelle.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  poolComposition,
  tableauAssignmentsDiff,
  tableauScoreOps,
  usePoolsLaunch,
  useRapieresWaves,
  useScoreClear,
} from './usePoolsLaunch';
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

describe('useRapieresWaves', () => {
  const waves = () =>
    renderHook(() => useRapieresWaves('c1', flush), {
      wrapper: ({ children }) => (
        <BpmClientProvider client={{ call } as unknown as BpmClient}>{children}</BpmClientProvider>
      ),
    }).result;

  it('vague lancée et vagues arrêtées par le moteur', async () => {
    expect(await waves().current.launchWave(2)).toBe('recorded');
    expect(call).toHaveBeenCalledWith('launchRapieresWave', { competitionId: 'c1', wave: 2 });
    expect(await waves().current.endWaves(true)).toBe('recorded');
    expect(call).toHaveBeenCalledWith('endRapieresWaves', { competitionId: 'c1', ended: true });
  });

  it('hors moteur : local', async () => {
    call.mockRejectedValueOnce(new ApiError('unavailable', 'x'));
    expect(await waves().current.launchWave(1)).toBe('local');
  });
});

describe('useScoreClear', () => {
  const clear = () =>
    renderHook(() => useScoreClear('c1', flush), {
      wrapper: ({ children }) => (
        <BpmClientProvider client={{ call } as unknown as BpmClient}>{children}</BpmClientProvider>
      ),
    }).result;

  it('annulation par le moteur ; tour suivant joué : message traduit', async () => {
    expect(await clear().current('m1')).toBe('recorded');
    expect(call).toHaveBeenCalledWith('clearScore', { competitionId: 'c1', matchId: 'm1' });
    call.mockRejectedValueOnce(new ApiError('next_match_played', 'x'));
    expect(await clear().current('m1')).toBe('refused');
    expect(showToast).toHaveBeenCalledWith('tableauView.next_played', 'error');
  });
});

describe('tableauAssignmentsDiff', () => {
  const m = (over: Record<string, unknown> = {}) =>
    ({
      id: '8-0',
      round: 8,
      position: 0,
      fencerA: { id: 'a' },
      fencerB: { id: 'b' },
      scoreA: null,
      scoreB: null,
      winner: null,
      isBye: false,
      ...over,
    }) as never;

  it('piste ou arbitre changés seuls : affectations', () => {
    expect(tableauAssignmentsDiff([m()], [m({ arena: 4 })])).toEqual([
      { matchId: '8-0', strip: 4 },
    ]);
    expect(tableauAssignmentsDiff([m()], [m({ referee: { id: 'r1' } })])).toEqual([
      { matchId: '8-0', refereeId: 'r1' },
    ]);
    expect(tableauAssignmentsDiff([m()], [m()])).toEqual([]);
  });

  it('autre changement (score, tireur) : null, écriture de l’écran', () => {
    expect(tableauAssignmentsDiff([m()], [m({ scoreA: 15, arena: 2 })])).toBeNull();
    expect(tableauAssignmentsDiff([m()], [])).toBeNull();
  });
});

describe('tableauScoreOps (retour arrière, remplissage automatique)', () => {
  const A = { id: 'a' };
  const B = { id: 'b' };
  const C = { id: 'c' };
  const D = { id: 'd' };
  const t = (round: number, position: number, over: Record<string, unknown> = {}) =>
    ({
      id: `${round}-${position}`,
      round,
      position,
      fencerA: null,
      fencerB: null,
      scoreA: null,
      scoreB: null,
      winner: null,
      isBye: false,
      ...over,
    }) as never;
  const empty = [t(4, 0, { fencerA: A, fencerB: B }), t(4, 1, { fencerA: C, fencerB: D }), t(2, 0)];
  const played = [
    t(4, 0, { fencerA: A, fencerB: B, scoreA: 15, scoreB: 3, winner: A }),
    t(4, 1, { fencerA: C, fencerB: D, scoreA: 7, scoreB: 7, winner: D }),
    t(2, 0, { fencerA: A, fencerB: D, scoreA: 15, scoreB: 9, winner: A }),
  ];

  it('remplissage : scores du premier tour vers la finale, vainqueur précisé sur égalité', () => {
    expect(tableauScoreOps(empty, played)).toEqual({
      clears: [],
      records: [
        { matchId: '4-0', scoreA: 15, scoreB: 3 },
        { matchId: '4-1', scoreA: 7, scoreB: 7, winner: 'B' },
        { matchId: '2-0', scoreA: 15, scoreB: 9 },
      ],
      assignments: [],
    });
  });

  it('retour arrière : annulations de la finale vers le premier tour', () => {
    expect(tableauScoreOps(played, empty)?.clears).toEqual(['2-0', '4-0', '4-1']);
  });

  it('statut spécial ou matchs différents : null', () => {
    expect(tableauScoreOps(empty, [...empty.slice(0, 2)])).toBeNull();
    const special = [
      t(4, 0, {
        fencerA: A,
        fencerB: B,
        winner: A,
        specialStatus: { fencerId: 'b', status: 'forfait' },
      }),
      empty[1],
      empty[2],
    ];
    expect(tableauScoreOps(empty, special)).toBeNull();
  });
});
