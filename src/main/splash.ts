/**
 * BellePoule Modern - Écran de démarrage (splash) et mémorisation de la langue choisie
 * (extrait de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { setUiLanguage } from './menuLabels';
import { getVersionInfo } from './versionInfo';

// Splash window shown during startup
let splashWindow: BrowserWindow | null = null;
let splashShownAt: number | null = null;
const MIN_SPLASH_MS = 0;

// Language persistence file — read before renderer loads so splash can pre-select
const LANG_FILE = () => path.join(app.getPath('userData'), 'bellepoule-language.json');

export function readSavedLanguage(): string {
  try {
    const raw = fs.readFileSync(LANG_FILE(), 'utf-8');
    const parsed = JSON.parse(raw) as { language?: string };
    return parsed.language || 'fr';
  } catch {
    return 'fr';
  }
}

export function saveLanguageToFile(lang: string): void {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(LANG_FILE(), JSON.stringify({ language: lang }), 'utf-8');
  } catch (e) {
    console.error('Failed to save language preference:', e);
  }
}

// Promise that resolves when the user confirms a language in the splash screen
let splashConfirmResolve: ((lang: string) => void) | null = null;
export const splashConfirmPromise = new Promise<string>(resolve => {
  splashConfirmResolve = resolve;
});

export function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 480,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#0f1729',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js'),
    },
  });

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  splashWindow.setPosition(Math.floor((sw - 520) / 2), Math.floor((sh - 460) / 2));

  const splashPath = path.join(__dirname, 'splash.html');
  if (!fs.existsSync(splashPath)) {
    // No splash available — resolve immediately with saved lang
    splashConfirmResolve?.(readSavedLanguage());
    return;
  }

  const savedLang = readSavedLanguage();
  const iconPath = path.join(__dirname, '../../resources/icons/256x256.png');
  const versionInfo = getVersionInfo();
  const channel = process.env.NODE_ENV === 'development' || !app.isPackaged ? 'dev' : 'main';
  splashWindow.loadFile(splashPath, {
    query: {
      icon: iconPath,
      version: versionInfo.version,
      build: String(versionInfo.build),
      channel,
      lang: savedLang,
    },
  });
  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
    splashShownAt = Date.now();
    // Send saved language so splash can pre-select it
    splashWindow?.webContents.send('splash:init', savedLang);
  });
}

// IPC: splash confirms language choice
ipcMain.once('splash:confirm', (_event, lang: string) => {
  const validLangs = ['fr', 'en', 'de', 'es', 'zh-HK', 'br', 'ca'];
  const confirmed = validLangs.includes(lang) ? lang : 'fr';
  saveLanguageToFile(confirmed);
  setUiLanguage(confirmed);
  splashConfirmResolve?.(confirmed);
});

// IPC: user closes splash without confirming → quit
ipcMain.once('splash:close', () => {
  app.quit();
});

// onClosed est appelé après le fade-out, au moment d'afficher la fenêtre principale
export function closeSplash(onClosed?: () => void): void {
  if (!splashWindow || splashWindow.isDestroyed()) {
    onClosed?.();
    return;
  }
  // Garantir un affichage minimum pour que l'animation soit visible
  const elapsed = splashShownAt !== null ? Date.now() - splashShownAt : 0;
  const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

  setTimeout(() => {
    if (!splashWindow || splashWindow.isDestroyed()) {
      onClosed?.();
      return;
    }
    splashWindow.webContents
      .executeJavaScript('document.body.classList.add("fadeout"); true')
      .catch(() => {});
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      onClosed?.();
    }, 420);
  }, remaining);
}
