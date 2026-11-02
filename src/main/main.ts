/**
 * BellePoule Modern - Electron Main Process
 * Licensed under GPL-3.0
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseManager } from '../database';
import { AutoUpdater } from './autoUpdater';
import { eventLoopMonitor } from './eventLoopMonitor';
import { fmt, getL, setUiLanguage } from './menuLabels';
import { registerDbHandlers } from './ipc/dbHandlers';
import { registerFileHandlers } from './ipc/fileHandlers';
import { registerWindowPrintHandlers } from './ipc/windowPrintHandlers';
import { createMenuActions } from './menuActions';
import { createMenu } from './menu';
import { createMainWindow } from './mainWindow';
import { createSplashWindow, saveLanguageToFile, splashConfirmPromise } from './splash';
import { registerTrainingHandlers } from './ipc/trainingHandlers';
import { registerRemoteClientsHandlers } from './ipc/remoteClientsHandlers';
import { registerRemoteSettingsHandlers } from './ipc/remoteSettingsHandlers';
import { registerRemoteDisplayHandlers } from './ipc/remoteDisplayHandlers';
import { registerRemoteSessionHandlers } from './ipc/remoteSessionHandlers';
import { registerRemoteMatchHandlers } from './ipc/remoteMatchHandlers';
import { registerRemoteServerHandlers } from './ipc/remoteServerHandlers';
import { registerWebhookHandlers } from './ipc/webhookHandlers';
import { registerThemesHandlers } from './ipc/themesHandlers';
import { registerCryptoHandlers } from './ipc/cryptoHandlers';
import { registerUpdaterHandlers } from './ipc/updaterHandlers';
import { createDiagnosticDeps, registerDiagnosticHandlers } from './ipc/diagnosticHandlers';
import { getVersionInfo } from './versionInfo';
import './ipc/connectors'; // canaux de publication GREG et FTP (#1328, #1331)
import { remoteServers, stopRemoteServer } from './remoteRegistry';

// Database instance
const db = new DatabaseManager();

// Auto updater
let autoUpdater: AutoUpdater | null = null;

// Main window reference
let mainWindow: BrowserWindow | null = null;

// ============================================================================
// IPC Handlers - Database Operations
// ============================================================================

const createWindow = (initialLang?: string): void =>
  createMainWindow({
    initialLang,
    setMainWindow: win => {
      mainWindow = win;
    },
    buildMenu: lang => buildMenu(lang),
  });

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

registerWindowPrintHandlers({ getMainWindow: () => mainWindow });

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
