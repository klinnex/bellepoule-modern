// @vitest-environment jsdom
/**
 * Tests unitaires - useCompetitionSession
 * BellePoule Modern
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCompetitionSession } from './useCompetitionSession';

const baseProps = () => ({
  competitionId: 'c1',
  currentPhase: 'pools' as const,
  currentPoolRound: 1,
  pools: [],
  poolHistory: [],
  overallRanking: [],
  tableauMatches: [],
  finalResults: [],
  consolationBrackets: [],
  skipPoolPhase: false,
  remoteArenaCount: 2,
  poolPrepParams: { poolCount: 0, minFencersPerPool: 5, maxFencersPerPool: 7 },
});

afterEach(() => {
  delete (window as any).electronAPI;
});
beforeEach(() => {
  delete (window as any).electronAPI;
});

describe('restoreState', () => {
  it('marque isLoaded même sans electronAPI', async () => {
    const { result } = renderHook(() => useCompetitionSession(baseProps()));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.restoredState).toBeNull();
  });

  it('restaure l’état depuis la DB avec mapping de phase', async () => {
    const getSessionState = vi.fn(async () => ({
      currentPhase: 5, // tableau
      pools: [{ id: 'p' }],
      uiState: { currentPoolRound: 3 },
      skipPoolPhase: true,
    }));
    (window as any).electronAPI = { db: { getSessionState } };
    const { result } = renderHook(() => useCompetitionSession(baseProps()));
    await waitFor(() => expect(result.current.restoredState).not.toBeNull());
    expect(result.current.restoredState!.currentPhase).toBe(5);
    expect(result.current.restoredState!.currentPoolRound).toBe(3);
    expect(result.current.restoredState!.skipPoolPhase).toBe(true);
    expect(result.current.restoredState!.pools).toHaveLength(1);
  });
});

describe('saveState', () => {
  it('ne sauvegarde pas tant que non chargé / sans API', async () => {
    const { result } = renderHook(() => useCompetitionSession(baseProps()));
    await act(async () => {
      await result.current.saveState();
    });
    // aucune API → pas d'erreur, rien à vérifier sinon l'absence de crash
    expect(result.current.isLoaded).toBe(true);
  });

  it('sérialise l’état et mappe la phase en nombre', async () => {
    const saveSessionState = vi.fn(async (_cid: string, _state: any) => {});
    const getSessionState = vi.fn(async () => null);
    (window as any).electronAPI = { db: { saveSessionState, getSessionState } };
    const { result } = renderHook(() => useCompetitionSession(baseProps()));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      await result.current.saveState();
    });
    expect(saveSessionState).toHaveBeenCalled();
    const [cid, state] = saveSessionState.mock.calls[0];
    expect(cid).toBe('c1');
    expect(state.currentPhase).toBe(2); // 'pools' -> 2
    expect(state.uiState.currentPhase).toBe('pools');
  });
});

describe('projection du moteur (docs/adr/0017, étape 4a)', () => {
  const state = (pools: number) => ({
    currentPhase: 2,
    pools: Array.from({ length: pools }, (_, i) => ({ id: `p${i}` })),
    poolHistory: [],
    appelHistory: [],
    overallRanking: [],
    tableauMatches: [],
    finalResults: [],
    consolationBrackets: [],
    currentPoolRound: 1,
    skipPoolPhase: false,
  });

  function fakeClient(revision: { value: number }) {
    let listener:
      ((e: { type: string; competitionId?: string; revision?: number }) => void) | null = null;
    const query = vi.fn(async () => ({
      revision: revision.value,
      sessionRevision: revision.value,
      state: state(revision.value),
    }));
    const client = {
      call: vi.fn(),
      query,
      subscribe: vi.fn((_n: string, _i: unknown, cb: any) => {
        listener = cb;
        return () => (listener = null);
      }),
    };
    return {
      client,
      query,
      emit: (e: Parameters<NonNullable<typeof listener>>[0]) => listener?.(e),
    };
  }

  async function setup(revision: { value: number }) {
    const { BpmClientProvider } = await import('../api/BpmClientContext');
    const React = await import('react');
    const fake = fakeClient(revision);
    const view = renderHook(() => useCompetitionSession(baseProps()), {
      wrapper: ({ children }) =>
        React.createElement(BpmClientProvider, { client: fake.client as never, children }),
    });
    await waitFor(() => expect(view.result.current.restoredState).not.toBeNull());
    return { ...fake, result: view.result };
  }

  it('restaure par getCompetitionState', async () => {
    const { query, result } = await setup({ value: 1 });
    expect(query).toHaveBeenCalledWith('getCompetitionState', { competitionId: 'c1' });
    expect(result.current.restoredState!.pools).toHaveLength(1);
  });

  it('relit sur journal:appended plus récent, ignore une révision déjà lue', async () => {
    const revision = { value: 1 };
    const { query, emit, result } = await setup(revision);
    expect(query).toHaveBeenCalledTimes(1);
    act(() => emit({ type: 'journal:appended', competitionId: 'c1', revision: 1 }));
    expect(query).toHaveBeenCalledTimes(1);
    revision.value = 3;
    act(() => emit({ type: 'journal:appended', competitionId: 'c1', revision: 3 }));
    await waitFor(() => expect(result.current.restoredState!.pools).toHaveLength(3));
    expect(query).toHaveBeenCalledTimes(2);
    // Autre épreuve : ignoré
    act(() => emit({ type: 'journal:appended', competitionId: 'c2', revision: 9 }));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rafale de signaux : une relecture en cours, une seule de plus au besoin', async () => {
    const revision = { value: 1 };
    const { query, emit } = await setup(revision);
    revision.value = 4;
    act(() => {
      emit({ type: 'session:changed', competitionId: 'c1' });
      emit({ type: 'journal:appended', competitionId: 'c1', revision: 2 });
      emit({ type: 'journal:appended', competitionId: 'c1', revision: 3 });
      emit({ type: 'journal:appended', competitionId: 'c1', revision: 4 });
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 20));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('journal avancé sans réécriture du bloc (pointage) : saisie locale gardée', async () => {
    const revision = { value: 1 };
    const { query, emit, result } = await setup(revision);
    const sessionRevision = revision.value;
    query.mockImplementationOnce(async () => ({
      revision: 5,
      sessionRevision,
      state: state(9),
    }));
    act(() => emit({ type: 'journal:appended', competitionId: 'c1', revision: 5 }));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 20));
    expect(result.current.restoredState!.pools).toHaveLength(1);
  });
});
