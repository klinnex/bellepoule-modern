/**
 * BellePoule Modern - Handlers IPC `training:*` : serveur du mode entraînement
 * (extraits de main.ts, #1155).
 * Licensed under GPL-3.0
 */
import { app, ipcMain, type BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import type { DatabaseManager } from '../../database';
import { ensureCert } from '../certManager';
import { RemoteScoreServer } from '../remoteScoreServer';
import { findAvailablePort, remoteServers, usedPorts } from '../remoteRegistry';

const TRAINING_ID = '__training__';

export interface TrainingHandlersContext {
  db: DatabaseManager;
  getMainWindow(): BrowserWindow | null;
}

export function registerTrainingHandlers({ db, getMainWindow }: TrainingHandlersContext): void {
  ipcMain.handle(
    'training:startServer',
    async (_event, port?: number, host?: string, useHttps?: boolean) => {
      try {
        if (remoteServers.has(TRAINING_ID)) {
          return { success: false, error: 'training_already_started' };
        }
        const effectivePort = findAvailablePort(port);
        const effectiveHost = host ?? '0.0.0.0';
        let tlsOptions: { cert: string; key: string } | undefined;
        let certFingerprint: string | undefined;
        if (useHttps) {
          try {
            const bundle = await ensureCert(app.getPath('userData'));
            tlsOptions = { cert: bundle.cert, key: bundle.key };
            certFingerprint = bundle.fingerprint;
          } catch (certError) {
            return { success: false, error: 'tls_cert_failed' };
          }
        }
        const server = new RemoteScoreServer(db, effectivePort, effectiveHost, tlsOptions);
        server.competitionId = TRAINING_ID;
        try {
          await server.start();
        } catch (startError: any) {
          return { success: false, error: startError?.message ?? 'Port indisponible' };
        }
        remoteServers.set(TRAINING_ID, {
          server,
          port: effectivePort,
          host: effectiveHost,
          useHttps: !!useHttps,
          certFingerprint,
        });
        usedPorts.add(effectivePort);
        try {
          const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
          server.setTtsConfig(JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8')));
        } catch {
          /* optionnel */
        }
        (global as any).mainWindow = getMainWindow();
        return {
          success: true,
          serverInfo: {
            url: server.getServerUrl(),
            ip: server.getLocalIPAddress(),
            port: effectivePort,
            useHttps: !!useHttps,
            certFingerprint,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('training:stopServer', async () => {
    try {
      const entry = remoteServers.get(TRAINING_ID);
      if (!entry) return { success: false, error: 'training_not_started' };
      entry.server.stop();
      usedPorts.delete(entry.port);
      remoteServers.delete(TRAINING_ID);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'training:startSession',
    async (_event, strips: number, weapon: string, customRules?: any) => {
      try {
        const entry = remoteServers.get(TRAINING_ID);
        if (!entry) return { success: false, error: 'training_not_started' };
        const session = await entry.server.startTrainingSession(strips, weapon, customRules);
        return { success: true, session };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('training:stopSession', async () => {
    try {
      const entry = remoteServers.get(TRAINING_ID);
      if (!entry) return { success: false, error: 'training_not_started' };
      entry.server.stopTrainingSession();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('training:getHistory', async () => {
    try {
      const entry = remoteServers.get(TRAINING_ID);
      if (!entry) return { success: true, history: [] };
      return { success: true, history: entry.server.getTrainingHistory() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('training:getSession', async () => {
    try {
      const entry = remoteServers.get(TRAINING_ID);
      if (!entry) return { success: true, session: null };
      return { success: true, session: entry.server.getSession() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('training:getArenas', async () => {
    try {
      const entry = remoteServers.get(TRAINING_ID);
      if (!entry) return { success: true, arenas: [] };
      return { success: true, arenas: entry.server.getAllArenas() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('training:getServerInfo', async () => {
    try {
      const entry = remoteServers.get(TRAINING_ID);
      if (!entry) return { success: false, error: 'server_not_started' };
      return {
        success: true,
        serverInfo: {
          url: entry.server.getServerUrl(),
          ip: entry.server.getLocalIPAddress(),
          port: entry.port,
          useHttps: entry.useHttps,
          certFingerprint: entry.certFingerprint,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });
}
