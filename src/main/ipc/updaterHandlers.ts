/**
 * BellePoule Modern - Handlers IPC `updater:*` : mises à jour automatiques
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import type { AutoUpdater } from '../autoUpdater';

export interface UpdaterHandlersContext {
  /** L'updater est créé après l'ouverture de la fenêtre : lecture différée */
  getAutoUpdater(): AutoUpdater | null;
}

export function registerUpdaterHandlers({ getAutoUpdater }: UpdaterHandlersContext): void {
  ipcMain.handle('updater:check', async () => {
    const autoUpdater = getAutoUpdater();
    if (autoUpdater) {
      return await autoUpdater.checkForUpdates();
    }
    return null;
  });

  ipcMain.handle('updater:setSilentMode', async (_, enabled: boolean) => {
    const autoUpdater = getAutoUpdater();
    if (autoUpdater) {
      autoUpdater.setSilentMode(enabled);
      return { success: true, silent: enabled };
    }
    return { success: false, error: 'updater_unavailable' };
  });

  ipcMain.handle('updater:getSilentMode', async () => {
    const autoUpdater = getAutoUpdater();
    if (autoUpdater) {
      return { silent: autoUpdater.isSilentMode() };
    }
    return { silent: false };
  });

  ipcMain.handle('updater:hasPendingUpdate', async () => {
    const autoUpdater = getAutoUpdater();
    if (autoUpdater) {
      return { hasPending: autoUpdater.hasPendingUpdate() };
    }
    return { hasPending: false };
  });

  ipcMain.handle('updater:getPendingUpdateInfo', async () => {
    const autoUpdater = getAutoUpdater();
    if (autoUpdater) {
      return autoUpdater.getPendingUpdateInfo();
    }
    return null;
  });

  ipcMain.handle('updater:installPendingUpdate', async () => {
    const autoUpdater = getAutoUpdater();
    if (autoUpdater) {
      await autoUpdater.checkAndInstallPendingUpdate();
      return { success: true };
    }
    return { success: false, error: 'updater_unavailable' };
  });
}
