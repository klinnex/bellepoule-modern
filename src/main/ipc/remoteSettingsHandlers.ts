/**
 * BellePoule Modern - Handlers IPC remote:* (réglages : logo, fond d'écran, inscription, pointage, espace formateurs)
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../../database';
import { remoteServers } from '../remoteRegistry';

export interface RemoteSettingsHandlersContext {
  db: DatabaseManager;
}

export function registerRemoteSettingsHandlers(_ctx: RemoteSettingsHandlersContext): void {
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
