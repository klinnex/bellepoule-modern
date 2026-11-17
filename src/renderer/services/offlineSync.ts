/**
 * BellePoule Modern - Offline Sync Manager
 * Handles synchronization between local and remote data
 * Licensed under GPL-3.0
 */

import { offlineStorage, PendingAction, PendingActionData, SyncConflict } from './offlineStorage';
import type { Competition, Fencer, Match, Pool } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: number;
  errors: string[];
}

export class OfflineSyncManager {
  private isOnline: boolean = true;
  private syncInProgress: boolean = false;
  private syncCallbacks: ((status: SyncResult) => void)[] = [];
  private emptyPollStreak = 0;

  constructor() {
    this.initializeNetworkDetection();
    this.initializePeriodicSync();
  }

  // Network detection
  private initializeNetworkDetection(): void {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;

      window.addEventListener('online', () => {
        this.isOnline = true;
        logger.debug(LogCategory.NETWORK, '[Sync] Network connection restored');
        this.triggerSync();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        logger.debug(LogCategory.NETWORK, '[Sync] Network connection lost');
      });
    }
  }

  // Periodic sync when online
  private initializePeriodicSync(): void {
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.checkAndSync();
      }
    }, 30000); // Check every 30 seconds
  }

  // Public sync methods
  public async triggerSync(): Promise<SyncResult> {
    if (!this.isOnline) {
      return {
        success: false,
        synced: 0,
        failed: 0,
        conflicts: 0,
        errors: ['Device is offline'],
      };
    }

    if (this.syncInProgress) {
      return {
        success: false,
        synced: 0,
        failed: 0,
        conflicts: 0,
        errors: ['Sync already in progress'],
      };
    }

    this.syncInProgress = true;
    this.emptyPollStreak = 0;
    logger.debug(LogCategory.NETWORK, '[Sync] Starting synchronization...');

    try {
      const result = await this.performSync();
      this.notifySyncCallbacks(result);
      return result;
    } catch (error) {
      const result: SyncResult = {
        success: false,
        synced: 0,
        failed: 0,
        conflicts: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
      this.notifySyncCallbacks(result);
      return result;
    } finally {
      this.syncInProgress = false;
    }
  }

  // Check if sync is needed and perform it
  private async checkAndSync(): Promise<void> {
    // Skip IndexedDB read after 4 consecutive empty polls (resume after triggerSync resets streak)
    if (this.emptyPollStreak >= 4) {
      this.emptyPollStreak--;
      return;
    }
    const pendingActions = await offlineStorage.getPendingActions();
    if (pendingActions.length === 0) {
      this.emptyPollStreak = Math.min(this.emptyPollStreak + 1, 4);
    } else {
      this.emptyPollStreak = 0;
      await this.triggerSync();
    }
  }

  // Core sync implementation
  private async performSync(): Promise<SyncResult> {
    const pendingActions = await offlineStorage.getPendingActions();
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: 0,
      errors: [],
    };

    logger.debug(LogCategory.NETWORK, `[Sync] Processing ${pendingActions.length} pending actions`);

    for (const action of pendingActions) {
      try {
        await this.processAction(action);
        await offlineStorage.removePendingAction(action.id);
        result.synced++;
        logger.debug(LogCategory.NETWORK, `[Sync] Successfully processed action: ${action.type}`);
      } catch (error) {
        logger.error(LogCategory.NETWORK, `[Sync] Failed to process action`, error as Error, {
          action,
        });

        if (error instanceof ConflictError) {
          await this.handleConflict(action, error.conflictData);
          result.conflicts++;
        } else {
          await offlineStorage.incrementRetryCount(action.id);
          result.failed++;
          result.errors.push(
            `Action ${action.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    // Update last sync timestamp
    await offlineStorage.updateLastSync();

    logger.debug(
      LogCategory.NETWORK,
      `[Sync] Sync completed: ${result.synced} synced, ${result.failed} failed, ${result.conflicts} conflicts`
    );
    return result;
  }

  // Process individual action
  private async processAction(action: PendingAction): Promise<void> {
    const maxRetries = 3;
    if (action.retryCount && action.retryCount >= maxRetries) {
      throw new Error(`Max retries exceeded for action ${action.id}`);
    }

    switch (action.type) {
      case 'UPDATE_MATCH':
        await this.updateMatch(action.data);
        break;

      case 'UPDATE_FENCER':
        await this.updateFencer(action.data);
        break;

      case 'CREATE_POOL':
        await this.createPool(action.data);
        break;

      case 'DELETE_POOL':
        await this.deletePool(action.data);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  // Action implementations
  private async updateMatch(data: PendingActionData): Promise<void> {
    const response = await fetch(`/api/matches/${data.matchId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data.updates),
    });

    if (!response.ok) {
      if (response.status === 409) {
        // Conflict - server has newer version
        const serverData = await response.json();
        throw new ConflictError('Server has newer version', serverData);
      }
      throw new Error(`Update failed: ${response.statusText}`);
    }
  }

  private async updateFencer(data: PendingActionData): Promise<void> {
    const response = await fetch(`/api/fencers/${data.fencerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data.updates),
    });

    if (!response.ok) {
      if (response.status === 409) {
        const serverData = await response.json();
        throw new ConflictError('Server has newer version', serverData);
      }
      throw new Error(`Update failed: ${response.statusText}`);
    }
  }

  private async createPool(data: PendingActionData): Promise<void> {
    const response = await fetch('/api/pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Create failed: ${response.statusText}`);
    }
  }

  private async deletePool(data: PendingActionData): Promise<void> {
    const response = await fetch(`/api/pools/${data.poolId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }
  }

  // Conflict handling
  private async handleConflict(action: PendingAction, conflictData: unknown): Promise<void> {
    const conflict: SyncConflict = {
      id: '', // Will be generated by storage manager
      entityType: this.getEntityTypeFromAction(action.type),
      entityId: this.getEntityIdFromAction(action.data),
      localVersion: action.data,
      remoteVersion: conflictData,
      timestamp: Date.now(),
    };

    await offlineStorage.addConflict(conflict);
    logger.debug(LogCategory.NETWORK, '[Sync] Conflict detected and stored', { conflict });
  }

  private getEntityTypeFromAction(actionType: string): 'match' | 'fencer' | 'pool' {
    if (actionType.includes('MATCH')) return 'match';
    if (actionType.includes('FENCER')) return 'fencer';
    if (actionType.includes('POOL')) return 'pool';
    return 'match'; // fallback
  }

  private getEntityIdFromAction(actionData: PendingActionData): string {
    return actionData.matchId || actionData.fencerId || actionData.poolId || '';
  }

  // Cache management
  public async refreshCache(competitionId: string): Promise<void> {
    if (!this.isOnline) {
      logger.debug(LogCategory.NETWORK, '[Sync] Skipping cache refresh - offline');
      return;
    }

    try {
      logger.debug(LogCategory.NETWORK, '[Sync] Refreshing cache for competition', {
        competitionId,
      });

      // Fetch latest data
      const [competition, fencers, pools, matches] = await Promise.all([
        this.fetchCompetition(competitionId),
        this.fetchFencers(competitionId),
        this.fetchPools(competitionId),
        this.fetchMatches(competitionId),
      ]);

      // Update local cache
      await Promise.all([
        offlineStorage.cacheCompetition(competition),
        offlineStorage.cacheFencers(fencers),
        offlineStorage.cachePools(pools),
        offlineStorage.cacheMatches(matches),
      ]);

      logger.debug(LogCategory.NETWORK, '[Sync] Cache refreshed successfully');
    } catch (error) {
      logger.error(LogCategory.NETWORK, '[Sync] Failed to refresh cache', error as Error);
    }
  }

  // Data fetching methods
  private async fetchCompetition(id: string): Promise<Competition> {
    const response = await fetch(`/api/competitions/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch competition: ${response.statusText}`);
    return response.json();
  }

  private async fetchFencers(competitionId: string): Promise<Fencer[]> {
    const response = await fetch(`/api/competitions/${competitionId}/fencers`);
    if (!response.ok) throw new Error(`Failed to fetch fencers: ${response.statusText}`);
    return response.json();
  }

  private async fetchPools(competitionId: string): Promise<Pool[]> {
    const response = await fetch(`/api/competitions/${competitionId}/pools`);
    if (!response.ok) throw new Error(`Failed to fetch pools: ${response.statusText}`);
    return response.json();
  }

  private async fetchMatches(competitionId: string): Promise<Match[]> {
    const response = await fetch(`/api/competitions/${competitionId}/matches`);
    if (!response.ok) throw new Error(`Failed to fetch matches: ${response.statusText}`);
    return response.json();
  }

  // Callback management
  public onSyncComplete(callback: (result: SyncResult) => void): void {
    this.syncCallbacks.push(callback);
  }

  public removeSyncCallback(callback: (result: SyncResult) => void): void {
    this.syncCallbacks = this.syncCallbacks.filter(cb => cb !== callback);
  }

  private notifySyncCallbacks(result: SyncResult): void {
    this.syncCallbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        logger.error(LogCategory.NETWORK, '[Sync] Error in sync callback', error as Error);
      }
    });
  }

  // Status methods
  public isCurrentlyOnline(): boolean {
    return this.isOnline;
  }

  public isCurrentlySyncing(): boolean {
    return this.syncInProgress;
  }

  public async getSyncStatus() {
    return offlineStorage.getSyncStatus();
  }

  // Conflict resolution
  public async resolveConflict(conflictId: string, resolution: 'local' | 'remote'): Promise<void> {
    const conflicts = await offlineStorage.getConflicts();
    const conflict = conflicts.find(c => c.id === conflictId);

    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    try {
      if (resolution === 'local') {
        // Apply local version to server
        await this.forceUpdateToServer(conflict);
      } else {
        // Accept remote version (just mark conflict as resolved)
        await this.acceptRemoteVersion(conflict);
      }

      await offlineStorage.resolveConflict(conflictId, resolution);
      logger.debug(
        LogCategory.NETWORK,
        `[Sync] Conflict ${conflictId} resolved with ${resolution} version`
      );
    } catch (error) {
      logger.error(
        LogCategory.NETWORK,
        `[Sync] Failed to resolve conflict ${conflictId}`,
        error as Error
      );
      throw error;
    }
  }

  private async forceUpdateToServer(conflict: SyncConflict): Promise<void> {
    // Implementation depends on entity type
    const { entityType, entityId, localVersion } = conflict;

    let url = '';
    switch (entityType) {
      case 'match':
        url = `/api/matches/${entityId}/force-update`;
        break;
      case 'fencer':
        url = `/api/fencers/${entityId}/force-update`;
        break;
      case 'pool':
        url = `/api/pools/${entityId}/force-update`;
        break;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(localVersion),
    });

    if (!response.ok) {
      throw new Error(`Force update failed: ${response.statusText}`);
    }
  }

  private async acceptRemoteVersion(conflict: SyncConflict): Promise<void> {
    const { entityType, entityId, remoteVersion } = conflict;

    switch (entityType) {
      case 'match':
        await offlineStorage.cacheMatches([remoteVersion as Match]);
        break;
      case 'fencer':
        await offlineStorage.cacheFencers([remoteVersion as Fencer]);
        break;
      case 'pool':
        await offlineStorage.cachePools([remoteVersion as Pool]);
        break;
    }

    logger.debug(
      LogCategory.NETWORK,
      `[Sync] Accepted remote version for ${entityType} ${entityId}`
    );
  }
}

// Custom error for conflicts
class ConflictError extends Error {
  public conflictData: unknown;

  constructor(message: string, conflictData: unknown) {
    super(message);
    this.name = 'ConflictError';
    this.conflictData = conflictData;
  }
}

// Singleton instance
export const offlineSync = new OfflineSyncManager();
