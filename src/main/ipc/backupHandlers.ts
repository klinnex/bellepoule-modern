/**
 * BellePoule Modern - Handlers IPC `backup:*` : dossier de sauvegarde par défaut
 * (Paramètres → Sauvegarde). Le chemin ne vient que du sélecteur natif de dossier.
 * Licensed under GPL-3.0
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { resolveBackupDir, writeBackupSettings, type BackupDirInfo } from '../backupSettings';

export function getBackupDirInfo(): BackupDirInfo {
  return resolveBackupDir(app.getPath('userData'), app.getPath('documents'));
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:get', async () => getBackupDirInfo());

  ipcMain.handle('backup:chooseDir', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const chosen = result.canceled ? undefined : result.filePaths[0];
    if (chosen) writeBackupSettings(app.getPath('userData'), { dir: chosen });
    return getBackupDirInfo();
  });

  ipcMain.handle('backup:resetDir', async () => {
    writeBackupSettings(app.getPath('userData'), {});
    return getBackupDirInfo();
  });
}
