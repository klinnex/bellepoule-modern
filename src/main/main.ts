/**
 * BellePoule Modern - Electron Main Process
 * Licensed under GPL-3.0
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  safeStorage,
  screen,
  session,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import JSZip from 'jszip';
import { DatabaseManager } from '../database';
import { RemoteScoreServer } from './remoteScoreServer';
import { ensureCert } from './certManager';
import { AutoUpdater } from './autoUpdater';
import type { MatchSignatureRequest } from '../shared/types/remote';
import { eventLoopMonitor } from './eventLoopMonitor';
import { fmt, getL, getUiLanguage, setUiLanguage } from './menuLabels';
import { registerDbHandlers } from './ipc/dbHandlers';
import { registerTrainingHandlers } from './ipc/trainingHandlers';
import { previewPdf, registerPdfPreviewHandlers } from './ipc/pdfPreview';
import { registerPrintDialogHandlers } from './ipc/printDialog';
import { registerWebhookHandlers } from './ipc/webhookHandlers';
import { createDiagnosticDeps, registerDiagnosticHandlers } from './ipc/diagnosticHandlers';
import { getVersionInfo } from './versionInfo';
import { printHtmlSilently, printHtmlWithSystemDialog } from './printWindows';
import { findAvailablePort, remoteServers, stopRemoteServer, usedPorts } from './remoteRegistry';
import { applyActiveWave, setActiveWave } from './remote/activeWave';
import { isAllowedExternalUrl, isAppUrl, isPermissionAllowed } from './windowSecurity';
import {
  assertAuthorizedPath,
  authorizePath,
  checkZipEntries,
  readBoundedFile,
  validateImportedFencers,
} from './pathAuthorization';
import { readImportText } from './xlsxToCsv';

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
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self'; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self' blob:; " +
            "connect-src 'self' http://localhost:* https://api.github.com https://api.ffe.fr; " +
            "frame-ancestors 'none';",
        ],
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
    createMenu(getUiLanguage());

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
// Application Menu
// ============================================================================

function createMenu(language?: string): void {
  if (language) setUiLanguage(language);
  const L = getL();

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: L.file,
      submenu: [
        {
          label: L.newCompetition,
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-competition'),
        },
        {
          label: L.open,
          accelerator: 'CmdOrCtrl+O',
          click: handleOpenFile,
        },
        { type: 'separator' },
        {
          label: L.save,
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            try {
              db.forceSave();
              console.log('Sauvegarde manuelle effectuée');
              mainWindow?.webContents.send('menu:save');
              void saveGlobalBackup();
            } catch (error) {
              console.error('Échec sauvegarde manuelle:', error);
              mainWindow?.webContents.send('autosave:failed');
            }
          },
        },
        {
          label: L.saveAs,
          accelerator: 'CmdOrCtrl+Shift+S',
          click: handleSaveAs,
        },
        { type: 'separator' },
        {
          label: L.export,
          submenu: [
            { label: L.exportXml, click: () => handleExport('xml') },
            { label: L.exportCsv, click: () => handleExport('csv') },
            { label: L.exportPdf, click: () => handleExport('pdf') },
            { type: 'separator' },
            { label: L.exportFencersTxt, click: () => handleExport('fencers-txt') },
            { label: L.exportFencersFff, click: () => handleExport('fencers-fff') },
            { label: L.exportFencersBpf, click: () => handleExport('fencers-bpf') },
            { label: L.exportPhotos, click: () => handleExport('photos') },
          ],
        },
        {
          label: L.import,
          submenu: [
            { label: L.importXml, click: () => handleImport('xml') },
            { label: L.importFff, click: () => handleImport('fff') },
            { label: L.importRanking, click: () => handleImport('ranking') },
            { label: L.importFencersBpf, click: () => handleImport('fencers-bpf') },
          ],
        },
        { type: 'separator' },
        {
          label: L.settings,
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('menu:open-settings'),
        },
        { type: 'separator' },
        {
          label: L.quit,
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: L.edit,
      submenu: [
        { role: 'undo', label: L.undo },
        { role: 'redo', label: L.redo },
        { type: 'separator' },
        { role: 'cut', label: L.cut },
        { role: 'copy', label: L.copy },
        { role: 'paste', label: L.paste },
        { role: 'selectAll', label: L.selectAll },
      ],
    },
    {
      label: L.competition,
      submenu: [
        {
          label: L.properties,
          click: () => mainWindow?.webContents.send('menu:competition-properties'),
        },
        { type: 'separator' },
        {
          label: L.addFencer,
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send('menu:add-fencer'),
        },
        {
          label: L.addReferee,
          click: () => mainWindow?.webContents.send('menu:add-referee'),
        },
        { type: 'separator' },
        {
          label: L.startRemote,
          click: () => startRemoteScoreServer(),
        },
        {
          label: L.stopRemote,
          click: () => stopRemoteScoreServer(),
        },
        { type: 'separator' },
        {
          label: L.nextPhase,
          accelerator: 'CmdOrCtrl+Right',
          click: () => mainWindow?.webContents.send('menu:next-phase'),
        },
      ],
    },
    {
      label: L.view,
      submenu: [
        { role: 'reload', label: L.reload },
        { role: 'forceReload', label: L.forceReload },
        { role: 'toggleDevTools', label: L.devTools },
        { type: 'separator' },
        { role: 'resetZoom', label: L.resetZoom },
        { role: 'zoomIn', label: L.zoomIn },
        { role: 'zoomOut', label: L.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: L.fullscreen },
      ],
    },
    {
      label: L.help,
      submenu: [
        {
          label: L.about,
          accelerator: 'F1',
          click: showAbout,
        },
        {
          label: L.updates,
          click: async () => {
            if (autoUpdater) {
              await autoUpdater.showUpdateDialog();
            } else {
              dialog.showMessageBox(mainWindow!, {
                type: 'warning',
                title: L.updatesTitle,
                message: L.updatesUnavailable,
                buttons: ['OK'],
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: L.docs,
          click: () => {
            shell.openExternal('https://github.com/klinnex/bellepoule-modern/wiki');
          },
        },
        {
          label: L.reportBug,
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            mainWindow?.webContents.send('menu:report-issue');
          },
        },
        { type: 'separator' },
        {
          label: 'GitHub',
          click: () => {
            shell.openExternal('https://github.com/klinnex/bellepoule-modern');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================================
// Remote Score Server
// ============================================================================

function startRemoteScoreServer(): void {
  const L = getL();
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: L.remoteTitle,
    message: L.remoteUsePanel,
    buttons: ['OK'],
  });
}

function stopRemoteScoreServer(): void {
  startRemoteScoreServer();
}

// ============================================================================
// File Handlers
// ============================================================================

async function handleOpenFile(): Promise<void> {
  const L = getL();
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: L.openTitle,
    filters: [
      { name: L.filterBpm, extensions: ['bpm', 'db'] },
      { name: L.filterClassic, extensions: ['cotcot', 'cocot'] },
      { name: L.filterAll, extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filepath = result.filePaths[0];
    try {
      if (/\.(cotcot|cocot)$/i.test(filepath)) {
        // Fichier BellePoule classique : import XML dans la compétition ouverte
        const content = await readImportText(filepath);
        mainWindow?.webContents.send('menu:import', 'xml', filepath, content);
        return;
      }
      // Fusion dans la base active, état d'avancement compris (#1117)
      const ids = await db.mergeFromFile(filepath);
      mainWindow?.webContents.send('file:opened', filepath, ids);
    } catch (error) {
      dialog.showErrorBox(L.errTitle, `${L.openErr} ${error}`);
    }
  }
}

// Compétition affichée dans le renderer : « Enregistrer sous » l'exporte seule (#1117)
let currentCompetitionId: string | null = null;

/** Nom de fichier sûr tiré du titre de la compétition */
function competitionFileName(title: string | undefined): string {
  const base = (title ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${base || 'competition'}.bpm`;
}

async function exportCompetitionDialog(
  competitionId: string
): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> {
  const L = getL();
  const competition = db.getCompetition(competitionId);
  if (!competition) return { success: false, error: 'competition_not_found' };
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: L.saveTitle,
    defaultPath: competitionFileName(competition.title),
    filters: [{ name: L.filterBpm, extensions: ['bpm'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  try {
    await db.exportCompetitionToFile(competitionId, result.filePath);
    mainWindow?.webContents.send('file:saved', result.filePath);
    return { success: true, path: result.filePath };
  } catch (error) {
    dialog.showErrorBox(L.errTitle, `${L.saveErr} ${error}`);
    return { success: false, error: String(error) };
  }
}

// Dernier fichier .bpm global (toutes compétitions) de la session : cible de Ctrl+S (#1140)
let sessionBackupPath: string | null = null;

/** Écrit le fichier global mémorisé, sinon demande l'emplacement (« Enregistrer sous » global) */
async function saveGlobalBackup(): Promise<void> {
  if (sessionBackupPath && fs.existsSync(path.dirname(sessionBackupPath))) {
    try {
      await db.exportToFile(sessionBackupPath);
      mainWindow?.webContents.send('file:saved', sessionBackupPath);
      return;
    } catch {
      // Écriture impossible : repli sur « Enregistrer sous » ci-dessous
    }
  }
  await saveGlobalAs();
}

async function saveGlobalAs(): Promise<void> {
  const L = getL();
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: L.saveTitle,
    defaultPath: sessionBackupPath ?? 'competition.bpm',
    filters: [{ name: L.filterBpm, extensions: ['bpm'] }],
  });
  if (result.canceled || !result.filePath) return;
  try {
    await db.exportToFile(result.filePath);
    sessionBackupPath = result.filePath;
    mainWindow?.webContents.send('file:saved', result.filePath);
  } catch (error) {
    dialog.showErrorBox(L.errTitle, `${L.saveErr} ${error}`);
  }
}

async function handleSaveAs(): Promise<void> {
  if (currentCompetitionId && db.getCompetition(currentCompetitionId)) {
    await exportCompetitionDialog(currentCompetitionId);
    return;
  }
  await saveGlobalAs();
}

async function handleExport(format: string): Promise<void> {
  mainWindow?.webContents.send('menu:export', format);
}

async function handleImport(format: string): Promise<void> {
  const L = getL();
  let filters: Electron.FileFilter[];
  let title = L.importTitle;

  switch (format) {
    case 'xml':
      title = L.importXmlTitle;
      filters = [{ name: L.filterXmlBP, extensions: ['xml', 'cotcot'] }];
      break;
    case 'fff':
      title = L.importFffTitle;
      filters = [{ name: L.filterFfe, extensions: ['fff', 'csv', 'txt'] }];
      break;
    case 'ranking':
      title = L.importRankingTitle;
      filters = [{ name: L.filterRanking, extensions: ['fff', 'csv', 'txt', 'xlsx'] }];
      break;
    case 'fencers-bpf':
      title = L.importBpfTitle;
      filters = [{ name: 'BellePoule Fencers', extensions: ['bpf'] }];
      break;
    default:
      filters = [{ name: L.filterAll, extensions: ['*'] }];
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    title,
    filters,
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filepath = result.filePaths[0];
    try {
      if (format === 'fencers-bpf') {
        // Fichier binaire : envoyer uniquement le chemin, le renderer appellera importFencersArchive
        authorizePath(filepath, 'read');
        mainWindow?.webContents.send('menu:import', format, filepath, '');
      } else {
        const content = await readImportText(filepath);
        mainWindow?.webContents.send('menu:import', format, filepath, content);
      }
    } catch (error) {
      dialog.showErrorBox(L.importErrTitle, `${L.importReadErr} ${error}`);
    }
  }
}

function showAbout(): void {
  mainWindow?.webContents.send('menu:show-about');
}

// ============================================================================
// IPC Handlers - Database Operations
// ============================================================================

registerDbHandlers({ db, remoteServers, stopRemoteServer });

// File handlers
ipcMain.handle('file:export', async (_, filepath) => {
  await db.exportToFile(assertAuthorizedPath(filepath, 'write'));
});

ipcMain.handle('file:import', async (_, filepath) => {
  await db.importFromFile(assertAuthorizedPath(filepath, 'read'));
});

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
  currentCompetitionId = typeof competitionId === 'string' ? competitionId : null;
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
ipcMain.handle('file:exportFencersArchive', async (_, competitionId: string, filepath: string) => {
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
});

// Fencer archive (.bpf) import handler
ipcMain.handle('file:importFencersArchive', async (_, competitionId: string, filepath: string) => {
  filepath = assertAuthorizedPath(filepath, 'read', ['.bpf']);
  const buffer = await readBoundedFile(filepath);
  const zip = await JSZip.loadAsync(buffer);
  checkZipEntries(zip);
  const fencersFile = zip.file('fencers.json');
  if (!fencersFile) throw new Error('Format .bpf invalide : fencers.json manquant');
  const fencers = validateImportedFencers(JSON.parse(await fencersFile.async('string')));
  return db.upsertFencersByLicense(competitionId, fencers);
});

// Dialog handlers
ipcMain.handle('dialog:openFile', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, options);

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    authorizePath(filePath, 'read');
    try {
      const content = await readImportText(filePath);
      return { filePath, content };
    } catch (error) {
      console.error('Error reading file:', error);
      return { filePath, content: '' };
    }
  }

  return null;
});

ipcMain.handle('dialog:saveFile', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow!, options);
  if (!result.canceled && result.filePath) authorizePath(result.filePath, 'write');
  return result;
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

// Remote score server handlers
ipcMain.handle('remote:getNetworkInterfaces', async () => {
  const ifaces = os.networkInterfaces();
  const result: { name: string; address: string }[] = [
    { name: 'Toutes les interfaces', address: '0.0.0.0' },
  ];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const iface of addrs || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        result.push({ name: `${name} (${iface.address})`, address: iface.address });
      }
    }
  }
  return { success: true, interfaces: result };
});

ipcMain.handle(
  'remote:startServer',
  async (_event, competitionId: string, port?: number, host?: string, useHttps?: boolean) => {
    try {
      if (remoteServers.has(competitionId)) {
        return { success: false, error: 'remote_already_started' };
      }

      const effectivePort = findAvailablePort(port);
      const effectiveHost = host ?? '0.0.0.0';

      let tlsOptions: { cert: string; key: string } | undefined;
      let certFingerprint: string | undefined;
      if (useHttps) {
        try {
          const bundle = await ensureCert(app.getPath('userData'));
          tlsOptions = { cert: bundle.cert, key: bundle.key };
          certFingerprint = bundle.fingerprint;
        } catch (certError) {
          console.error('Erreur génération certificat TLS:', certError);
          return { success: false, error: 'tls_cert_failed' };
        }
      }

      const server = new RemoteScoreServer(db, effectivePort, effectiveHost, tlsOptions);
      try {
        await server.start();
      } catch (startError: any) {
        console.error('Error binding remote server port:', startError);
        return { success: false, error: startError?.message ?? 'Port indisponible' };
      }
      applyActiveWave(competitionId, server);
      remoteServers.set(competitionId, {
        server,
        port: effectivePort,
        host: effectiveHost,
        useHttps: !!useHttps,
        certFingerprint,
      });
      usedPorts.add(effectivePort);

      // Appliquer la config TTS persistée aux tablettes de ce nouveau serveur
      try {
        const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
        server.setTtsConfig(JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8')));
      } catch {
        /* config TTS optionnelle */
      }

      (global as any).mainWindow = mainWindow;

      return {
        success: true,
        serverInfo: {
          url: server.getServerUrl(),
          ip: server.getLocalIPAddress(),
          port: effectivePort,
          useHttps: !!useHttps,
          certFingerprint,
        },
      };
    } catch (error) {
      console.error('Error starting remote server:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle('remote:stopServer', async (_event, competitionId: string) => {
  try {
    if (!stopRemoteServer(competitionId)) {
      return { success: false, error: 'remote_not_started' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error stopping remote server:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getServerInfo', async (_event, competitionId: string) => {
  const entry = remoteServers.get(competitionId);
  if (!entry) {
    return { success: false, error: 'remote_not_started' };
  }

  return {
    success: true,
    serverInfo: {
      url: entry.server.getServerUrl(),
      ip: entry.server.getLocalIPAddress(),
      port: entry.port,
      useHttps: entry.useHttps,
      certFingerprint: entry.certFingerprint,
    },
  };
});

ipcMain.handle('remote:getCertFingerprint', async () => {
  try {
    const bundle = await ensureCert(app.getPath('userData'));
    return { success: true, fingerprint: bundle.fingerprint };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

// Remote session handlers
ipcMain.handle(
  'remote:startSession',
  async (
    _,
    competitionId: string,
    strips: number,
    matches?: any[],
    showPhotos?: boolean,
    kioskViews?: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean },
    cardAnnounce?: boolean
  ) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }

      const session = await entry.server.startSession(
        competitionId,
        strips,
        matches,
        showPhotos,
        kioskViews,
        cardAnnounce
      );
      return { success: true, session };
    } catch (error) {
      console.error('Error starting session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateMatchArena',
  async (
    _,
    competitionId: string,
    matchId: string,
    fromArena: number | null,
    toArena: number | null,
    fencerA?: any,
    fencerB?: any
  ) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.updateMatchArena(matchId, fromArena, toArena, fencerA, fencerB);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

ipcMain.handle(
  'remote:updatePoolFencers',
  async (_, competitionId: string, updates: Array<{ poolId: string; fencers: any[] }>) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.updatePoolFencers(updates);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

ipcMain.handle(
  'remote:setActiveWave',
  async (_, competitionId: string, matchIds: string[] | null, poolsClosed?: boolean) => {
    setActiveWave(competitionId, matchIds, poolsClosed);
    return { success: true };
  }
);

ipcMain.handle(
  'remote:syncPoolMatches',
  async (_, competitionId: string, poolsData: Array<{ poolId: string; matches: any[] }>) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.syncPoolMatches(poolsData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

ipcMain.handle('remote:assignPools', async (_, competitionId: string, poolsData: any[]) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.assignPools(poolsData);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('remote:refreshDeMatches', async (_, competitionId: string, matches: any[]) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.refreshDeMatches(matches);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('remote:resetPoolMatch', async (_, competitionId: string, matchId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: true };
    entry.server.resetPoolMatch(matchId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle(
  'remote:finishPoolMatch',
  async (_, competitionId: string, ...args: Parameters<RemoteScoreServer['finishPoolMatch']>) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: true };
      entry.server.finishPoolMatch(...args);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

// Format arène Sabre Laser équipe : assigne/retire une rencontre d'équipe sur
// une arène pour saisie temps réel (tablette arbitre + affichage arène).
ipcMain.handle(
  'remote:setTeamArenaMatch',
  async (_, competitionId: string, arenaId: string, matchId: string, isLaserPoints: boolean) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'remote_not_started' };
      const ok = entry.server.setTeamArenaMatch(arenaId, matchId, isLaserPoints);
      return ok ? { success: true } : { success: false, error: 'match_not_found' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

ipcMain.handle('remote:clearTeamArenaMatch', async (_, competitionId: string, arenaId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: true };
    entry.server.clearTeamArenaMatch(arenaId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('remote:stopSession', async (_event, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }

    entry.server.stopSession();
    return { success: true };
  } catch (error) {
    console.error('Error stopping session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:launchCompetition', async (_event, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }

    entry.server.launchCompetition();
    return { success: true };
  } catch (error) {
    console.error('Error launching competition:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getSession', async (_event, competitionId: string) => {
  const entry = remoteServers.get(competitionId);
  if (!entry) {
    return { success: false, error: 'remote_not_started' };
  }

  return { success: true, session: entry.server.getSession() };
});

ipcMain.handle('remote:getArenas', async (_event, competitionId: string) => {
  const entry = remoteServers.get(competitionId);
  if (!entry) {
    return { success: false, error: 'remote_not_started' };
  }

  return { success: true, arenas: entry.server.getAllArenas() };
});

ipcMain.handle('remote:updateStripCount', async (_, competitionId: string, newCount: number) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }

    const session = entry.server.updateStripCount(newCount);
    return { success: true, session };
  } catch (error) {
    console.error('Error updating strip count:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:updateShowPhotos', async (_, competitionId: string, value: boolean) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }
    entry.server.updateShowPhotos(value);
    return { success: true };
  } catch (error) {
    console.error('Error updating showPhotos:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:updateCardAnnounce', async (_, competitionId: string, value: boolean) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }
    entry.server.updateCardAnnounce(value);
    return { success: true };
  } catch (error) {
    console.error('Error updating cardAnnounce:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:updateTheme', async (_, competitionId: string, theme: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }
    entry.server.updateTheme(theme as any);
    return { success: true };
  } catch (error) {
    console.error('Error updating theme:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle(
  'remote:updateArenaTheme',
  async (_, competitionId: string, arenaId: string, theme: string, customTheme?: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.updateArenaTheme(arenaId, theme as any, customTheme);
      return { success: true };
    } catch (error) {
      console.error('Error updating arena theme:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:clearArenaThemeOverride',
  async (_, competitionId: string, arenaId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry)
        return {
          success: false,
          error: 'remote_not_started',
        };
      entry.server.clearArenaThemeOverride(arenaId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateKioskViews',
  async (
    _,
    competitionId: string,
    views: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean }
  ) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.updateKioskViews(views);
      return { success: true };
    } catch (error) {
      console.error('Error updating kioskViews:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateKioskTheme',
  async (_, competitionId: string, variables: Record<string, string>) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.updateKioskTheme(variables);
      return { success: true };
    } catch (error) {
      console.error('Error updating kiosk theme:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateArenaScreenTheme',
  async (_, competitionId: string, arenaId: string, targetType: string, customTheme?: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.updateArenaScreenTheme(arenaId, targetType as any, customTheme);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

// ── Bibliothèque de thèmes (persistante dans userData) ──────────────────────

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

ipcMain.handle(
  'remote:setArenaPassword',
  async (_, competitionId: string, arenaId: string, password: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return {
          success: false,
          error: 'remote_not_started',
        };
      }
      entry.server.setArenaPassword(arenaId, password);
      return { success: true };
    } catch (error) {
      console.error('Error setting arena password:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle('remote:setOrgNote', async (_, competitionId: string, note: any) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }
    entry.server.setOrgNote(note);
    mainWindow?.webContents.send('kiosk:note', note);
    return { success: true };
  } catch (error) {
    console.error('Error setting org note:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:clearOrgNote', async (_event, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return {
        success: false,
        error: 'remote_not_started',
      };
    }
    entry.server.clearOrgNote();
    mainWindow?.webContents.send('kiosk:note', null);
    return { success: true };
  } catch (error) {
    console.error('Error clearing org note:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:acknowledgeDTCall', async (_, competitionId: string, arenaId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.acknowledgeDTCall(arenaId);
    return { success: true };
  } catch (error) {
    console.error('Error acknowledging DT call:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle(
  'remote:requestMatchSignature',
  async (_, competitionId: string, arenaId: string, request: MatchSignatureRequest) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      if (!entry.server.requestMatchSignature(arenaId, request)) {
        return { success: false, error: 'strip_not_found' };
      }
      return { success: true };
    } catch (error) {
      console.error('Error requesting match signature:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

registerWebhookHandlers();

registerDiagnosticHandlers(createDiagnosticDeps({ getWindow: () => mainWindow, getVersionInfo }));

ipcMain.handle('remote:updateLogo', async (_, logo: string | null) => {
  try {
    const logoPath = path.join(app.getPath('userData'), 'logo.dat');
    if (logo) {
      await fs.promises.writeFile(logoPath, logo, 'utf-8');
    } else {
      try {
        fs.unlinkSync(logoPath);
      } catch {
        /* déjà absent */
      }
    }
    for (const { server } of remoteServers.values()) {
      server.setLogo(logo);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle(
  'remote:setWallpaper',
  async (_, competitionId: string, wallpaper: string | null) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false };
      entry.server.setWallpaper(wallpaper);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle('remote:changePort', async (_, competitionId: string, newPort: number) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'remote_not_started' };
    }
    if (usedPorts.has(newPort) && newPort !== entry.port) {
      return { success: false, error: 'port_in_use', port: newPort };
    }
    const { host, useHttps, certFingerprint } = entry;
    let tlsOptions: { cert: string; key: string } | undefined;
    if (useHttps && certFingerprint) {
      try {
        const bundle = await ensureCert(app.getPath('userData'));
        tlsOptions = { cert: bundle.cert, key: bundle.key };
      } catch {
        /* ignore — redémarre en HTTP si cert inaccessible */
      }
    }
    entry.server.stop();
    usedPorts.delete(entry.port);
    const server = new RemoteScoreServer(db, newPort, host, tlsOptions);
    server.start();
    applyActiveWave(competitionId, server);
    remoteServers.set(competitionId, {
      server,
      port: newPort,
      host,
      useHttps: !!tlsOptions,
      certFingerprint,
    });
    usedPorts.add(newPort);
    return {
      success: true,
      serverInfo: {
        url: server.getServerUrl(),
        ip: server.getLocalIPAddress(),
        port: newPort,
        useHttps: !!tlsOptions,
        certFingerprint,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle(
  'remote:setRegistrationEnabled',
  async (_, competitionId: string, enabled: boolean) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.setRegistrationEnabled(enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle('remote:setCheckinEnabled', async (_, competitionId: string, enabled: boolean) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.setCheckinEnabled(enabled);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setCheckinPassword', async (_, competitionId: string, password: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.setCheckinPassword(typeof password === 'string' ? password : '');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

// Espace formateurs : commentaires d'arbitrage (#989)
ipcMain.handle('remote:setTrainerEnabled', async (_, competitionId: string, enabled: boolean) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.setTrainerEnabled(!!enabled);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setTrainerPassword', async (_, competitionId: string, password: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.setTrainerPassword(typeof password === 'string' ? password : '');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getConnectedClients', async (_, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    return { success: true, clients: entry?.server.getConnectedClients() ?? [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      clients: [],
    };
  }
});

ipcMain.handle(
  'remote:sendClientCommand',
  async (_, competitionId: string, socketId: string, command: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.sendClientCommand(socketId, command);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle('remote:broadcastCommand', async (_, competitionId: string, command: any) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.broadcastCommand(command);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle(
  'remote:renameClient',
  async (_, competitionId: string, socketId: string, label: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.renameClient(socketId, label);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle('remote:identifyClient', async (_, competitionId: string, socketId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'server_not_started' };
    entry.server.identifyClient(socketId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle(
  'remote:setClientKioskMode',
  async (_, competitionId: string, socketId: string, config: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.setClientKioskMode(socketId, config);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle('remote:setTtsConfig', async (_, config: unknown) => {
  try {
    const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
    await fs.promises.writeFile(ttsPath, JSON.stringify(config), 'utf-8');
    for (const { server } of remoteServers.values()) {
      server.setTtsConfig(config as any);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

registerTrainingHandlers({ db, getMainWindow: () => mainWindow });

ipcMain.handle('app:getTtsConfig', async () => {
  const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
  try {
    return JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8'));
  } catch {
    return null;
  }
});

ipcMain.handle('app:getLogo', async () => {
  const logoPath = path.join(app.getPath('userData'), 'logo.dat');
  try {
    return await fs.promises.readFile(logoPath, 'utf-8');
  } catch {
    return null;
  }
});

// App info handlers
ipcMain.handle('app:getVersionInfo', async () => {
  return getVersionInfo();
});

// Language change handler — rebuild native menu in the new language
ipcMain.on('app:language-changed', (_, lang: string) => {
  setUiLanguage(lang);
  saveLanguageToFile(lang);
  createMenu(lang);
  for (const { server } of remoteServers.values()) {
    server.setLanguage(lang);
  }
});

// AutoUpdater handlers
ipcMain.handle('updater:check', async () => {
  if (autoUpdater) {
    return await autoUpdater.checkForUpdates();
  }
  return null;
});

ipcMain.handle('updater:setSilentMode', async (_, enabled: boolean) => {
  if (autoUpdater) {
    autoUpdater.setSilentMode(enabled);
    return { success: true, silent: enabled };
  }
  return { success: false, error: 'updater_unavailable' };
});

ipcMain.handle('updater:getSilentMode', async () => {
  if (autoUpdater) {
    return { silent: autoUpdater.isSilentMode() };
  }
  return { silent: false };
});

ipcMain.handle('updater:hasPendingUpdate', async () => {
  if (autoUpdater) {
    return { hasPending: autoUpdater.hasPendingUpdate() };
  }
  return { hasPending: false };
});

ipcMain.handle('updater:getPendingUpdateInfo', async () => {
  if (autoUpdater) {
    return autoUpdater.getPendingUpdateInfo();
  }
  return null;
});

ipcMain.handle('updater:installPendingUpdate', async () => {
  if (autoUpdater) {
    await autoUpdater.checkAndInstallPendingUpdate();
    return { success: true };
  }
  return { success: false, error: 'updater_unavailable' };
});

// ============================================================================
// safeStorage : chiffrement OS (Keychain/DPAPI/libsecret) pour secrets locaux
// (ex. clé de synchronisation cloud). Renvoie une chaîne base64.
// ============================================================================
ipcMain.handle('crypto:isAvailable', async () => {
  return safeStorage.isEncryptionAvailable();
});

ipcMain.handle('crypto:protect', async (_, plaintext: string) => {
  if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(plaintext).toString('base64');
});

ipcMain.handle('crypto:unprotect', async (_, ciphertextB64: string) => {
  if (typeof ciphertextB64 !== 'string') throw new Error('ciphertext must be a string');
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(ciphertextB64, 'base64'));
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
