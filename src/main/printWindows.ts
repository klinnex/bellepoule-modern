/**
 * BellePoule Modern - Fenêtres cachées d'impression HTML (#1214)
 * Impression silencieuse (boîte intégrée) et avec la boîte de dialogue native du système.
 * HTML écrit dans un dossier privé (mkdtemp 0700, fichier 0600 exclusif), supprimé ensuite.
 * Licensed under GPL-3.0
 */
import { BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

export async function printHtmlWithSystemDialog(
  html: string
): Promise<{ success: boolean; error?: string; detail?: string }> {
  // Dossier privé (mkdtemp, 0700) + création exclusive 0600 : pas de fichier prévisible dans le tmp partagé
  let dir: string;
  let tmpFile: string;
  try {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-print-'));
    tmpFile = path.join(dir, 'print.html');
    await fs.promises.writeFile(tmpFile, html, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  } catch (e) {
    return { success: false, error: 'temp_file_failed', detail: String(e) };
  }
  const cleanup = () => fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});

  return new Promise<{ success: boolean; error?: string }>(resolve => {
    const printWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false },
    });
    printWin.setMenu(null);
    printWin.loadFile(tmpFile);

    printWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        printWin.webContents.print({ silent: false, printBackground: true }, (success: boolean) => {
          void cleanup();
          printWin.destroy();
          resolve({ success });
        });
      }, 800);
    });

    printWin.webContents.once('did-fail-load', () => {
      void cleanup();
      printWin.destroy();
      resolve({ success: false, error: 'html_load_failed' });
    });
  });
}

export async function printHtmlSilently(
  html: string,
  options: Electron.WebContentsPrintOptions
): Promise<boolean> {
  // Dossier privé (mkdtemp, 0700) + création exclusive 0600 : pas de fichier prévisible dans le tmp partagé
  let dir: string;
  let tmpFile: string;
  try {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bp-print-'));
    tmpFile = path.join(dir, 'print.html');
    await fs.promises.writeFile(tmpFile, html, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  } catch {
    return false;
  }
  return new Promise<boolean>(resolve => {
    const printWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false },
    });
    const done = (ok: boolean) => {
      printWin.destroy();
      fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      resolve(ok);
    };
    printWin.setMenu(null);
    printWin.loadFile(tmpFile);
    printWin.webContents.once('did-finish-load', () => {
      setTimeout(() => printWin.webContents.print(options, ok => done(ok)), 800);
    });
    printWin.webContents.once('did-fail-load', () => done(false));
  });
}
