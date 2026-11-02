/**
 * BellePoule Modern - Handlers IPC `file:*` (export/import, ZIP photos, archive .bpf)
 * et `dialog:*` (boîtes de dialogue natives) — extraits de main.ts, #1341.
 * Licensed under GPL-3.0
 */
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import type { DatabaseManager } from '../../database';
import {
  assertAuthorizedPath,
  authorizePath,
  checkZipEntries,
  readBoundedFile,
  validateImportedFencers,
} from '../pathAuthorization';
import { readImportText } from '../xlsxToCsv';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export interface FileHandlersContext {
  db: DatabaseManager;
  getMainWindow(): BrowserWindow | null;
}

export function registerFileHandlers({ db, getMainWindow }: FileHandlersContext): void {
  ipcMain.handle('file:export', async (_, filepath) => {
    await db.exportToFile(assertAuthorizedPath(filepath, 'write'));
  });

  ipcMain.handle('file:import', async (_, filepath) => {
    await db.importFromFile(assertAuthorizedPath(filepath, 'read'));
  });

  // Écriture atomique asynchrone (temp + rename) — ne bloque pas le main thread
  async function writeFileAtomic(filepath: string, content: Buffer | string): Promise<void> {
    const tmpPath = filepath + '.tmp';
    try {
      await fs.promises.writeFile(tmpPath, content);
      try {
        await fs.promises.rename(tmpPath, filepath);
      } catch {
        await fs.promises.writeFile(filepath, content);
        await fs.promises.unlink(tmpPath).catch(() => {});
      }
    } catch {
      await fs.promises.writeFile(filepath, content);
    }
  }

  // File content write handler
  ipcMain.handle('file:writeContent', async (_, filepath: string, content: string) => {
    // Chemin issu d'une boîte de dialogue native uniquement (#1146)
    const resolved = assertAuthorizedPath(filepath, 'write');
    const appDir = path.resolve(app.getAppPath());
    if (resolved.startsWith(appDir)) {
      throw new Error('Writing inside app directory is not allowed');
    }
    await fs.promises.writeFile(resolved, content, 'utf-8');
  });

  // Photo ZIP export handler
  ipcMain.handle('file:exportPhotos', async (_, competitionId: string, filepath: string) => {
    filepath = assertAuthorizedPath(filepath, 'write');
    const photos = db.getFencerPhotos(competitionId);
    const zip = new JSZip();

    for (const { id, license, lastName, firstName, photo } of photos) {
      const base64 = photo.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      const filename = license
        ? license
        : `${lastName}_${firstName}_${id.slice(0, 8)}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
      zip.file(`${filename}.jpg`, buffer);
    }

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    await writeFileAtomic(filepath, content);

    return { count: photos.length };
  });

  // Photo ZIP import handler
  ipcMain.handle('file:importPhotos', async (_, competitionId: string, filepath: string) => {
    filepath = assertAuthorizedPath(filepath, 'read', ['.zip']);
    const buffer = await readBoundedFile(filepath);
    const zip = await JSZip.loadAsync(buffer);
    const safeNames = checkZipEntries(zip);

    const photos: { license: string; photo: string }[] = [];

    for (const filename of safeNames) {
      const file = zip.files[filename];
      const ext = path.extname(filename).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;
      const basename = path.basename(filename, ext);
      const data = await file.async('base64');
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      photos.push({ license: basename, photo: `data:${mimeType};base64,${data}` });
    }

    return db.updateFencerPhotosByLicense(competitionId, photos);
  });

  // Fencer archive (.bpf) export handler
  ipcMain.handle(
    'file:exportFencersArchive',
    async (_, competitionId: string, filepath: string) => {
      filepath = assertAuthorizedPath(filepath, 'write');
      const fencers = db.getFencersByCompetition(competitionId);
      const competition = db.getCompetition(competitionId);
      const zip = new JSZip();
      zip.file(
        'meta.json',
        JSON.stringify({
          version: '1',
          competitionName: competition?.title ?? '',
          exportDate: new Date().toISOString(),
          count: fencers.length,
        })
      );
      zip.file('fencers.json', JSON.stringify(fencers));
      const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      await writeFileAtomic(filepath, content);
      return { count: fencers.length };
    }
  );

  // Fencer archive (.bpf) import handler
  ipcMain.handle(
    'file:importFencersArchive',
    async (_, competitionId: string, filepath: string) => {
      filepath = assertAuthorizedPath(filepath, 'read', ['.bpf']);
      const buffer = await readBoundedFile(filepath);
      const zip = await JSZip.loadAsync(buffer);
      checkZipEntries(zip);
      const fencersFile = zip.file('fencers.json');
      if (!fencersFile) throw new Error('Format .bpf invalide : fencers.json manquant');
      const fencers = validateImportedFencers(JSON.parse(await fencersFile.async('string')));
      return db.upsertFencersByLicense(competitionId, fencers);
    }
  );

  // Dialog handlers
  ipcMain.handle('dialog:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog(getMainWindow()!, options);

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      authorizePath(filePath, 'read');
      try {
        const content = await readImportText(filePath);
        return { filePath, content };
      } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Error reading file:', toError(error));
        return { filePath, content: '' };
      }
    }

    return null;
  });

  ipcMain.handle('dialog:saveFile', async (_, options) => {
    const result = await dialog.showSaveDialog(getMainWindow()!, options);
    if (!result.canceled && result.filePath) authorizePath(result.filePath, 'write');
    return result;
  });
}
