/**
 * BellePoule Modern - Electron Main Process
 * Licensed under GPL-3.0
 */

import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseManager } from '../database';
import { RemoteScoreServer } from './remoteScoreServer';
import { AutoUpdater } from './autoUpdater';
import { Competition, Fencer, FencerStatus, Match, MatchStatus, Pool } from '../shared/types';

// Database instance
const db = new DatabaseManager();

// Remote score server
let remoteScoreServer: any = null;

// Auto updater
let autoUpdater: AutoUpdater | null = null;

// Main window reference
let mainWindow: BrowserWindow | null = null;

// ============================================================================
// Version Information
// ============================================================================

function getVersionInfo(): { version: string; build: number; date: string } {
  try {
    const versionPaths = [
      path.join(app.getAppPath(), 'version.json'),
      path.join(app.getAppPath(), '..', 'version.json'),
      path.join(__dirname, '..', '..', 'version.json'),
      path.join(process.cwd(), 'version.json'),
    ];

    for (const versionPath of versionPaths) {
      if (fs.existsSync(versionPath)) {
        const content = fs.readFileSync(versionPath, 'utf-8');
        return JSON.parse(content);
      }
    }
  } catch (e) {
    console.error('Failed to read version.json:', e);
  }

  // Fallback: lire depuis package.json
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const match = pkg.version.match(/(\d+\.\d+\.\d+)(?:-build\.(\d+))?/);
      if (match) {
        return {
          version: match[1],
          build: parseInt(match[2]) || 0,
          date: new Date().toISOString(),
        };
      }
    }
  } catch (e) {
    console.error('Failed to read package.json:', e);
  }

  return { version: '1.0.0', build: 0, date: 'Unknown' };
}

// ============================================================================
// Window Creation
// ============================================================================

function createWindow(): void {
  const versionInfo = getVersionInfo();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: `BellePoule Modern v${versionInfo.version} (Build #${versionInfo.build})`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
  });

  // Security: Set CSP headers for all requests
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://cdn.socket.io; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "img-src 'self' data: blob:; " +
            "connect-src 'self' http://localhost:* https://api.github.com; " +
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
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
}

// ============================================================================
// Application Menu
// ============================================================================

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouvelle compétition',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-competition'),
        },
        {
          label: 'Ouvrir...',
          accelerator: 'CmdOrCtrl+O',
          click: handleOpenFile,
        },
        { type: 'separator' },
        {
          label: 'Enregistrer',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            try {
              db.forceSave();
              console.log('Sauvegarde manuelle effectuée');
              mainWindow?.webContents.send('menu:save');
            } catch (error) {
              console.error('Échec sauvegarde manuelle:', error);
              mainWindow?.webContents.send('autosave:failed');
            }
          },
        },
        {
          label: 'Enregistrer sous...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: handleSaveAs,
        },
        { type: 'separator' },
        {
          label: 'Exporter',
          submenu: [
            { label: 'Exporter en XML (BellePoule)', click: () => handleExport('xml') },
            { label: 'Exporter en CSV', click: () => handleExport('csv') },
            { label: 'Exporter en PDF', click: () => handleExport('pdf') },
            { type: 'separator' },
            { label: 'Exporter tireurs (.txt)', click: () => handleExport('fencers-txt') },
            { label: 'Exporter tireurs (.fff)', click: () => handleExport('fencers-fff') },
          ],
        },
        {
          label: 'Importer',
          submenu: [
            { label: 'Importer XML (BellePoule)', click: () => handleImport('xml') },
            { label: 'Importer liste FFE (.fff)', click: () => handleImport('fff') },
            { label: 'Importer classement FFE', click: () => handleImport('ranking') },
          ],
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Compétition',
      submenu: [
        {
          label: 'Propriétés',
          click: () => mainWindow?.webContents.send('menu:competition-properties'),
        },
        { type: 'separator' },
        {
          label: 'Ajouter un tireur',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send('menu:add-fencer'),
        },
        {
          label: 'Ajouter un arbitre',
          click: () => mainWindow?.webContents.send('menu:add-referee'),
        },
        { type: 'separator' },
        {
          label: '⚡ Démarrer saisie distante',
          click: () => startRemoteScoreServer(),
        },
        {
          label: '🛑 Arrêter saisie distante',
          click: () => stopRemoteScoreServer(),
        },
        { type: 'separator' },
        {
          label: 'Tour suivant',
          accelerator: 'CmdOrCtrl+Right',
          click: () => mainWindow?.webContents.send('menu:next-phase'),
        },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Forcer le rechargement' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Réinitialiser le zoom' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'À propos de BellePoule Modern',
          accelerator: 'F1',
          click: showAbout,
        },
        {
          label: '🔄 Vérifier les mises à jour...',
          click: async () => {
            if (autoUpdater) {
              await autoUpdater.showUpdateDialog();
            } else {
              dialog.showMessageBox(mainWindow!, {
                type: 'warning',
                title: 'Mises à jour',
                message: "Le système de mise à jour n'est pas disponible",
                buttons: ['OK'],
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => {
            const { shell } = require('electron');
            shell.openExternal('https://github.com/klinnex/bellepoule-modern/wiki');
          },
        },
        {
          label: '📝 Signaler un bug / Suggestion',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            mainWindow?.webContents.send('menu:report-issue');
          },
        },
        { type: 'separator' },
        {
          label: 'GitHub',
          click: () => {
            const { shell } = require('electron');
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
  if (remoteScoreServer) {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Saisie distante',
      message: 'Le serveur de saisie distante est déjà démarré',
      buttons: ['OK'],
    });
    return;
  }

  try {
    remoteScoreServer = new RemoteScoreServer(db, 8066);
    remoteScoreServer.start();

    const serverUrl = remoteScoreServer.getServerUrl();
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Saisie distante démarrée',
      message: `Les arbitres peuvent maintenant se connecter`,
      detail:
        `Arène 1: ${serverUrl}/arene1/arbitre\nArène 2: ${serverUrl}/arene2/arbitre\nArène 3: ${serverUrl}/arene3/arbitre\nArène 4: ${serverUrl}/arene4/arbitre\n\nPartagez ces URLs avec les arbitres munis de tablettes.\nAssurez-vous que le pare-feu Windows autorise les connexions sur le port 8066.`,
      buttons: ['OK'],
    });

    // Stocker la référence globale pour le serveur distant
    (global as any).mainWindow = mainWindow;
  } catch (error) {
    dialog.showErrorBox('Erreur', `Impossible de démarrer le serveur distant: ${error}`);
  }
}

function stopRemoteScoreServer(): void {
  if (!remoteScoreServer) {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Saisie distante',
      message: "Le serveur de saisie distante n'est pas démarré",
      buttons: ['OK'],
    });
    return;
  }

  try {
    remoteScoreServer.stop();
    remoteScoreServer = null;

    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Saisie distante arrêtée',
      message: 'Le serveur de saisie distante a été arrêté',
      buttons: ['OK'],
    });
  } catch (error) {
    dialog.showErrorBox('Erreur', `Impossible d'arrêter le serveur distant: ${error}`);
  }
}

// ============================================================================
// File Handlers
// ============================================================================

async function handleOpenFile(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Ouvrir une compétition',
    filters: [
      { name: 'BellePoule Modern', extensions: ['bpm', 'db'] },
      { name: 'BellePoule Classic', extensions: ['cotcot', 'cocot'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filepath = result.filePaths[0];
    try {
      db.importFromFile(filepath);
      mainWindow?.webContents.send('file:opened', filepath);
    } catch (error) {
      dialog.showErrorBox('Erreur', `Impossible d'ouvrir le fichier: ${error}`);
    }
  }
}

async function handleSaveAs(): Promise<void> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Enregistrer la compétition',
    defaultPath: 'competition.bpm',
    filters: [{ name: 'BellePoule Modern', extensions: ['bpm'] }],
  });

  if (!result.canceled && result.filePath) {
    try {
      db.exportToFile(result.filePath);
      mainWindow?.webContents.send('file:saved', result.filePath);
    } catch (error) {
      dialog.showErrorBox('Erreur', `Impossible d'enregistrer: ${error}`);
    }
  }
}

async function handleExport(format: string): Promise<void> {
  mainWindow?.webContents.send('menu:export', format);
}

async function handleImport(format: string): Promise<void> {
  let filters: Electron.FileFilter[] = [];
  let title = 'Importer';

  switch (format) {
    case 'xml':
      title = 'Importer un fichier XML BellePoule';
      filters = [{ name: 'XML BellePoule', extensions: ['xml', 'cotcot'] }];
      break;
    case 'fff':
      title = 'Importer une liste FFE';
      filters = [{ name: 'Fichier FFE', extensions: ['fff', 'csv', 'txt'] }];
      break;
    case 'ranking':
      title = 'Importer un classement FFE';
      filters = [{ name: 'Fichier classement', extensions: ['fff', 'csv', 'txt', 'xlsx'] }];
      break;
    default:
      filters = [{ name: 'Tous les fichiers', extensions: ['*'] }];
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    title,
    filters,
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filepath = result.filePaths[0];
    try {
      // Lire le contenu du fichier
      const content = fs.readFileSync(filepath, 'utf-8');
      // Envoyer au renderer pour traitement
      mainWindow?.webContents.send('menu:import', format, filepath, content);
    } catch (error) {
      dialog.showErrorBox("Erreur d'import", `Impossible de lire le fichier: ${error}`);
    }
  }
}

function showAbout(): void {
  const versionInfo = getVersionInfo();
  const buildDate = new Date(versionInfo.date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'À propos de BellePoule Modern',
    message: `BellePoule Modern v${versionInfo.version}`,
    detail: `Build #${versionInfo.build}
Date: ${buildDate}

Logiciel de gestion de compétitions d'escrime.

Réécriture moderne du logiciel BellePoule original créé par Yann Deboeuf.

Licence: GPL-3.0
© 2024-2026 BellePoule Modern Contributors

Pour signaler un bug, mentionnez:
  Version: ${versionInfo.version}
  Build: #${versionInfo.build}`,
  });
}

// ============================================================================
// IPC Handlers - Database Operations
// ============================================================================

// Competition handlers
ipcMain.handle('db:createCompetition', async (_, data) => {
  return db.createCompetition(data);
});

ipcMain.handle('db:getCompetition', async (_, id) => {
  return db.getCompetition(id);
});

ipcMain.handle('db:getAllCompetitions', async () => {
  return db.getAllCompetitions();
});

ipcMain.handle('db:deleteCompetition', async (_, id) => {
  return db.deleteCompetition(id);
});

ipcMain.handle('db:updateCompetition', async (_, id, updates) => {
  return db.updateCompetition(id, updates);
});

// Fencer handlers
ipcMain.handle('db:addFencer', async (_, competitionId, fencer) => {
  return db.addFencer(competitionId, fencer);
});

ipcMain.handle('db:getFencer', async (_, id) => {
  return db.getFencer(id);
});

ipcMain.handle('db:getFencersByCompetition', async (_, competitionId) => {
  return db.getFencersByCompetition(competitionId);
});

ipcMain.handle('db:updateFencer', async (_, id, updates) => {
  return db.updateFencer(id, updates);
});

ipcMain.handle('db:deleteFencer', async (_, id) => {
  return db.deleteFencer(id);
});

ipcMain.handle('db:deleteAllFencers', async (_, competitionId) => {
  return db.deleteAllFencers(competitionId);
});

// Match handlers
ipcMain.handle('db:createMatch', async (_, match, poolId) => {
  return db.createMatch(match, poolId);
});

ipcMain.handle('db:getMatch', async (_, id) => {
  return db.getMatch(id);
});

ipcMain.handle('db:getMatchesByPool', async (_, poolId) => {
  return db.getMatchesByPool(poolId);
});

ipcMain.handle('db:updateMatch', async (_, id, updates) => {
  return db.updateMatch(id, updates);
});

// Session State handlers
ipcMain.handle('db:saveSessionState', async (_, competitionId, state) => {
  return db.saveSessionState(competitionId, state);
});

ipcMain.handle('db:getSessionState', async (_, competitionId) => {
  return db.getSessionState(competitionId);
});

ipcMain.handle('db:clearSessionState', async (_, competitionId) => {
  return db.clearSessionState(competitionId);
});

// Pool handlers
ipcMain.handle('db:updatePool', async (_, pool) => {
  return db.updatePool(pool);
});
// ipcMain.handle('db:createPool', async (_, phaseId, number) => {
//   return db.createPool(phaseId, number);
// });
// ipcMain.handle('db:addFencerToPool', async (_, poolId, fencerId, position) => {
//   return db.addFencerToPool(poolId, fencerId, position);
// });
// ipcMain.handle('db:getPoolFencers', async (_, poolId) => {
//   return db.getPoolFencers(poolId);
// });

// File handlers
ipcMain.handle('file:export', async (_, filepath) => {
  db.exportToFile(filepath);
});

ipcMain.handle('file:import', async (_, filepath) => {
  await db.importFromFile(filepath);
});

// File content write handler
ipcMain.handle('file:writeContent', async (_, filepath: string, content: string) => {
  fs.writeFileSync(filepath, content, 'utf-8');
});

// Dialog handlers
ipcMain.handle('dialog:openFile', async (_, options) => {
  return dialog.showOpenDialog(mainWindow!, options);
});

ipcMain.handle('dialog:saveFile', async (_, options) => {
  return dialog.showSaveDialog(mainWindow!, options);
});

// Shell handlers
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  await shell.openExternal(url);
});

// Remote score server handlers
ipcMain.handle('remote:startServer', async () => {
  try {
    if (remoteScoreServer) {
      return { success: false, error: 'Le serveur est déjà démarré' };
    }

    remoteScoreServer = new RemoteScoreServer(db, 8066);
    remoteScoreServer.start();

    const serverUrl = remoteScoreServer.getServerUrl();
    const serverInfo = {
      url: serverUrl,
      ip: remoteScoreServer.getLocalIPAddress(),
      port: 8066,
    };

    // Stocker la référence globale pour le serveur distant
    (global as any).mainWindow = mainWindow;

    return { success: true, serverInfo };
  } catch (error) {
    console.error('Error starting remote server:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:stopServer', async () => {
  try {
    if (!remoteScoreServer) {
      return { success: false, error: "Le serveur n'est pas démarré" };
    }

    remoteScoreServer.stop();
    remoteScoreServer = null;

    return { success: true };
  } catch (error) {
    console.error('Error stopping remote server:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getServerInfo', async () => {
  if (!remoteScoreServer) {
    return { success: false, error: "Le serveur n'est pas démarré" };
  }

  return {
    success: true,
    serverInfo: {
      url: remoteScoreServer.getServerUrl(),
      ip: remoteScoreServer.getLocalIPAddress(),
      port: 8066,
    },
  };
});

// Remote session handlers
ipcMain.handle('remote:startSession', async (_, competitionId: string, strips: number) => {
  try {
    if (!remoteScoreServer) {
      return { success: false, error: 'Le serveur distant n est pas démarré' };
    }

    const session = await remoteScoreServer.startSession(competitionId, strips);
    return { success: true, session };
  } catch (error) {
    console.error('Error starting session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:stopSession', async () => {
  try {
    if (!remoteScoreServer) {
      return { success: false, error: 'Le serveur distant n est pas démarré' };
    }

    remoteScoreServer.stopSession();
    return { success: true };
  } catch (error) {
    console.error('Error stopping session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getSession', async () => {
  if (!remoteScoreServer) {
    return { success: false, error: 'Le serveur distant n est pas démarré' };
  }

  return { success: true, session: remoteScoreServer.getSession() };
});

ipcMain.handle('remote:addReferee', async (_, name: string) => {
  try {
    if (!remoteScoreServer) {
      return { success: false, error: 'Le serveur distant n est pas démarré' };
    }

    const referee = remoteScoreServer.addReferee(name);
    return { success: true, referee };
  } catch (error) {
    console.error('Error adding referee:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getArenas', async () => {
  if (!remoteScoreServer) {
    return { success: false, error: 'Le serveur distant n est pas démarré' };
  }

  return { success: true, arenas: remoteScoreServer.getAllArenas() };
});

ipcMain.handle('remote:updateStripCount', async (_, newCount: number) => {
  try {
    if (!remoteScoreServer) {
      return { success: false, error: 'Le serveur distant n est pas démarré' };
    }

    const session = remoteScoreServer.updateStripCount(newCount);
    return { success: true, session };
  } catch (error) {
    console.error('Error updating strip count:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

// App info handlers
ipcMain.handle('app:getVersionInfo', async () => {
  return getVersionInfo();
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
  return { success: false, error: 'AutoUpdater not initialized' };
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
    autoUpdater.checkAndInstallPendingUpdate();
    return { success: true };
  }
  return { success: false, error: 'AutoUpdater not initialized' };
});

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
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

  await db.open(dbPath);
  console.log('Base de données ouverte:', db.getPath());

  createWindow();

  // Initialize auto updater
  if (mainWindow) {
    autoUpdater = new AutoUpdater(mainWindow, {
      autoDownload: false, // Par défaut manuel, peut être activé via silent mode
      autoInstall: false,
      checkInterval: 12, // Vérifier toutes les 12 heures
      betaChannel: true, // Activer le canal beta pour détecter les dev builds
      silent: false,
      installOnQuit: false,
    });

    // Vérifier s'il y a une mise à jour en attente d'installation
    if (autoUpdater.hasPendingUpdate()) {
      const pendingInfo = autoUpdater.getPendingUpdateInfo();
      console.log(`[Main] Mise à jour en attente trouvée: v${pendingInfo?.version}`);
      // Demander à l'utilisateur s'il veut installer maintenant
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Mise à jour en attente',
        message: `La version ${pendingInfo?.version} est prête à être installée.`,
        detail: "Voulez-vous installer cette mise à jour maintenant ? L'application va redémarrer.",
        buttons: ['Installer maintenant', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
      });

      if (result.response === 0) {
        autoUpdater.checkAndInstallPendingUpdate();
        return; // Arrêter le démarrage normal
      }
    }
  }

  // Autosave every 2 minutes
  let autosaveInterval: NodeJS.Timeout | null = null;

  const startAutosave = () => {
    if (autosaveInterval) clearInterval(autosaveInterval);
    autosaveInterval = setInterval(
      () => {
        try {
          db.forceSave();
          console.log('Autosave completed at', new Date().toISOString());
          mainWindow?.webContents.send('autosave:completed');
        } catch (error) {
          console.error('Autosave failed:', error);
          mainWindow?.webContents.send('autosave:failed');
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

app.on('window-all-closed', () => {
  db.forceSave(); // Save before closing
  db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  db.forceSave(); // Save before quitting
  db.close();
});

// Handle uncaught exceptions - save before crash
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  try {
    db.forceSave(); // Try to save data before showing error
  } catch (e) {
    console.error('Failed to save on crash:', e);
  }
  dialog.showErrorBox('Erreur', `Une erreur inattendue s'est produite: ${error.message}`);
});
