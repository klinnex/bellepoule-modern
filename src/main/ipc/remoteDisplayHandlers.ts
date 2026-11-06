/**
 * BellePoule Modern - Handlers IPC remote:* (écrans : kiosque, thème écran, mot de passe arène, note orga, appel DT, signature)
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { ipcMain, type BrowserWindow } from 'electron';
import type { MatchSignatureRequest } from '../../shared/types/remote';
import { remoteServers } from '../remoteRegistry';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export interface RemoteDisplayHandlersContext {
  getMainWindow(): BrowserWindow | null;
}

export function registerRemoteDisplayHandlers({
  getMainWindow,
}: RemoteDisplayHandlersContext): void {
  ipcMain.handle(
    'remote:updateKioskViews',
    async (
      _,
      competitionId: string,
      views: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean }
    ) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) {
          return {
            success: false,
            error: 'remote_not_started',
          };
        }
        entry.server.updateKioskViews(views);
        return { success: true };
      } catch (error) {
        logger.error(LogCategory.NETWORK, 'Error updating kioskViews:', toError(error));
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle(
    'remote:updateKioskTheme',
    async (_, competitionId: string, variables: Record<string, string>) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) {
          return {
            success: false,
            error: 'remote_not_started',
          };
        }
        entry.server.updateKioskTheme(variables);
        return { success: true };
      } catch (error) {
        logger.error(LogCategory.NETWORK, 'Error updating kiosk theme:', toError(error));
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle(
    'remote:updateArenaScreenTheme',
    async (_, competitionId: string, arenaId: string, targetType: string, customTheme?: any) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.updateArenaScreenTheme(arenaId, targetType as any, customTheme);
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
    'remote:setArenaPassword',
    async (_, competitionId: string, arenaId: string, password: string) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) {
          return {
            success: false,
            error: 'remote_not_started',
          };
        }
        entry.server.setArenaPassword(arenaId, password);
        return { success: true };
      } catch (error) {
        logger.error(LogCategory.NETWORK, 'Error setting arena password:', toError(error));
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle('remote:setOrgNote', async (_, competitionId: string, note: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.setOrgNote(note);
      getMainWindow()?.webContents.send('kiosk:note', note);
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error setting org note:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:clearOrgNote', async (_event, competitionId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.clearOrgNote();
      getMainWindow()?.webContents.send('kiosk:note', null);
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error clearing org note:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:acknowledgeDTCall', async (_, competitionId: string, arenaId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.acknowledgeDTCall(arenaId);
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error acknowledging DT call:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:requestMatchSignature',
    async (_, competitionId: string, arenaId: string, request: MatchSignatureRequest) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        if (!entry.server.requestMatchSignature(arenaId, request)) {
          return { success: false, error: 'strip_not_found' };
        }
        return { success: true };
      } catch (error) {
        logger.error(LogCategory.NETWORK, 'Error requesting match signature:', toError(error));
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );
}
