// @vitest-environment jsdom
/**
 * Tests unitaires - usePoolStore
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePoolStore } from './usePoolStore';

const get = () => usePoolStore.getState();

beforeEach(() => {
  usePoolStore.setState({
    pools: [],
    currentPool: null,
    overallRanking: [],
    isLoading: false,
    error: null,
  });
});
afterEach(() => {
  delete (window as any).electronAPI;
});

describe('loadPools', () => {
  it('charge les poules via le service', async () => {
    (window as any).electronAPI = {
      db: {
        getPhasesByCompetition: vi.fn(async () => [{ id: 'ph1' }]),
        getPoolsByPhase: vi.fn(async () => [{ id: 'po1' }]),
      },
    };
    await get().loadPools('c1');
    expect(get().pools.map((p: any) => p.id)).toEqual(['po1']);
    expect(get().isLoading).toBe(false);
  });

  it('retourne une liste vide sans API (pas d’erreur)', async () => {
    await get().loadPools('c1');
    expect(get().pools).toEqual([]);
    expect(get().error).toBeNull();
  });
});

describe('computeRanking', () => {
  it('stocke le classement calculé', async () => {
    (window as any).electronAPI = {
      db: {
        getPhasesByCompetition: vi.fn(async () => []),
        getPoolsByPhase: vi.fn(async () => []),
      },
    };
    await get().computeRanking('c1');
    expect(Array.isArray(get().overallRanking)).toBe(true);
  });
});

describe('setCurrentPool / clearError', () => {
  it('définit la poule courante', () => {
    get().setCurrentPool({ id: 'po1' } as any);
    expect(get().currentPool?.id).toBe('po1');
  });

  it('efface l’erreur', () => {
    usePoolStore.setState({ error: 'boom' });
    get().clearError();
    expect(get().error).toBeNull();
  });
});
