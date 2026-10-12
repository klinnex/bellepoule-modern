// @vitest-environment jsdom
/**
 * Tests unitaires - useAnalyticsStore
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAnalyticsStore } from './useAnalyticsStore';

const get = () => useAnalyticsStore.getState();

beforeEach(() => {
  useAnalyticsStore.setState({
    fencerStats: [],
    competitionMetrics: null,
    isLoading: false,
    error: null,
  } as any);
});
afterEach(() => {
  delete (window as any).electronAPI;
});

describe('loadFencerStats', () => {
  it('charge les stats via le service', async () => {
    (window as any).electronAPI = {
      db: { getCompetitionFencerStats: vi.fn(async () => [{ fencerId: 'f1' }]) },
    };
    await get().loadFencerStats('c1');
    expect(get().fencerStats).toHaveLength(1);
    expect(get().isLoading).toBe(false);
  });

  it('retourne une liste vide sans API (pas d’erreur)', async () => {
    await get().loadFencerStats('c1');
    expect(get().fencerStats).toEqual([]);
    expect(get().error).toBeNull();
  });
});

describe('loadCompetitionMetrics', () => {
  it('charge les métriques agrégées', async () => {
    (window as any).electronAPI = {
      db: {
        getFencersByCompetition: vi.fn(async () => [{ id: 'a' }, { id: 'b' }]),
        getPhasesByCompetition: vi.fn(async () => [{ id: 'ph' }]),
        getPoolsByPhase: vi.fn(async () => [{ id: 'po' }]),
        getMatchesByPool: vi.fn(async () => [{ status: 'finished' }, { status: 'not_started' }]),
      },
    };
    await get().loadCompetitionMetrics('c1');
    expect(get().competitionMetrics).toEqual({ totalFencers: 2, completedMatches: 1 });
  });
});

describe('clearError', () => {
  it('efface l’erreur', () => {
    useAnalyticsStore.setState({ error: 'boom' } as any);
    get().clearError();
    expect(get().error).toBeNull();
  });
});
