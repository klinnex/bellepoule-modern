/**
 * BellePoule Modern - Handlers IPC remote:* (réglages : logo, fond d'écran, port, inscription, pointage, espace formateurs)
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../../database';
import { RemoteScoreServer } from '../remoteScoreServer';
import { ensureCert } from '../certManager';
import { remoteServers, usedPorts } from '../remoteRegistry';
import { applyActiveWave } from '../remote/activeWave';

export interface RemoteSettingsHandlersContext {
  db: DatabaseManager;
}

export function registerRemoteSettingsHandlers({ db }: RemoteSettingsHandlersContext): void {
  ipcMain.handle('remote:updateLogo', async (_, logo: string | null) => {
    try {
      const logoPath = path.join(app.getPath('userData'), 'logo.dat');
      if (logo) {
        await fs.promises.writeFile(logoPath, logo, 'utf-8');
      } else {
        try {
          fs.unlinkSync(logoPath);
        } catch {
          /* déjà absent */
        }
      }
      for (const { server } of remoteServers.values()) {
        server.setLogo(logo);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:setWallpaper',
    async (_, competitionId: string, wallpaper: string | null) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false };
        entry.server.setWallpaper(wallpaper);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('remote:changePort', async (_, competitionId: string, newPort: number) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return { success: false, error: 'remote_not_started' };
      }
      if (usedPorts.has(newPort) && newPort !== entry.port) {
        return { success: false, error: 'port_in_use', port: newPort };
      }
      const { host, useHttps, certFingerprint } = entry;
      let tlsOptions: { cert: string; key: string } | undefined;
      if (useHttps && certFingerprint) {
        try {
          const bundle = await ensureCert(app.getPath('userData'));
          tlsOptions = { cert: bundle.cert, key: bundle.key };
        } catch {
          /* ignore — redémarre en HTTP si cert inaccessible */
        }
      }
      entry.server.stop();
      usedPorts.delete(entry.port);
      const server = new RemoteScoreServer(db, newPort, host, tlsOptions);
      server.start();
      applyActiveWave(competitionId, server);
      remoteServers.set(competitionId, {
        server,
        port: newPort,
        host,
        useHttps: !!tlsOptions,
        certFingerprint,
      });
      usedPorts.add(newPort);
      return {
        success: true,
        serverInfo: {
          url: server.getServerUrl(),
          ip: server.getLocalIPAddress(),
          port: newPort,
          useHttps: !!tlsOptions,
          certFingerprint,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:setRegistrationEnabled',
    async (_, competitionId: string, enabled: boolean) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.setRegistrationEnabled(enabled);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('remote:setCheckinEnabled', async (_, competitionId: string, enabled: boolean) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.setCheckinEnabled(enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:setCheckinPassword',
    async (_, competitionId: string, password: string) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.setCheckinPassword(typeof password === 'string' ? password : '');
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  // Espace formateurs : commentaires d'arbitrage (#989)
  ipcMain.handle('remote:setTrainerEnabled', async (_, competitionId: string, enabled: boolean) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.setTrainerEnabled(!!enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:setTrainerPassword',
    async (_, competitionId: string, password: string) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.setTrainerPassword(typeof password === 'string' ? password : '');
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );
}
