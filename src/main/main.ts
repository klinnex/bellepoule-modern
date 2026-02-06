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
import {
  Competition,
  Fencer,
  FencerStatus,
  Match,
  MatchStatus,
  Pool,
} from '../shared/types';

// Database instance
const db = new DatabaseManager();

// Remote score server
let remoteScoreServer: any = null;
let remoteServerPort: number = 8066; // Port par défaut

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
          date: new Date().toISOString()
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
          click: () => mainWindow?.webContents.send('menu:save'),
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
                message: 'Le système de mise à jour n\'est pas disponible',
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
    
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Saisie distante démarrée',
      message: 'Les arbitres peuvent maintenant se connecter sur http://localhost:8066',
      detail: 'Partagez cette URL avec les arbitres munis de tablettes.',
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
      message: 'Le serveur de saisie distante n\'est pas démarré',
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
    filters: [
      { name: 'BellePoule Modern', extensions: ['bpm'] },
    ],
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
      filters = [{ name: 'Fichier classement', extensions: ['csv', 'txt', 'xlsx'] }];
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
      dialog.showErrorBox('Erreur d\'import', `Impossible de lire le fichier: ${error}`);
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
    minute: '2-digit'
  });
  
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'À propos de BellePoule Modern',
    message: `BellePoule Modern v${versionInfo.version}`,
    detail: `Build #${versionInfo.build}
Date: ${buildDate}

Logiciel de gestion de compétitions d'escrime.

Réécriture moderne du logiciel BellePoule original créé par Yannick Le Roux.

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

// App info handlers
ipcMain.handle('app:getVersionInfo', async () => {
  return getVersionInfo();
});

// ============================================================================
// Remote Server IPC Handlers
// ============================================================================

ipcMain.handle('remote:startServer', async (_, port?: number) => {
  try {
    if (remoteScoreServer) {
      return { success: false, message: 'Le serveur est déjà démarré' };
    }

    const serverPort = port || remoteServerPort;
    remoteScoreServer = new RemoteScoreServer(db, serverPort);
    remoteScoreServer.start();
    
    // Notifier le renderer du changement de statut
    if (mainWindow) {
      mainWindow.webContents.send('remote:status-changed', { isRunning: true, port: serverPort });
    }
    
    return { success: true, message: `Serveur démarré sur le port ${serverPort}` };
  } catch (error) {
    return { success: false, message: `Erreur: ${error}` };
  }
});

ipcMain.handle('remote:stopServer', async () => {
  try {
    if (!remoteScoreServer) {
      return { success: false, message: 'Le serveur n\'est pas démarré' };
    }

    remoteScoreServer.stop();
    remoteScoreServer = null;
    
    // Notifier le renderer du changement de statut
    if (mainWindow) {
      mainWindow.webContents.send('remote:status-changed', { isRunning: false, port: remoteServerPort });
    }
    
    return { success: true, message: 'Serveur arrêté' };
  } catch (error) {
    return { success: false, message: `Erreur: ${error}` };
  }
});

ipcMain.handle('remote:getServerStatus', async () => {
  return {
    isRunning: remoteScoreServer !== null,
    port: remoteServerPort
  };
});

ipcMain.handle('remote:setPort', async (_, port: number) => {
  if (port < 1 || port > 65535) {
    return { success: false, message: 'Le port doit être entre 1 et 65535' };
  }
  
  if (remoteScoreServer) {
    return { success: false, message: 'Arrêtez le serveur avant de changer le port' };
  }
  
  remoteServerPort = port;
  return { success: true, message: `Port changé à ${port}` };
});

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  // Initialize database
  await db.open();
  
  createWindow();

  // Initialize auto updater
  if (mainWindow) {
    autoUpdater = new AutoUpdater(mainWindow, {
      autoDownload: false, // Pour l'instant, téléchargement manuel
      autoInstall: false,
      checkInterval: 12, // Vérifier toutes les 12 heures
      betaChannel: false
    });
  }

  // Autosave every 2 minutes
  let autosaveInterval: NodeJS.Timeout | null = null;
  
  const startAutosave = () => {
    if (autosaveInterval) clearInterval(autosaveInterval);
    autosaveInterval = setInterval(() => {
      try {
        db.forceSave();
        console.log('Autosave completed at', new Date().toISOString());
        mainWindow?.webContents.send('autosave:completed');
      } catch (error) {
        console.error('Autosave failed:', error);
        mainWindow?.webContents.send('autosave:failed');
      }
    }, 2 * 60 * 1000); // 2 minutes
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
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  try {
    db.forceSave(); // Try to save data before showing error
  } catch (e) {
    console.error('Failed to save on crash:', e);
  }
  dialog.showErrorBox('Erreur', `Une erreur inattendue s'est produite: ${error.message}`);
});
