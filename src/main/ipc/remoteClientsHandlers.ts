/**
 * BellePoule Modern - Handlers IPC remote:* (clients connectés, commandes, synthèse vocale) et app:getTtsConfig / app:getLogo / app:getLogos / app:saveLogos
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { remoteServers } from '../remoteRegistry';

export function registerRemoteClientsHandlers(): void {
  ipcMain.handle('remote:getConnectedClients', async (_, competitionId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      return { success: true, clients: entry?.server.getConnectedClients() ?? [] };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        clients: [],
      };
    }
  });

  ipcMain.handle(
    'remote:sendClientCommand',
    async (_, competitionId: string, socketId: string, command: any) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.sendClientCommand(socketId, command);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('remote:broadcastCommand', async (_, competitionId: string, command: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.broadcastCommand(command);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:renameClient',
    async (_, competitionId: string, socketId: string, label: string) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.renameClient(socketId, label);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('remote:identifyClient', async (_, competitionId: string, socketId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.identifyClient(socketId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:setClientKioskMode',
    async (_, competitionId: string, socketId: string, config: any) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.setClientKioskMode(socketId, config);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('remote:setTtsConfig', async (_, config: unknown) => {
    try {
      const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
      await fs.promises.writeFile(ttsPath, JSON.stringify(config), 'utf-8');
      for (const { server } of remoteServers.values()) {
        server.setTtsConfig(config as any);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('app:getTtsConfig', async () => {
    const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
    try {
      return JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('app:getLogo', async () => {
    const logoPath = path.join(app.getPath('userData'), 'logo.dat');
    try {
      return await fs.promises.readFile(logoPath, 'utf-8');
    } catch {
      return null;
    }
  });

  // Bibliothèque de logos (plusieurs logos, l'actif reste dans logo.dat)
  ipcMain.handle('app:getLogos', async () => {
    const libPath = path.join(app.getPath('userData'), 'logos.json');
    try {
      const parsed = JSON.parse(await fs.promises.readFile(libPath, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  ipcMain.handle('app:saveLogos', async (_, logos: unknown) => {
    try {
      if (!Array.isArray(logos) || logos.length > 50) return { success: false };
      const clean = logos.filter(
        (l): l is { id: string; name: string; data: string } =>
          !!l &&
          typeof l.id === 'string' &&
          typeof l.name === 'string' &&
          typeof l.data === 'string' &&
          l.data.startsWith('data:image/')
      );
      const libPath = path.join(app.getPath('userData'), 'logos.json');
      const tmp = `${libPath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(clean), 'utf-8');
      await fs.promises.rename(tmp, libPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });
}
