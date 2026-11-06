/**
 * BellePoule Modern - Handlers IPC remote:* (cycle de vie de la session et réglages : lancement, arrêt, bandes, thèmes)
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import { remoteServers } from '../remoteRegistry';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export function registerRemoteSessionHandlers(): void {
  ipcMain.handle('remote:stopSession', async (_event, competitionId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }

      entry.server.stopSession();
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error stopping session:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:launchCompetition', async (_event, competitionId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }

      entry.server.launchCompetition();
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error launching competition:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:getSession', async (_event, competitionId: string) => {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'remote_not_started' };
    }

    return { success: true, session: entry.server.getSession() };
  });

  ipcMain.handle('remote:getArenas', async (_event, competitionId: string) => {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'remote_not_started' };
    }

    return { success: true, arenas: entry.server.getAllArenas() };
  });

  ipcMain.handle('remote:updateStripCount', async (_, competitionId: string, newCount: number) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }

      const session = entry.server.updateStripCount(newCount);
      return { success: true, session };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error updating strip count:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:updateShowPhotos', async (_, competitionId: string, value: boolean) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.updateShowPhotos(value);
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error updating showPhotos:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:updateCardAnnounce', async (_, competitionId: string, value: boolean) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.updateCardAnnounce(value);
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error updating cardAnnounce:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:updateTheme', async (_, competitionId: string, theme: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.updateTheme(theme as any);
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.NETWORK, 'Error updating theme:', toError(error));
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle(
    'remote:updateArenaTheme',
    async (_, competitionId: string, arenaId: string, theme: string, customTheme?: any) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) {
          return {
            success: false,
            error: 'remote_not_started',
          };
        }
        entry.server.updateArenaTheme(arenaId, theme as any, customTheme);
        return { success: true };
      } catch (error) {
        logger.error(LogCategory.NETWORK, 'Error updating arena theme:', toError(error));
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle(
    'remote:clearArenaThemeOverride',
    async (_, competitionId: string, arenaId: string) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry)
          return {
            success: false,
            error: 'remote_not_started',
          };
        entry.server.clearArenaThemeOverride(arenaId);
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
