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

// E/S asynchrones : le process principal sert aussi le serveur distant en direct (#1776).
async function readThemesFile(): Promise<unknown[]> {
  try {
    const raw = await fs.promises.readFile(getThemesFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeThemesFile(themes: unknown[]): Promise<void> {
  await fs.promises.writeFile(getThemesFilePath(), JSON.stringify(themes, null, 2), 'utf-8');
}

// Lecture-modification-écriture sérialisées : deux sauvegardes concurrentes ne s'écrasent pas.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function registerThemesHandlers(): void {
  ipcMain.handle('themes:list', () => serialized(readThemesFile));

  ipcMain.handle('themes:save', (_, theme: unknown) =>
    serialized(async () => {
      try {
        const themes = (await readThemesFile()) as any[];
        const t = theme as { id: string };
        const idx = themes.findIndex((x: any) => x.id === t.id);
        if (idx >= 0) themes[idx] = t;
        else themes.push(t);
        await writeThemesFile(themes);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    })
  );

  ipcMain.handle('themes:delete', (_, id: string) =>
    serialized(async () => {
      try {
        const themes = (await readThemesFile()) as any[];
        await writeThemesFile(themes.filter((x: any) => x.id !== id));
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    })
  );
}
