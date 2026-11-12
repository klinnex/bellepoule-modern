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
import { setSharedMainWindow } from '../mainWindowRef';
import { closeDemoScreens, openDemoScreens } from '../demoScreens';

const TRAINING_ID = '__training__';

export interface TrainingHandlersContext {
  db: DatabaseManager;
  getMainWindow(): BrowserWindow | null;
}

/**
 * Arrête le serveur d'entraînement (démo comprise) : arbitre virtuel, écrans de démo, port.
 * Renvoie false s'il ne tournait pas.
 */
export function stopTrainingServer(): boolean {
  const entry = remoteServers.get(TRAINING_ID);
  if (!entry) return false;
  closeDemoScreens();
  entry.server.stop();
  usedPorts.delete(entry.port);
  remoteServers.delete(TRAINING_ID);
  return true;
}

/** Détache les écouteurs posés sur la fenêtre principale par bindToMainWindow. */
let unbindMainWindow: (() => void) | null = null;

/**
 * Le serveur d'entraînement n'est piloté que par la fenêtre principale : fermée (macOS, l'app
 * reste dans le Dock) ou rechargée (état React perdu, plus de bouton « Arrêter »), il ne doit
 * pas continuer en arrière-plan (démo qui joue encore, saisie distante encore acceptée).
 */
function bindToMainWindow(main: BrowserWindow | null): void {
  if (!main || main.isDestroyed()) return;
  const stop = () => {
    stopTrainingServer();
    detach();
  };
  const detach = () => {
    unbindMainWindow = null;
    main.removeListener('closed', stop);
    if (!main.isDestroyed()) main.webContents.removeListener('did-navigate', stop);
  };
  unbindMainWindow?.();
  main.once('closed', stop);
  main.webContents.once('did-navigate', stop);
  unbindMainWindow = detach;
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
        setSharedMainWindow(getMainWindow());
        bindToMainWindow(getMainWindow());
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
      if (!stopTrainingServer()) return { success: false, error: 'training_not_started' };
      unbindMainWindow?.();
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

  // Démo autonome : écrans arène / tablette / kiosque sur le serveur d'entraînement en cours
  // (URL lue côté main : le renderer ne choisit pas l'adresse chargée)
  ipcMain.handle('training:openDemoScreens', async (_event, strips: number) => {
    try {
      const entry = remoteServers.get(TRAINING_ID);
      if (!entry) return { success: false, error: 'training_not_started' };
      const count = openDemoScreens(entry.server.getServerUrl(), Number(strips) || 1);
      // Fermer la fenêtre principale ferme aussi les écrans (sinon l'app resterait ouverte)
      const main = getMainWindow();
      if (main && !main.listeners('closed').includes(closeDemoScreens)) {
        main.once('closed', closeDemoScreens);
      }
      return { success: true, count };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });
}
