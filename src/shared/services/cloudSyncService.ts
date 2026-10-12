/**
 * BellePoule Modern - Cloud Sync Service
 * Backup, synchronization and cloud storage
 * Licensed under GPL-3.0
 */

import { Competition, Fencer, Match } from '../types';
import { detectConflicts, mergeActionsById } from '../utils/conflictResolution';
import { logger, LogCategory } from './logger';

/** Pont minimal vers le chiffrement OS exposé par le preload (safeStorage). */
interface CryptoBridge {
  isAvailable: () => Promise<boolean>;
  protect: (plaintext: string) => Promise<string | null>;
  unprotect: (ciphertext: string) => Promise<string | null>;
}

export interface CloudSyncConfig {
  provider: 'dropbox' | 'gdrive' | 'onedrive' | 'custom';
  apiKey?: string;
  apiSecret?: string;
  autoSync: boolean;
  syncInterval: number; // minutes
  encryptData: boolean;
  compressionEnabled: boolean;
}

export interface SyncStatus {
  lastSync: Date | null;
  isSyncing: boolean;
  pendingChanges: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export interface SyncConflict {
  id: string;
  type: 'competition' | 'fencer' | 'match';
  localData: unknown;
  remoteData: unknown;
  timestamp: Date;
}

export interface CloudBackup {
  id: string;
  timestamp: Date;
  size: number;
  version: string;
  description?: string;
  competitions: number;
  fencers: number;
}

export type LocalUpdateHandler = (data: {
  competitions: Competition[];
  fencers: Fencer[];
  matches: Match[];
}) => Promise<void>;

export class CloudSyncService {
  private config: CloudSyncConfig;
  private onLocalUpdate?: LocalUpdateHandler;
  private syncStatus: SyncStatus = {
    lastSync: null,
    isSyncing: false,
    pendingChanges: 0,
    conflicts: [],
    errors: [],
  };
  private syncIntervalId?: number;
  private encryptionKey?: CryptoKey;

  constructor(config: CloudSyncConfig, onLocalUpdate?: LocalUpdateHandler) {
    this.config = config;
    this.onLocalUpdate = onLocalUpdate;
    if (config.encryptData) {
      this.initializeEncryption();
    }
    if (config.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Initialize encryption for data security.
   * La clé AES-GCM est persistée en localStorage (JWK) pour survivre aux redémarrages.
   */
  private async initializeEncryption(): Promise<void> {
    // Clé claire historique (retro-compat) + clé chiffrée via safeStorage OS.
    const STORAGE_KEY = 'bellepoule-sync-key';
    const SECURE_STORAGE_KEY = 'bellepoule-sync-key-secure';
    try {
      const jwk = await this.loadOrCreateKeyJwk(STORAGE_KEY, SECURE_STORAGE_KEY);
      this.encryptionKey = await window.crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Encryption init failed', error as Error);
      throw new Error('Encryption initialization failed');
    }
  }

  /**
   * Charge la clé JWK depuis le stockage chiffré (safeStorage) si dispo,
   * sinon migre l'ancienne clé en clair, sinon en génère une nouvelle.
   */
  private async loadOrCreateKeyJwk(legacyKey: string, secureKey: string): Promise<JsonWebKey> {
    const crypto = (window as { electronAPI?: { crypto?: CryptoBridge } }).electronAPI?.crypto;
    const secureAvailable = crypto ? await crypto.isAvailable().catch(() => false) : false;

    // 1. Clé déjà chiffrée par l'OS
    if (secureAvailable && crypto) {
      const enc = localStorage.getItem(secureKey);
      if (enc) {
        const plain = await crypto.unprotect(enc).catch(() => null);
        if (plain) return JSON.parse(plain) as JsonWebKey;
      }
    }

    // 2. Migration : ancienne clé en clair -> chiffrer puis effacer le clair
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      if (secureAvailable && crypto) {
        const enc = await crypto.protect(legacy).catch(() => null);
        if (enc) {
          localStorage.setItem(secureKey, enc);
          localStorage.removeItem(legacyKey);
        }
      }
      return JSON.parse(legacy) as JsonWebKey;
    }

    // 3. Nouvelle clé
    const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const jwk = await window.crypto.subtle.exportKey('jwk', key);
    if (secureAvailable && crypto) {
      const enc = await crypto.protect(JSON.stringify(jwk)).catch(() => null);
      if (enc) {
        localStorage.setItem(secureKey, enc);
        return jwk;
      }
    }
    // Fallback (ex. environnement web sans safeStorage) : stockage clair — à éviter en production
    logger.warn(
      LogCategory.SYSTEM,
      'Clé AES stockée en clair dans localStorage (safeStorage indisponible)'
    );
    localStorage.setItem(legacyKey, JSON.stringify(jwk));
    return jwk;
  }

  /**
   * Encrypt data before sending to cloud
   */
  private async encryptData(data: string): Promise<string> {
    if (!this.encryptionKey || !this.config.encryptData) {
      return data;
    }

    try {
      const encoder = new TextEncoder();
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        encoder.encode(data)
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Encryption failed', error as Error);
      throw error;
    }
  }

  /**
   * Decrypt data from cloud
   */
  private async decryptData(encryptedData: string): Promise<string> {
    if (!this.encryptionKey || !this.config.encryptData) {
      return encryptedData;
    }

    try {
      const combined = new Uint8Array(
        atob(encryptedData)
          .split('')
          .map(c => c.charCodeAt(0))
      );
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        data
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Decryption failed', error as Error);
      throw error;
    }
  }

  /**
   * Compress data before upload using native CompressionStream (gzip)
   */
  private async compressData(data: string): Promise<string> {
    if (!this.config.compressionEnabled) {
      return data;
    }

    if (typeof CompressionStream === 'undefined') {
      return data;
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();

    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const compressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }

    // Encode as base64 with marker prefix so decompressData knows the format
    return 'gz:' + btoa(String.fromCharCode(...compressed));
  }

  /**
   * Decompress data produced by compressData (handles gz: prefix or plain JSON)
   */
  private async decompressData(data: string): Promise<string> {
    if (!data.startsWith('gz:')) {
      return data;
    }

    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream not available');
    }

    const b64 = data.slice(3);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();

    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(decompressed);
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    this.syncIntervalId = window.setInterval(
      () => {
        this.sync();
      },
      this.config.syncInterval * 60 * 1000
    );
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
    }
  }

  /**
   * Synchronize local data with cloud
   */
  async sync(): Promise<boolean> {
    if (this.syncStatus.isSyncing) {
      logger.debug(LogCategory.SYSTEM, 'Sync already in progress');
      return false;
    }

    this.syncStatus.isSyncing = true;
    this.syncStatus.errors = [];

    try {
      // Get local data
      const localData = await this.getLocalData();

      // Get remote data
      const remoteData = await this.getRemoteData();

      // Resolve conflicts
      const { mergedData, conflicts } = this.resolveConflicts(localData, remoteData);
      this.syncStatus.conflicts = conflicts;

      // Upload merged data
      await this.uploadToCloud(mergedData);

      // Update local data
      await this.updateLocalData(mergedData);

      this.syncStatus.lastSync = new Date();
      this.syncStatus.pendingChanges = 0;

      return true;
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Sync failed', error as Error);
      this.syncStatus.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return false;
    } finally {
      this.syncStatus.isSyncing = false;
    }
  }

  /**
   * Get all local data
   */
  private async getLocalData(): Promise<{
    competitions: Competition[];
    fencers: Fencer[];
    matches: Match[];
  }> {
    // This would interface with your local database
    // Placeholder implementation
    return {
      competitions: [],
      fencers: [],
      matches: [],
    };
  }

  /**
   * Get data from cloud
   */
  private async getRemoteData(): Promise<{
    competitions: Competition[];
    fencers: Fencer[];
    matches: Match[];
    timestamp: Date;
  }> {
    // Implementation depends on cloud provider
    // Placeholder
    return {
      competitions: [],
      fencers: [],
      matches: [],
      timestamp: new Date(),
    };
  }

  /**
   * Upload data to cloud
   */
  private async uploadToCloud(data: unknown): Promise<void> {
    const jsonData = JSON.stringify(data);
    const compressed = await this.compressData(jsonData);
    const encrypted = await this.encryptData(compressed);

    // Upload to provider
    switch (this.config.provider) {
      case 'dropbox':
        await this.uploadToDropbox(encrypted);
        break;
      case 'gdrive':
        await this.uploadToGoogleDrive(encrypted);
        break;
      case 'onedrive':
        await this.uploadToOneDrive(encrypted);
        break;
      case 'custom':
        await this.uploadToCustom(encrypted);
        break;
    }
  }

  /**
   * Upload to Dropbox
   */
  private async uploadToDropbox(data: string): Promise<void> {
    // Dropbox API implementation
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: '/bellepoule/backup.json',
          mode: 'overwrite',
          autorename: true,
          mute: false,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });

    if (!response.ok) {
      throw new Error(`Dropbox upload failed: ${response.statusText}`);
    }
  }

  /**
   * Upload to Google Drive
   */
  private async uploadToGoogleDrive(data: string): Promise<void> {
    const fileName = 'bellepoule-backup.json';
    const searchResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'&fields=files(id)`,
      { headers: { Authorization: `Bearer ${this.config.apiKey}` } }
    );
    if (!searchResp.ok) {
      throw new Error(`Google Drive search failed: ${searchResp.statusText}`);
    }
    const searchResult = (await searchResp.json()) as { files: Array<{ id: string }> };
    const existingId = searchResult.files[0]?.id;

    const metadata = JSON.stringify({ name: fileName, mimeType: 'application/json' });
    const boundary = 'bellepoule_boundary';
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      `${data}\r\n` +
      `--${boundary}--`;

    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const method = existingId ? 'PATCH' : 'POST';

    const uploadResp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!uploadResp.ok) {
      throw new Error(`Google Drive upload failed: ${uploadResp.statusText}`);
    }
  }

  /**
   * Upload to OneDrive
   */
  private async uploadToOneDrive(data: string): Promise<void> {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/drive/root:/bellepoule/backup.json:/content',
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: data,
      }
    );
    if (!response.ok) {
      throw new Error(`OneDrive upload failed: ${response.statusText}`);
    }
  }

  /**
   * Upload to custom server
   */
  private async uploadToCustom(data: string): Promise<void> {
    const response = await fetch('/api/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ data }),
    });

    if (!response.ok) {
      throw new Error(`Custom upload failed: ${response.statusText}`);
    }
  }

  /**
   * Resolve conflicts between local and remote data using last-write-wins per entity
   */
  private resolveConflicts(
    localData: { competitions: Competition[]; fencers: Fencer[]; matches: Match[] },
    remoteData: {
      competitions: Competition[];
      fencers: Fencer[];
      matches: Match[];
      timestamp: Date;
    }
  ): {
    mergedData: { competitions: Competition[]; fencers: Fencer[]; matches: Match[] };
    conflicts: SyncConflict[];
  } {
    const compConflicts = detectConflicts(localData.competitions, remoteData.competitions);
    const fencerConflicts = detectConflicts(localData.fencers, remoteData.fencers);
    const matchConflicts = detectConflicts(localData.matches, remoteData.matches);

    const conflicts: SyncConflict[] = [
      ...compConflicts.conflicted.map(c => ({
        id: c.local.id,
        type: 'competition' as const,
        localData: c.local,
        remoteData: c.remote,
        timestamp: new Date(),
      })),
      ...fencerConflicts.conflicted.map(c => ({
        id: c.local.id,
        type: 'fencer' as const,
        localData: c.local,
        remoteData: c.remote,
        timestamp: new Date(),
      })),
      ...matchConflicts.conflicted.map(c => ({
        id: c.local.id,
        type: 'match' as const,
        localData: c.local,
        remoteData: c.remote,
        timestamp: new Date(),
      })),
    ];

    const mergedData = {
      competitions: mergeActionsById(localData.competitions, remoteData.competitions),
      fencers: mergeActionsById(localData.fencers, remoteData.fencers),
      matches: mergeActionsById(localData.matches, remoteData.matches),
    };

    return { mergedData, conflicts };
  }

  /**
   * Update local database with synced data via the registered handler
   */
  private async updateLocalData(data: {
    competitions: Competition[];
    fencers: Fencer[];
    matches: Match[];
  }): Promise<void> {
    if (this.onLocalUpdate) {
      await this.onLocalUpdate(data);
    }
  }

  /**
   * Create a full backup
   */
  async createBackup(description?: string): Promise<CloudBackup> {
    const data = await this.getLocalData();
    const jsonData = JSON.stringify(data);
    const compressed = await this.compressData(jsonData);
    const encrypted = await this.encryptData(compressed);

    const backup: CloudBackup = {
      id: `backup-${Date.now()}`,
      timestamp: new Date(),
      size: new Blob([encrypted]).size,
      version: '1.0.0',
      description,
      competitions: data.competitions.length,
      fencers: data.fencers.length,
    };

    // Upload backup
    await this.uploadToCloud({
      ...data,
      _backupInfo: backup,
    });

    return backup;
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<CloudBackup[]> {
    // List backups from cloud provider
    // Placeholder
    return [];
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId: string): Promise<boolean> {
    try {
      // Download backup
      const backupData = await this.downloadBackup(backupId);

      // Decrypt and decompress
      const decrypted = await this.decryptData(backupData);
      const decompressed = await this.decompressData(decrypted);
      const data = JSON.parse(decompressed) as {
        competitions: Competition[];
        fencers: Fencer[];
        matches: Match[];
      };

      // Restore to local database
      await this.updateLocalData(data);

      return true;
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Restore failed', error as Error);
      return false;
    }
  }

  /**
   * Download backup from cloud
   */
  private async downloadBackup(backupId: string): Promise<string> {
    // Download implementation
    return '';
  }

  /**
   * Download current backup from the active cloud provider
   */
  async downloadFromCloud(): Promise<{
    competitions: Competition[];
    fencers: Fencer[];
    matches: Match[];
  }> {
    let raw: string;

    switch (this.config.provider) {
      case 'dropbox': {
        const resp = await fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Dropbox-API-Arg': JSON.stringify({ path: '/bellepoule/backup.json' }),
          },
        });
        if (!resp.ok) throw new Error(`Dropbox download failed: ${resp.statusText}`);
        raw = await resp.text();
        break;
      }
      case 'gdrive': {
        const searchResp = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='bellepoule-backup.json'&fields=files(id)`,
          { headers: { Authorization: `Bearer ${this.config.apiKey}` } }
        );
        if (!searchResp.ok) throw new Error(`Google Drive search failed: ${searchResp.statusText}`);
        const result = (await searchResp.json()) as { files: Array<{ id: string }> };
        const fileId = result.files[0]?.id;
        if (!fileId) throw new Error('Google Drive: backup file not found');
        const dlResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${this.config.apiKey}` } }
        );
        if (!dlResp.ok) throw new Error(`Google Drive download failed: ${dlResp.statusText}`);
        raw = await dlResp.text();
        break;
      }
      case 'onedrive': {
        const resp = await fetch(
          'https://graph.microsoft.com/v1.0/me/drive/root:/bellepoule/backup.json:/content',
          { headers: { Authorization: `Bearer ${this.config.apiKey}` } }
        );
        if (!resp.ok) throw new Error(`OneDrive download failed: ${resp.statusText}`);
        raw = await resp.text();
        break;
      }
      case 'custom': {
        const resp = await fetch('/api/backup', {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        });
        if (!resp.ok) throw new Error(`Custom download failed: ${resp.statusText}`);
        const json = (await resp.json()) as { data: string };
        raw = json.data;
        break;
      }
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }

    const decrypted = await this.decryptData(raw);
    const decompressed = await this.decompressData(decrypted);
    return JSON.parse(decompressed) as {
      competitions: Competition[];
      fencers: Fencer[];
      matches: Match[];
    };
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Check if sync is needed
   */
  async checkForUpdates(): Promise<boolean> {
    const remoteData = await this.getRemoteData();
    const localData = await this.getLocalData();

    // Compare timestamps and data
    // Placeholder - would need proper comparison logic
    return false;
  }

  /**
   * Disconnect from cloud
   */
  disconnect(): void {
    this.stopAutoSync();
    this.encryptionKey = undefined;
    this.syncStatus = {
      lastSync: null,
      isSyncing: false,
      pendingChanges: 0,
      conflicts: [],
      errors: [],
    };
  }
}

// React Hook for cloud sync
import { useState, useEffect, useCallback } from 'react';

export function useCloudSync(config: CloudSyncConfig) {
  const [service] = useState(() => new CloudSyncService(config));
  const [status, setStatus] = useState<SyncStatus>(service.getStatus());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(service.getStatus());
    }, 5000);

    return () => clearInterval(interval);
  }, [service]);

  const sync = useCallback(async () => {
    const success = await service.sync();
    setStatus(service.getStatus());
    return success;
  }, [service]);

  const createBackup = useCallback(
    async (description?: string) => {
      const backup = await service.createBackup(description);
      setStatus(service.getStatus());
      return backup;
    },
    [service]
  );

  const restoreBackup = useCallback(
    async (backupId: string) => {
      const success = await service.restoreFromBackup(backupId);
      return success;
    },
    [service]
  );

  const connect = useCallback(() => {
    setIsConnected(true);
    service.startAutoSync();
  }, [service]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    service.disconnect();
  }, [service]);

  return {
    status,
    isConnected,
    sync,
    createBackup,
    restoreBackup,
    connect,
    disconnect,
    service,
  };
}

export default CloudSyncService;
