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
