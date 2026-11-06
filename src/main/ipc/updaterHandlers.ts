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

  ipcMain.handle('updater:downloadAndInstall', async () => {
    const autoUpdater = getAutoUpdater();
    if (autoUpdater) return await autoUpdater.downloadAndInstallFromUi();
    return { success: false, error: 'updater_unavailable' };
  });

  ipcMain.handle('updater:getAutoCheck', async () => {
    const autoUpdater = getAutoUpdater();
    return { enabled: autoUpdater ? autoUpdater.isAutoCheckEnabled() : true };
  });

  ipcMain.handle('updater:setAutoCheck', async (_, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Enabled must be a boolean');
    const autoUpdater = getAutoUpdater();
    if (!autoUpdater) return { success: false, error: 'updater_unavailable' };
    autoUpdater.setAutoCheck(enabled);
    return { success: true, enabled };
  });

  ipcMain.handle('updater:getChannel', async () => {
    const autoUpdater = getAutoUpdater();
    return { channel: autoUpdater ? autoUpdater.getChannel() : 'stable' };
  });

  ipcMain.handle('updater:setChannel', async (_, channel: unknown) => {
    if (channel !== 'stable' && channel !== 'dev') throw new Error('Invalid channel');
    const autoUpdater = getAutoUpdater();
    if (!autoUpdater) return { success: false, error: 'updater_unavailable' };
    autoUpdater.setChannel(channel);
    return { success: true, channel };
  });
}
