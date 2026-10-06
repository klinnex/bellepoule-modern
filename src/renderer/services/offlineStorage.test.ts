// @vitest-environment jsdom
/**
 * Tests unitaires - OfflineStorageManager (IndexedDB via fake-indexeddb)
 * BellePoule Modern
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OfflineStorageManager } from './offlineStorage';
import type { Competition } from '../../shared/types';

let store: OfflineStorageManager;

beforeEach(async () => {
  // base fraîche pour chaque test
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('BellePouleOffline');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  store = new OfflineStorageManager();
});

afterEach(() => {
  // ferme la connexion pour ne pas bloquer le deleteDatabase suivant
  (store as any).db?.close?.();
});

describe('cache compétition', () => {
  it('met en cache et relit une compétition', async () => {
    const comp = { id: 'c1', title: 'Open' } as unknown as Competition;
    await store.cacheCompetition(comp);
    const got = await store.getCachedCompetition('c1');
    expect(got?.id).toBe('c1');
  });

  it('retourne null/undefined pour une compétition absente', async () => {
    const got = await store.getCachedCompetition('inconnu');
    expect(got ?? null).toBeNull();
  });
});

describe('pending actions', () => {
  it('ajoute, liste (triées par timestamp) et supprime', async () => {
    const id1 = await store.addPendingAction({
      type: 'UPDATE_MATCH',
      data: { matchId: 'm1' },
    } as any);
    await store.addPendingAction({ type: 'UPDATE_FENCER', data: { fencerId: 'f1' } } as any);

    let actions = await store.getPendingActions();
    expect(actions).toHaveLength(2);
    expect(actions[0].timestamp).toBeLessThanOrEqual(actions[1].timestamp);

    await store.removePendingAction(id1);
    actions = await store.getPendingActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('UPDATE_FENCER');
  });

  it('incrémente le compteur de tentatives', async () => {
    const id = await store.addPendingAction({ type: 'UPDATE_MATCH', data: {} } as any);
    await store.incrementRetryCount(id);
    await store.incrementRetryCount(id);
    const actions = await store.getPendingActions();
    expect(actions[0].retryCount).toBe(2);
  });
});

describe('conflits', () => {
  it('ajoute, liste (non résolus) et résout', async () => {
    const id = await store.addConflict({
      entityType: 'match',
      entityId: 'm1',
      localVersion: {},
      remoteVersion: {},
    } as any);
    expect(await store.getConflicts()).toHaveLength(1);
    await store.resolveConflict(id, 'local');
    expect(await store.getConflicts()).toHaveLength(0); // les résolus sont filtrés
  });
});

describe('getSyncStatus', () => {
  it('agrège les compteurs en attente et conflits', async () => {
    await store.addPendingAction({ type: 'UPDATE_MATCH', data: {} } as any);
    await store.addConflict({
      entityType: 'match',
      entityId: 'm',
      localVersion: {},
      remoteVersion: {},
    } as any);
    const status = await store.getSyncStatus();
    expect(status.pendingActions).toBe(1);
    expect(status.conflicts).toBe(1);
  });
});
