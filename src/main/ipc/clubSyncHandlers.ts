/**
 * BellePoule Modern - Handlers IPC `club:sync*` : synchronisation d'un club vers un dossier
 * (Google Drive, Dropbox…). Le dossier ne vient que du sélecteur natif (côté main).
 * Licensed under GPL-3.0
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { DatabaseManager } from '../../database';
import { ClubSyncService, type ClubSyncStatus } from '../clubSync';

export interface ClubSyncHandlersContext {
  db: DatabaseManager;
  userDataPath: string;
}

let service: ClubSyncService | null = null;

/** Arrêt de la synchro périodique (avant fermeture de l'application) */
export function stopClubSync(): void {
  service?.stop();
}

function notifyWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

async function pickSyncDir(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow();
  const options: Electron.OpenDialogOptions = {
    title: 'Dossier de synchronisation du club',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

export function registerClubSyncHandlers(ctx: ClubSyncHandlersContext): void {
  service = new ClubSyncService(ctx.db, ctx.userDataPath, clubId =>
    notifyWindows('club:synced', clubId)
  );
  service.start();
  const svc = service;

  ipcMain.handle('club:syncStatus', (_, clubId: string): ClubSyncStatus => svc.status(clubId));

  // Choix du dossier puis activation ; null si le sélecteur est annulé
  ipcMain.handle('club:syncEnable', async (_, clubId: string) => {
    const dir = await pickSyncDir();
    if (!dir) return null;
    return svc.enable(clubId, dir);
  });

  ipcMain.handle('club:syncDisable', (_, clubId: string) => svc.disable(clubId));

  ipcMain.handle('club:syncNow', (_, clubId: string) => svc.sync(clubId));

  ipcMain.handle('club:syncResolve', (_, clubId: string, keep: unknown) =>
    svc.resolve(clubId, keep === 'file' ? 'file' : 'app')
  );
}
