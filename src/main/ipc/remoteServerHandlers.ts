/**
 * BellePoule Modern - Handlers IPC remote:* (cycle de vie du serveur : interfaces, start/stop, infos, empreinte TLS)
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { app, ipcMain, type BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DatabaseManager } from '../../database';
import { RemoteScoreServer } from '../remoteScoreServer';
import { ensureCert } from '../certManager';
import { findAvailablePort, remoteServers, stopRemoteServer, usedPorts } from '../remoteRegistry';
import { applyActiveWave } from '../remote/activeWave';
import { setSharedMainWindow } from '../mainWindowRef';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export interface RemoteServerHandlersContext {
  db: DatabaseManager;
  getMainWindow(): BrowserWindow | null;
}

export function registerRemoteServerHandlers({
  db,
  getMainWindow,
}: RemoteServerHandlersContext): void {
  // Remote score server handlers
  ipcMain.handle('remote:getNetworkInterfaces', async () => {
    const ifaces = os.networkInterfaces();
    const result: { name: string; address: string }[] = [
      { name: 'Toutes les interfaces', address: '0.0.0.0' },
    ];
    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const iface of addrs || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          result.push({ name: `${name} (${iface.address})`, address: iface.address });
        }
      }
    }
    return { success: true, interfaces: result };
  });

  ipcMain.handle(
    'remote:startServer',
    async (_event, competitionId: string, port?: number, host?: string, useHttps?: boolean) => {
      try {
        if (remoteServers.has(competitionId)) {
          return { success: false, error: 'remote_already_started' };
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
            logger.error(
              LogCategory.NETWORK,
              'Erreur génération certificat TLS:',
              toError(certError)
            );
            return { success: false, error: 'tls_cert_failed' };
          }
        }

        const server = new RemoteScoreServer(db, effectivePort, effectiveHost, tlsOptions);
        try {
          await server.start();
        } catch (startError: any) {
          logger.error(
            LogCategory.NETWORK,
            'Error binding remote server port:',
            toError(startError)
          );
          return { success: false, error: startError?.message ?? 'Port indisponible' };
        }
        applyActiveWave(competitionId, server);
        remoteServers.set(competitionId, {
          server,
          port: effectivePort,
          host: effectiveHost,
          useHttps: !!useHttps,
          certFingerprint,
        });
        usedPorts.add(effectivePort);

        // Appliquer la config TTS persistée aux tablettes de ce nouveau serveur
        try {
          const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
          server.setTtsConfig(JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8')));
        } catch {
          /* config TTS optionnelle */
        }
        setSharedMainWindow(getMainWindow());

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
        logger.error(LogCategory.NETWORK, 'Error starting remote server:', toError(error));
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('remote:stopServer', async (_event, competitionId: string) => {
    try {
      if (!stopRemoteServer(competitionId)) {
        return { success: false, error: 'remote_not_started' };
      }

      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error stopping remote server:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:getServerInfo', async (_event, competitionId: string) => {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'remote_not_started' };
    }

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
  });

  ipcMain.handle('remote:getCertFingerprint', async () => {
    try {
      const bundle = await ensureCert(app.getPath('userData'));
      return { success: true, fingerprint: bundle.fingerprint };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });
}
