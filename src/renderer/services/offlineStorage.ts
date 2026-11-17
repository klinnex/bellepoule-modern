/**
 * BellePoule Modern - Offline Storage Manager
 * IndexedDB wrapper for offline-first architecture
 * Licensed under GPL-3.0
 */

import { Competition, Fencer, Pool, Match } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';

/** Charge utile d'une action en attente (ids ciblés + corps de la requête). */
export interface PendingActionData {
  matchId?: string;
  fencerId?: string;
  poolId?: string;
  updates?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PendingAction {
  id: string;
  type: 'UPDATE_MATCH' | 'UPDATE_FENCER' | 'CREATE_POOL' | 'DELETE_POOL';
  timestamp: number;
  data: PendingActionData;
  retryCount?: number;
}

export interface SyncConflict {
  id: string;
  entityType: 'match' | 'fencer' | 'pool';
  entityId: string;
  localVersion: unknown;
  remoteVersion: unknown;
  timestamp: number;
  resolved?: boolean;
}

export class OfflineStorageManager {
  private dbName = 'BellePouleOffline';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        logger.error(
          LogCategory.DATABASE,
          '[OfflineStorage] Failed to open database',
          request.error as Error
        );
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.debug(LogCategory.DATABASE, '[OfflineStorage] Database initialized');
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store for cached competitions
        if (!db.objectStoreNames.contains('competitions')) {
          db.createObjectStore('competitions', { keyPath: 'id' });
        }

        // Store for cached fencers
        if (!db.objectStoreNames.contains('fencers')) {
          db.createObjectStore('fencers', { keyPath: 'id' });
        }

        // Store for cached pools
        if (!db.objectStoreNames.contains('pools')) {
          db.createObjectStore('pools', { keyPath: 'id' });
        }

        // Store for cached matches
        if (!db.objectStoreNames.contains('matches')) {
          db.createObjectStore('matches', { keyPath: 'id' });
        }

        // Store for pending actions to sync
        if (!db.objectStoreNames.contains('pendingActions')) {
          const store = db.createObjectStore('pendingActions', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Store for sync conflicts
        if (!db.objectStoreNames.contains('conflicts')) {
          const store = db.createObjectStore('conflicts', { keyPath: 'id' });
          store.createIndex('resolved', 'resolved', { unique: false });
        }
      };
    });
  }

  // Cache management methods
  async cacheCompetition(competition: Competition): Promise<void> {
    await this.ensureDB();
    return this.store('competitions', competition);
  }

  async cacheFencers(fencers: Fencer[]): Promise<void> {
    await this.ensureDB();
    const tx = this.db!.transaction(['fencers'], 'readwrite');
    await Promise.all(fencers.map(fencer => this.storeInTransaction(tx, 'fencers', fencer)));
  }

  async cachePools(pools: Pool[]): Promise<void> {
    await this.ensureDB();
    const tx = this.db!.transaction(['pools'], 'readwrite');
    await Promise.all(pools.map(pool => this.storeInTransaction(tx, 'pools', pool)));
  }

  async cacheMatches(matches: Match[]): Promise<void> {
    await this.ensureDB();
    const tx = this.db!.transaction(['matches'], 'readwrite');
    await Promise.all(matches.map(match => this.storeInTransaction(tx, 'matches', match)));
  }

  // Retrieve cached data
  async getCachedCompetition(id: string): Promise<Competition | null> {
    await this.ensureDB();
    return this.get<Competition>('competitions', id);
  }

  async getCachedFencers(competitionId?: string): Promise<Fencer[]> {
    await this.ensureDB();
    const fencers = await this.getAll<Fencer>('fencers');
    // For now, return all fencers - filtering would be done at competition level
    return fencers;
  }

  async getCachedPools(competitionId?: string): Promise<Pool[]> {
    await this.ensureDB();
    const pools = await this.getAll<Pool>('pools');
    // For now, return all pools - filtering would be done at competition level
    return pools;
  }

  async getCachedMatches(competitionId?: string): Promise<Match[]> {
    await this.ensureDB();
    const matches = await this.getAll<Match>('matches');
    // For now, return all matches - filtering would be done at competition level
    return matches;
  }

  // Pending actions management
  async addPendingAction(action: Omit<PendingAction, 'id' | 'timestamp'>): Promise<string> {
    await this.ensureDB();
    const pendingAction: PendingAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0,
    };

    await this.store('pendingActions', pendingAction);
    logger.debug(LogCategory.DATABASE, '[OfflineStorage] Added pending action', {
      id: pendingAction.id,
      type: pendingAction.type,
    });
    return pendingAction.id;
  }

  async getPendingActions(): Promise<PendingAction[]> {
    await this.ensureDB();
    const actions = await this.getAll<PendingAction>('pendingActions');
    return actions.sort((a: PendingAction, b: PendingAction) => a.timestamp - b.timestamp);
  }

  async removePendingAction(id: string): Promise<void> {
    await this.ensureDB();
    return this.delete('pendingActions', id);
  }

  async incrementRetryCount(id: string): Promise<void> {
    await this.ensureDB();
    const action = await this.get<PendingAction>('pendingActions', id);
    if (action) {
      action.retryCount = (action.retryCount || 0) + 1;
      await this.store('pendingActions', action);
    }
  }

  // Conflict management
  async addConflict(conflict: Omit<SyncConflict, 'id' | 'timestamp'>): Promise<string> {
    await this.ensureDB();
    const syncConflict: SyncConflict = {
      ...conflict,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    await this.store('conflicts', syncConflict);
    return syncConflict.id;
  }

  async getConflicts(): Promise<SyncConflict[]> {
    await this.ensureDB();
    const conflicts = await this.getAll<SyncConflict>('conflicts');
    return conflicts.filter((c: SyncConflict) => !c.resolved);
  }

  async resolveConflict(id: string, resolution: 'local' | 'remote'): Promise<void> {
    await this.ensureDB();
    const conflict = await this.get<SyncConflict>('conflicts', id);
    if (conflict) {
      conflict.resolved = true;
      await this.store('conflicts', conflict);
    }
  }

  // Sync status methods
  async getSyncStatus(): Promise<{
    pendingActions: number;
    conflicts: number;
    lastSync: number | null;
  }> {
    await this.ensureDB();
    const [pendingActions, conflicts] = await Promise.all([
      this.getPendingActions(),
      this.getConflicts(),
    ]);

    return {
      pendingActions: pendingActions.length,
      conflicts: conflicts.length,
      lastSync: await this.getLastSyncTimestamp(),
    };
  }

  // Cache cleanup
  async clearCache(olderThan: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.ensureDB();
    const cutoffTime = Date.now() - olderThan;

    const stores = ['competitions', 'fencers', 'pools', 'matches'];
    for (const storeName of stores) {
      const items = await this.getAll<{ id: string; updatedAt?: string | number | Date }>(
        storeName
      );
      const oldItems = items.filter(
        item => item.updatedAt && new Date(item.updatedAt).getTime() < cutoffTime
      );

      const tx = this.db!.transaction([storeName], 'readwrite');
      await Promise.all(oldItems.map(item => this.deleteInTransaction(tx, storeName, item.id)));
    }
  }

  async getStorageInfo(): Promise<{
    used: number;
    available: number;
    breakdown: Record<string, number>;
  }> {
    await this.ensureDB();

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const breakdown: Record<string, number> = {};

      const stores = ['competitions', 'fencers', 'pools', 'matches', 'pendingActions', 'conflicts'];
      for (const storeName of stores) {
        const items = await this.getAll(storeName);
        breakdown[storeName] = items.length;
      }

      return {
        used: estimate.usage || 0,
        available: estimate.quota ? estimate.quota - (estimate.usage || 0) : 0,
        breakdown,
      };
    }

    return { used: 0, available: 0, breakdown: {} };
  }

  // Private helper methods
  private async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  private async store(storeName: string, data: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async storeInTransaction(
    tx: IDBTransaction,
    storeName: string,
    data: unknown
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = tx.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async get<T>(storeName: string, id: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async getAll<T = unknown>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  private async delete(storeName: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteInTransaction(
    tx: IDBTransaction,
    storeName: string,
    id: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = tx.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getLastSyncTimestamp(): Promise<number | null> {
    // This would typically be stored in localStorage or another store
    const lastSync = localStorage.getItem('bellepoule-lastSync');
    return lastSync ? parseInt(lastSync, 10) : null;
  }

  async updateLastSync(): Promise<void> {
    localStorage.setItem('bellepoule-lastSync', Date.now().toString());
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorageManager();
