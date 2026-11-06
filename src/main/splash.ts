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
import { logger, LogCategory, toError } from '../shared/services/logger';

// Splash window shown during startup
let splashWindow: BrowserWindow | null = null;
let splashShownAt: number | null = null;
const MIN_SPLASH_MS = 0;

// Language persistence file — read before renderer loads so splash can pre-select
const LANG_FILE = () => path.join(app.getPath('userData'), 'bellepoule-language.json');

interface SplashPrefs {
  language?: string;
  /** false = splash masqué au démarrage (langue mémorisée appliquée directement) */
  showSplash?: boolean;
}

function readPrefs(): SplashPrefs {
  try {
    const parsed = JSON.parse(fs.readFileSync(LANG_FILE(), 'utf-8')) as SplashPrefs;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefs(patch: SplashPrefs): void {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(LANG_FILE(), JSON.stringify({ ...readPrefs(), ...patch }), 'utf-8');
  } catch (e) {
    logger.error(LogCategory.SYSTEM, 'Failed to save splash preferences:', toError(e));
  }
}

export function readSavedLanguage(): string {
  const lang = readPrefs().language;
  return typeof lang === 'string' && lang ? lang : 'fr';
}

export function saveLanguageToFile(lang: string): void {
  writePrefs({ language: lang });
}

/** Splash affiché au démarrage ? (true par défaut) */
export function isSplashEnabled(): boolean {
  return readPrefs().showSplash !== false;
}

export function setSplashEnabled(enabled: boolean): void {
  writePrefs({ showSplash: enabled });
}

// Promise that resolves when the user confirms a language in the splash screen
let splashConfirmResolve: ((lang: string) => void) | null = null;
export const splashConfirmPromise = new Promise<string>(resolve => {
  splashConfirmResolve = resolve;
});

export function createSplashWindow(): void {
  if (!isSplashEnabled()) {
    // Splash désactivé : langue mémorisée appliquée directement
    const lang = readSavedLanguage();
    setUiLanguage(lang);
    splashConfirmResolve?.(lang);
    return;
  }
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
ipcMain.once('splash:confirm', (_event, lang: string, hideNextTime?: unknown) => {
  const validLangs = ['fr', 'en', 'de', 'es', 'pt', 'it', 'ru', 'zh-HK', 'br', 'ca'];
  const confirmed = validLangs.includes(lang) ? lang : 'fr';
  saveLanguageToFile(confirmed);
  if (hideNextTime === true) setSplashEnabled(false);
  setUiLanguage(confirmed);
  splashConfirmResolve?.(confirmed);
});

// IPC: préférence « afficher le splash au démarrage » (Paramètres)
ipcMain.handle('app:getSplashEnabled', () => ({ enabled: isSplashEnabled() }));
ipcMain.handle('app:setSplashEnabled', (_event, enabled: unknown) => {
  if (typeof enabled !== 'boolean') throw new Error('Enabled must be a boolean');
  setSplashEnabled(enabled);
  return { success: true, enabled };
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
