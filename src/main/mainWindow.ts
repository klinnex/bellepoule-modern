/**
 * BellePoule Modern - Création de la fenêtre principale (sécurité #1148, CSP #1343, rechargement
 * après crash, menu natif au chargement) — extraite de main.ts, #1341.
 * Licensed under GPL-3.0
 */
import { app, BrowserWindow, shell, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getUiLanguage, setUiLanguage } from './menuLabels';
import { closeSplash } from './splash';
import { getVersionInfo } from './versionInfo';
import {
  allowsInlineStyles,
  buildSessionCsp,
  isAllowedExternalUrl,
  isAppUrl,
  isPermissionAllowed,
} from './windowSecurity';

export interface MainWindowContext {
  initialLang?: string;
  /** Publie (ou retire) la référence de la fenêtre principale pour le reste du main process */
  setMainWindow(win: BrowserWindow | null): void;
  buildMenu(language?: string): void;
}

export function createMainWindow({
  initialLang,
  setMainWindow,
  buildMenu,
}: MainWindowContext): void {
  const versionInfo = getVersionInfo();
  const workArea = screen.getPrimaryDisplay().workAreaSize; // Petits écrans (MacBook Neo 13" ~1204×720) : fenêtre bornée
  let mainWindow: BrowserWindow | null = new BrowserWindow({
    width: Math.min(1400, workArea.width),
    height: Math.min(900, workArea.height),
    minWidth: Math.min(1024, workArea.width),
    minHeight: Math.min(768, workArea.height),
    show: false,
    backgroundColor: '#f3f4f6',
    title: `BellePoule Modern v${versionInfo.version} (Build #${versionInfo.build})`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      v8CacheOptions: 'code',
      additionalArguments: initialLang ? [`--initial-lang=${initialLang}`] : [],
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
  });

  setMainWindow(mainWindow);

  const showFallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      closeSplash(() => mainWindow?.show());
    }
  }, 10000);
  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallback);
    closeSplash(() => mainWindow?.show());
  });

  // Sécurité (#1148) : ni navigation ni fenêtre hors de l'application
  const isDev = process.env.NODE_ENV === 'development';
  const appUrlOpts = { dev: isDev, rendererDir: path.join(__dirname, '../renderer') };
  const isApp = (url: string) => isAppUrl(url, appUrlOpts);
  const wc = mainWindow.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const blockNavigation = (event: Electron.Event, url: string) => {
    if (isApp(url)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  };
  wc.on('will-navigate', blockNavigation);
  wc.on('will-redirect', blockNavigation);
  wc.on('will-attach-webview', event => event.preventDefault());

  // Caméra (photo tireur) : application uniquement, vidéo seulement, jamais le micro
  const session = wc.session;
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = details.requestingUrl || contents.getURL();
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes;
    callback(isPermissionAllowed(permission, url, isApp, mediaTypes));
  });
  session.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin || contents?.getURL() || '', isApp)
  );

  // Security: Set CSP headers for all requests
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Fenêtre principale : style-src strict ; impression / PDF : 'unsafe-inline' (#1343)
    const inline = allowsInlineStyles(details.webContentsId, mainWindow?.webContents.id);
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildSessionCsp(inline)],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
      },
    });
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:8066');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    setMainWindow(null);
  });

  // Reload renderer when it crashes (blank screen symptom)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    closeSplash();
    console.error('[Main] Renderer process gone:', details.reason, details.exitCode);
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (process.env.NODE_ENV === 'development') {
            mainWindow.loadURL('http://localhost:8066');
          } else {
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
          }
        }
      }, 500);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Main] Renderer became unresponsive');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('[Main] Renderer became responsive again');
  });

  // Create application menu using saved language preference
  mainWindow.webContents.once('did-finish-load', async () => {
    if (initialLang) {
      setUiLanguage(initialLang);
    } else {
      try {
        const savedLang = await mainWindow!.webContents.executeJavaScript(
          'localStorage.getItem("bellepoule-language")'
        );
        if (savedLang && typeof savedLang === 'string') {
          setUiLanguage(savedLang);
        }
      } catch {
        // ignore
      }
    }
    buildMenu(getUiLanguage());

    // Restore persisted logo and sync to renderer localStorage if not already set
    const logoPath = path.join(app.getPath('userData'), 'logo.dat');
    fs.promises
      .readFile(logoPath, 'utf-8')
      .then(logo => {
        if (logo) mainWindow?.webContents.send('app:logoLoaded', logo);
      })
      .catch(() => {
        /* logo optionnel */
      });
  });
}
