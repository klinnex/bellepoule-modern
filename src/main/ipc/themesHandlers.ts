/**
 * BellePoule Modern - Handlers IPC `themes:*` : bibliothèque de thèmes (userData/themes.json)
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

function getThemesFilePath(): string {
  return path.join(app.getPath('userData'), 'themes.json');
}

function readThemesFile(): unknown[] {
  try {
    const raw = fs.readFileSync(getThemesFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeThemesFile(themes: unknown[]): void {
  fs.writeFileSync(getThemesFilePath(), JSON.stringify(themes, null, 2), 'utf-8');
}

export function registerThemesHandlers(): void {
  ipcMain.handle('themes:list', () => {
    return readThemesFile();
  });

  ipcMain.handle('themes:save', (_, theme: unknown) => {
    try {
      const themes = readThemesFile() as any[];
      const t = theme as { id: string };
      const idx = themes.findIndex((x: any) => x.id === t.id);
      if (idx >= 0) themes[idx] = t;
      else themes.push(t);
      writeThemesFile(themes);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  });

  ipcMain.handle('themes:delete', (_, id: string) => {
    try {
      const themes = readThemesFile() as any[];
      writeThemesFile(themes.filter((x: any) => x.id !== id));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  });
}
