// @vitest-environment jsdom
/**
 * Tests unitaires - useOffline
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { sync, storage } = vi.hoisted(() => ({
  sync: {
    isCurrentlyOnline: vi.fn(() => true),
    isCurrentlySyncing: vi.fn(() => false),
    onSyncComplete: vi.fn(),
    triggerSync: vi.fn(async () => {}),
    refreshCache: vi.fn(async () => {}),
  },
  storage: {
    getSyncStatus: vi.fn(async () => ({ pendingActions: 2, conflicts: 1, lastSync: 123 })),
    getCachedCompetition: vi.fn(async () => ({ id: 'c1' })),
    getCachedFencers: vi.fn(async () => [{ id: 'f1' }]),
    getCachedPools: vi.fn(async () => []),
    getCachedMatches: vi.fn(async () => []),
  },
}));

vi.mock('../services/offlineSync', () => ({ offlineSync: sync }));
vi.mock('../services/offlineStorage', () => ({ offlineStorage: storage }));

import { useOffline } from './useOffline';

beforeEach(() => {
  vi.clearAllMocks();
  sync.isCurrentlyOnline.mockReturnValue(true);
  storage.getSyncStatus.mockResolvedValue({ pendingActions: 2, conflicts: 1, lastSync: 123 });
});

describe('useOffline', () => {
  it('charge le statut de synchro au montage', async () => {
    const { result } = renderHook(() => useOffline('c1'));
    await waitFor(() => expect(result.current.pendingActions).toBe(2));
    expect(result.current.conflicts).toBe(1);
    expect(result.current.lastSync).toBe(123);
    expect(result.current.isOnline).toBe(true);
  });

  it('charge les données en cache', async () => {
    const { result } = renderHook(() => useOffline('c1'));
    await waitFor(() => expect(result.current.cacheData.competitions).toHaveLength(1));
    expect(result.current.cacheData.fencers).toHaveLength(1);
  });

  it('sync déclenche triggerSync quand en ligne', async () => {
    const { result } = renderHook(() => useOffline('c1'));
    await act(async () => {
      await result.current.sync();
    });
    expect(sync.triggerSync).toHaveBeenCalledTimes(1);
  });

  it('sync est ignoré hors ligne', async () => {
    sync.isCurrentlyOnline.mockReturnValue(false);
    const { result } = renderHook(() => useOffline('c1'));
    await waitFor(() => expect(result.current.isOnline).toBe(false));
    await act(async () => {
      await result.current.sync();
    });
    expect(sync.triggerSync).not.toHaveBeenCalled();
  });

  it('refreshCache appelle le service en ligne', async () => {
    const { result } = renderHook(() => useOffline('c1'));
    await act(async () => {
      await result.current.refreshCache('c1');
    });
    expect(sync.refreshCache).toHaveBeenCalledWith('c1');
  });

  it('réagit à l’évènement offline', async () => {
    const { result } = renderHook(() => useOffline('c1'));
    await waitFor(() => expect(result.current.isOnline).toBe(true));
    sync.isCurrentlyOnline.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(result.current.isOnline).toBe(false));
  });
});
