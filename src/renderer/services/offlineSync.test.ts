// @vitest-environment jsdom
/**
 * Tests unitaires - OfflineSyncManager
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storage } = vi.hoisted(() => ({
  storage: {
    getPendingActions: vi.fn(async () => [] as any[]),
    removePendingAction: vi.fn(async () => {}),
    incrementRetryCount: vi.fn(async () => {}),
    updateLastSync: vi.fn(async () => {}),
    getConflicts: vi.fn(async () => [] as any[]),
    addConflict: vi.fn(async () => {}),
    resolveConflict: vi.fn(async () => {}),
    cacheMatches: vi.fn(async () => {}),
    cacheFencers: vi.fn(async () => {}),
    cachePools: vi.fn(async () => {}),
    getSyncStatus: vi.fn(async () => ({ pendingActions: 0, conflicts: 0, lastSync: null })),
  },
}));
vi.mock('./offlineStorage', () => ({ offlineStorage: storage }));

import { OfflineSyncManager } from './offlineSync';

const mgr = () => new OfflineSyncManager();

const jsonResponse = (status: number, body: any): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    statusText: 'x',
  }) as Response;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('triggerSync - gardes', () => {
  it('échoue si hors ligne', async () => {
    const m = mgr();
    (m as any).isOnline = false;
    const res = await m.triggerSync();
    expect(res.success).toBe(false);
    expect(res.errors).toContain('Device is offline');
  });

  it('échoue si une synchro est déjà en cours', async () => {
    const m = mgr();
    (m as any).isOnline = true;
    (m as any).syncInProgress = true;
    const res = await m.triggerSync();
    expect(res.success).toBe(false);
    expect(res.errors).toContain('Sync already in progress');
  });
});

describe('triggerSync - succès', () => {
  it('synchronise une file vide et notifie les callbacks', async () => {
    const m = mgr();
    (m as any).isOnline = true;
    const cb = vi.fn();
    m.onSyncComplete(cb);
    const res = await m.triggerSync();
    expect(res.success).toBe(true);
    expect(res.synced).toBe(0);
    expect(storage.updateLastSync).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(m.isCurrentlySyncing()).toBe(false);
  });
});

describe('helpers / état', () => {
  it('isCurrentlyOnline reflète le drapeau interne', () => {
    const m = mgr();
    (m as any).isOnline = false;
    expect(m.isCurrentlyOnline()).toBe(false);
    (m as any).isOnline = true;
    expect(m.isCurrentlyOnline()).toBe(true);
  });

  it('getEntityTypeFromAction déduit le type', () => {
    const m = mgr() as any;
    expect(m.getEntityTypeFromAction('UPDATE_MATCH')).toBe('match');
    expect(m.getEntityTypeFromAction('ADD_FENCER')).toBe('fencer');
    expect(m.getEntityTypeFromAction('CREATE_POOL')).toBe('pool');
    expect(m.getEntityTypeFromAction('INCONNU')).toBe('match'); // fallback
  });

  it('getEntityIdFromAction extrait l’identifiant', () => {
    const m = mgr() as any;
    expect(m.getEntityIdFromAction({ matchId: 'x' })).toBe('x');
    expect(m.getEntityIdFromAction({ fencerId: 'f' })).toBe('f');
    expect(m.getEntityIdFromAction({})).toBe('');
  });
});

describe('conflits - deux tablettes hors ligne modifient le même match', () => {
  it('un 409 serveur transforme l’action en conflit stocké, sans bloquer les autres actions', async () => {
    storage.getPendingActions.mockResolvedValue([
      {
        id: 'a1',
        type: 'UPDATE_MATCH',
        data: { matchId: 'm1', updates: { scoreA: 15, scoreB: 3 } },
        retryCount: 0,
      },
      {
        id: 'a2',
        type: 'UPDATE_MATCH',
        data: { matchId: 'm2', updates: { scoreA: 10, scoreB: 8 } },
        retryCount: 0,
      },
    ] as any);

    const serverVersion = { matchId: 'm1', updates: { scoreA: 15, scoreB: 10 } };
    (fetch as any)
      .mockResolvedValueOnce(jsonResponse(409, serverVersion)) // a1: l'autre tablette a déjà écrit
      .mockResolvedValueOnce(jsonResponse(200, {})); // a2: sync normale

    const m = mgr();
    (m as any).isOnline = true;
    const res = await m.triggerSync();

    expect(res.conflicts).toBe(1);
    expect(res.synced).toBe(1);
    expect(storage.addConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'match',
        entityId: 'm1',
        remoteVersion: serverVersion,
      })
    );
    // l'action en conflit n'est pas retirée de la file (retry/résolution manuelle)
    expect(storage.removePendingAction).toHaveBeenCalledWith('a2');
    expect(storage.removePendingAction).not.toHaveBeenCalledWith('a1');
  });

  it('resolveConflict("local") écrase le serveur avec la version locale', async () => {
    storage.getConflicts.mockResolvedValue([
      {
        id: 'c1',
        entityType: 'match',
        entityId: 'm1',
        localVersion: { matchId: 'm1', updates: { scoreA: 15, scoreB: 3 } },
        remoteVersion: { matchId: 'm1', updates: { scoreA: 15, scoreB: 10 } },
        timestamp: Date.now(),
      },
    ] as any);
    (fetch as any).mockResolvedValueOnce(jsonResponse(200, {}));

    const m = mgr();
    await m.resolveConflict('c1', 'local');

    expect(fetch).toHaveBeenCalledWith(
      '/api/matches/m1/force-update',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(storage.resolveConflict).toHaveBeenCalledWith('c1', 'local');
  });

  it('resolveConflict("remote") accepte la version serveur et met en cache', async () => {
    const remoteVersion = { matchId: 'm1', updates: { scoreA: 15, scoreB: 10 } };
    storage.getConflicts.mockResolvedValue([
      {
        id: 'c1',
        entityType: 'match',
        entityId: 'm1',
        localVersion: { matchId: 'm1', updates: { scoreA: 15, scoreB: 3 } },
        remoteVersion,
        timestamp: Date.now(),
      },
    ] as any);

    const m = mgr();
    await m.resolveConflict('c1', 'remote');

    expect(storage.cacheMatches).toHaveBeenCalledWith([remoteVersion]);
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.resolveConflict).toHaveBeenCalledWith('c1', 'remote');
  });

  it('resolveConflict échoue si le conflit est introuvable', async () => {
    storage.getConflicts.mockResolvedValue([]);
    const m = mgr();
    await expect(m.resolveConflict('inconnu', 'remote')).rejects.toThrow('Conflict not found');
  });
});
