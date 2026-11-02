/**
 * BellePoule Modern - Electron Main Process
 * Licensed under GPL-3.0
 */

import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DatabaseManager } from '../database';
import { AutoUpdater } from './autoUpdater';
import { eventLoopMonitor } from './eventLoopMonitor';
import { fmt, getL, getUiLanguage, setUiLanguage } from './menuLabels';
import { registerDbHandlers } from './ipc/dbHandlers';
import { registerFileHandlers } from './ipc/fileHandlers';
import { createMenuActions } from './menuActions';
import { createMenu } from './menu';
import { registerTrainingHandlers } from './ipc/trainingHandlers';
import { registerRemoteClientsHandlers } from './ipc/remoteClientsHandlers';
import { registerRemoteSettingsHandlers } from './ipc/remoteSettingsHandlers';
import { registerRemoteDisplayHandlers } from './ipc/remoteDisplayHandlers';
import { registerRemoteSessionHandlers } from './ipc/remoteSessionHandlers';
import { registerRemoteMatchHandlers } from './ipc/remoteMatchHandlers';
import { registerRemoteServerHandlers } from './ipc/remoteServerHandlers';
import { previewPdf, registerPdfPreviewHandlers } from './ipc/pdfPreview';
import { registerPrintDialogHandlers } from './ipc/printDialog';
import { registerWebhookHandlers } from './ipc/webhookHandlers';
import { registerThemesHandlers } from './ipc/themesHandlers';
import { registerCryptoHandlers } from './ipc/cryptoHandlers';
import { registerUpdaterHandlers } from './ipc/updaterHandlers';
import { createDiagnosticDeps, registerDiagnosticHandlers } from './ipc/diagnosticHandlers';
import { getVersionInfo } from './versionInfo';
import './ipc/connectors'; // canaux de publication GREG et FTP (#1328, #1331)
import { printHtmlSilently, printHtmlWithSystemDialog } from './printWindows';
import { remoteServers, stopRemoteServer } from './remoteRegistry';
import {
  allowsInlineStyles,
  buildSessionCsp,
  isAllowedExternalUrl,
  isAppUrl,
  isPermissionAllowed,
} from './windowSecurity';
import { assertAuthorizedPath, authorizePath } from './pathAuthorization';

// Database instance
const db = new DatabaseManager();

// Auto updater
let autoUpdater: AutoUpdater | null = null;

// Main window reference
let mainWindow: BrowserWindow | null = null;

// Splash window shown during startup
let splashWindow: BrowserWindow | null = null;
let splashShownAt: number | null = null;
const MIN_SPLASH_MS = 0;

// Language persistence file — read before renderer loads so splash can pre-select
const LANG_FILE = () => path.join(app.getPath('userData'), 'bellepoule-language.json');

function readSavedLanguage(): string {
  try {
    const raw = fs.readFileSync(LANG_FILE(), 'utf-8');
    const parsed = JSON.parse(raw) as { language?: string };
    return parsed.language || 'fr';
  } catch {
    return 'fr';
  }
}

function saveLanguageToFile(lang: string): void {
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
const splashConfirmPromise = new Promise<string>(resolve => {
  splashConfirmResolve = resolve;
});

function createSplashWindow(): void {
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
function closeSplash(onClosed?: () => void): void {
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

// ============================================================================
// Window Creation
// ============================================================================

function createWindow(initialLang?: string): void {
  const versionInfo = getVersionInfo();
  const workArea = screen.getPrimaryDisplay().workAreaSize; // Petits écrans (MacBook Neo 13" ~1204×720) : fenêtre bornée
  mainWindow = new BrowserWindow({
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

// ============================================================================
// IPC Handlers - Database Operations
// ============================================================================

const menuActions = createMenuActions({ db, getMainWindow: () => mainWindow });
const { handleOpenFile, exportCompetitionDialog, setCurrentCompetitionId } = menuActions;
const buildMenu = (language?: string): void =>
  createMenu(
    {
      db,
      getMainWindow: () => mainWindow,
      getAutoUpdater: () => autoUpdater,
      actions: menuActions,
    },
    language
  );

registerDbHandlers({ db, remoteServers, stopRemoteServer });
registerFileHandlers({ db, getMainWindow: () => mainWindow });

// File handlers
ipcMain.handle('file:openDialog', async () => {
  await handleOpenFile();
});

ipcMain.handle('file:exportCompetition', async (_, competitionId: string) => {
  if (!competitionId || typeof competitionId !== 'string') {
    return { success: false, error: 'invalid_competition_id' };
  }
  return exportCompetitionDialog(competitionId);
});

ipcMain.on('app:current-competition', (_, competitionId: unknown) => {
  setCurrentCompetitionId(typeof competitionId === 'string' ? competitionId : null);
});

// Window resize handler
ipcMain.handle(
  'window:setSize',
  (_event, width: number, height: number, options?: { force?: boolean }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const force = options?.force === true;
    // Auto-fit : ne pas écraser une fenêtre maximisée / plein écran choisie par l'utilisateur
    if (!force && (mainWindow.isMaximized() || mainWindow.isFullScreen())) return;
    // Choix explicite (préréglage) : sortir du maximisé / plein écran sinon setSize est ignoré (#1034)
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    // Borner à la zone de travail de l'écran courant (un préréglage XL dépasse souvent l'écran)
    const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
    const [minW, minH] = mainWindow.getMinimumSize();
    const w = Math.round(Math.min(Math.max(width, minW || 800), area.width));
    const h = Math.round(Math.min(Math.max(height, minH || 600), area.height));
    const x = Math.round(area.x + (area.width - w) / 2);
    const y = Math.round(area.y + (area.height - h) / 2);
    mainWindow.setBounds({ x, y, width: w, height: h }, true);
  }
);

// Print handler
ipcMain.handle('window:print', async () => {
  if (mainWindow) {
    await mainWindow.webContents.print({ silent: false, printBackground: true });
  }
});

// Print via hidden BrowserWindow — opens system print dialog on clean HTML
ipcMain.handle('file:printHtml', async (_, html: string, opts?: { preview?: boolean }) => {
  // Aperçu d'abord (#1214) ; l'impression se lance depuis la visionneuse
  if (opts?.preview) return previewPdf(pdfPreviewDeps, html);
  return printHtmlWithSystemDialog(html);
});

// Rendu HTML → buffer PDF via une fenêtre Electron cachée (partagé par export et aperçu)
function renderHtmlToPdfBuffer(
  html: string,
  pdfOptions: Electron.PrintToPDFOptions = {
    printBackground: true,
    landscape: false,
    pageSize: 'A4',
    preferCSSPageSize: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  }
): Promise<Buffer> {
  const tmpFile = path.join(os.tmpdir(), `bp-pdf-${Date.now()}.html`);
  return fs.promises.writeFile(tmpFile, html, 'utf-8').then(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        const pdfWin = new BrowserWindow({
          show: false,
          width: 1200,
          height: 1600,
          webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false },
        });
        pdfWin.setMenu(null);
        pdfWin.loadFile(tmpFile);

        pdfWin.webContents.once('did-finish-load', () => {
          setTimeout(() => {
            pdfWin.webContents
              .printToPDF(pdfOptions)
              .then((data: Buffer) => {
                pdfWin.destroy();
                fs.promises.unlink(tmpFile).catch(() => {});
                resolve(data);
              })
              .catch((err: Error) => {
                pdfWin.destroy();
                fs.promises.unlink(tmpFile).catch(() => {});
                reject(err);
              });
          }, 800);
        });

        pdfWin.webContents.once('did-fail-load', () => {
          pdfWin.destroy();
          fs.promises.unlink(tmpFile).catch(() => {});
          reject(new Error('Chargement HTML échoué'));
        });
      }),
    e => Promise.reject(new Error(`Impossible de créer le fichier temporaire: ${e}`))
  );
}

// PDF generation via hidden BrowserWindow (propre, sans menus d'application)
ipcMain.handle('file:printHtmlToPDF', async (_, html: string, outputPath: string) => {
  try {
    const target = assertAuthorizedPath(outputPath, 'write', ['.pdf']);
    const data = await renderHtmlToPdfBuffer(html);
    await fs.promises.writeFile(target, data);
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// Aperçu avant impression (#1214) : visionneuse PDF interne, repli sur le lecteur externe de l'OS.
const pdfPreviewDeps = registerPdfPreviewHandlers({
  getMainWindow: () => mainWindow,
  render: renderHtmlToPdfBuffer,
  openExternal: p => shell.openPath(p),
});

registerPrintDialogHandlers({
  chooseSavePath: async defaultName => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return undefined;
    authorizePath(result.filePath, 'write');
    return result.filePath;
  },
  writeFile: (filePath, data) =>
    fs.promises.writeFile(assertAuthorizedPath(filePath, 'write', ['.pdf']), data),
  printWithSystemDialog: printHtmlWithSystemDialog,
  listPrinters: async () =>
    (await (mainWindow?.webContents.getPrintersAsync() ?? Promise.resolve([]))).map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: !!(p as { isDefault?: boolean }).isDefault,
    })),
  renderPdf: renderHtmlToPdfBuffer,
  printHtml: printHtmlSilently,
});

// Shell handlers
// Lag de la boucle d'événements du main (#1154) ; `reset` ouvre une nouvelle fenêtre de mesure
ipcMain.handle('perf:getEventLoopDelay', (_, reset?: boolean) =>
  eventLoopMonitor.snapshot(reset === true)
);

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  // N'autoriser que les URLs https:// pour éviter les exploits via des schémas arbitraires
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    console.warn('[shell:openExternal] URL rejetée (schéma non-https):', url);
    return;
  }
  await shell.openExternal(url);
});

registerRemoteServerHandlers({ db, getMainWindow: () => mainWindow });

registerRemoteMatchHandlers();

registerRemoteSessionHandlers();

registerRemoteDisplayHandlers({ getMainWindow: () => mainWindow });

registerWebhookHandlers();
registerThemesHandlers();
registerCryptoHandlers();
registerUpdaterHandlers({ getAutoUpdater: () => autoUpdater });

registerDiagnosticHandlers(createDiagnosticDeps({ getWindow: () => mainWindow, getVersionInfo }));

registerRemoteSettingsHandlers({ db });

registerRemoteClientsHandlers();
registerTrainingHandlers({ db, getMainWindow: () => mainWindow });

// App info handlers
ipcMain.handle('app:getVersionInfo', async () => {
  return getVersionInfo();
});

// Language change handler — rebuild native menu in the new language
ipcMain.on('app:language-changed', (_, lang: string) => {
  setUiLanguage(lang);
  saveLanguageToFile(lang);
  buildMenu(lang);
  for (const { server } of remoteServers.values()) {
    server.setLanguage(lang);
  }
});

// ============================================================================
// App Lifecycle
// ============================================================================

// Lit tous les chunks JS/CSS du renderer en arrière-plan pour les mettre dans
// le cache OS (page cache). Quand Chromium les charge ensuite via loadFile(),
// ils sont déjà en RAM → pas d'accès disque sur le chemin critique.
function prewarmRendererChunks(): void {
  if (process.env.NODE_ENV === 'development') return;
  const rendererDist = path.join(__dirname, '..', 'renderer');
  fs.readdir(rendererDist, (_err, files) => {
    if (!files) return;
    for (const f of files) {
      if (f.endsWith('.js') || f.endsWith('.css')) {
        fs.readFile(path.join(rendererDist, f), () => {});
      }
    }
  });
}

// Rendu logiciel pour VMware/ARM sans GPU — activer via BELLEPOULE_SW_RENDER=1
if (process.platform === 'linux' && process.env.BELLEPOULE_SW_RENDER === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
}

app.whenReady().then(async () => {
  eventLoopMonitor.start();
  // Afficher le splash immédiatement pendant que tout le reste charge
  createSplashWindow();

  // Cache V8 bytecode désactivé : session.setCodeCachePath provoque un crash natif
  // (access violation dans electron.exe) au démarrage sous Windows avec Electron 44.

  prewarmRendererChunks();

  // Initialize database dans un répertoire inscriptible (userData)
  // Sur Windows, process.cwd() peut pointer vers C:\Windows\System32 (non inscriptible)
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'bellepoule.db');

  // Migration : si une BDD existe à l'ancien emplacement mais pas au nouveau, la copier
  const legacyDbPath = path.join(process.cwd(), 'bellepoule.db');
  if (legacyDbPath !== dbPath && fs.existsSync(legacyDbPath) && !fs.existsSync(dbPath)) {
    try {
      if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
      fs.copyFileSync(legacyDbPath, dbPath);
      console.log(`Migration BDD: ${legacyDbPath} -> ${dbPath}`);
    } catch (e) {
      console.error('Échec migration BDD:', e);
    }
  }

  // Attendre que l'utilisateur confirme la langue dans le splash
  const confirmedLang = await splashConfirmPromise;

  // Créer la fenêtre principale avec la langue choisie
  createWindow(confirmedLang);

  await db.open(dbPath);
  console.log('Base de données ouverte:', db.getPath());

  // Signaler au renderer que la DB est prête
  mainWindow?.webContents.send('db:ready');

  // Initialize auto updater — dialog différé après affichage de la fenêtre
  if (mainWindow) {
    autoUpdater = new AutoUpdater(mainWindow, {
      autoDownload: false,
      autoInstall: false,
      checkInterval: 12,
      // Canal figé au packaging (docs/VERSIONING.md) : un build dev suit les pré-releases
      betaChannel: getVersionInfo().channel !== 'stable',
      silent: false,
      installOnQuit: false,
    });

    const win = mainWindow;
    win.once('show', async () => {
      if (!autoUpdater) return;
      if (autoUpdater.hasPendingUpdate()) {
        const pendingInfo = autoUpdater.getPendingUpdateInfo();
        console.log(`[Main] Mise à jour en attente trouvée: v${pendingInfo?.version}`);
        const L = getL();
        const result = await dialog.showMessageBox(win, {
          type: 'info',
          title: L.updPendingTitle,
          message: fmt(L.updPendingMsg, { version: pendingInfo?.version }),
          detail: L.updInstallDetail,
          buttons: [L.updInstallNow, L.updLater],
          defaultId: 0,
          cancelId: 1,
        });
        if (result.response === 0) {
          await autoUpdater.checkAndInstallPendingUpdate();
        }
      }
    });
  }

  // Autosave every 2 minutes
  let autosaveInterval: NodeJS.Timeout | null = null;

  let autosaveInFlight = false;
  const startAutosave = () => {
    if (autosaveInterval) clearInterval(autosaveInterval);
    autosaveInterval = setInterval(
      async () => {
        if (autosaveInFlight) return; // éviter l'empilement si la sauvegarde précédente traîne
        autosaveInFlight = true;
        try {
          await db.saveAsync(); // async I/O — ne bloque pas le main thread
          console.log('Autosave completed at', new Date().toISOString());
          mainWindow?.webContents.send('autosave:completed');
        } catch (error) {
          console.error('Autosave failed:', error);
          mainWindow?.webContents.send('autosave:failed');
        } finally {
          autosaveInFlight = false;
        }
      },
      2 * 60 * 1000
    ); // 2 minutes
  };

  startAutosave();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const shutdownDb = () => {
  if (!db.isOpen()) return;
  db.saveSync();
  db.close();
};

app.on('window-all-closed', () => {
  shutdownDb();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  shutdownDb(); // no-op si déjà fermé
});

// Promesses rejetées non gérées : journaliser sans terminer le processus (#1007)
process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
});

// Handle uncaught exceptions - save before crash
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  try {
    db.saveSync();
  } catch (e) {
    console.error('Failed to save on crash:', e);
  }
  // showMessageBox est asynchrone : showErrorBox bloquerait le processus principal
  // (serveur distant compris) jusqu'au clic de l'opérateur (#993).
  void dialog
    .showMessageBox({
      type: 'error',
      title: getL().errTitle,
      message: fmt(getL().unexpectedError, { error: error.message }),
    })
    .catch(() => undefined);
});
