/**
 * BellePoule Modern - Menu natif de l'application (i18n fr/en/de/zh-HK)
 * (extrait de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { app, dialog, Menu, shell, type BrowserWindow } from 'electron';
import type { DatabaseManager } from '../database';
import type { AutoUpdater } from './autoUpdater';
import { getL, setUiLanguage } from './menuLabels';
import type { createMenuActions } from './menuActions';
import { logger, LogCategory, toError } from '../shared/services/logger';

export interface MenuContext {
  db: Pick<DatabaseManager, 'forceSave'>;
  getMainWindow(): BrowserWindow | null;
  /** L'updater est créé après la fenêtre : lecture différée */
  getAutoUpdater(): AutoUpdater | null;
  actions: Pick<
    ReturnType<typeof createMenuActions>,
    | 'handleOpenFile'
    | 'saveGlobalBackup'
    | 'handleSaveAs'
    | 'handleExport'
    | 'handleImport'
    | 'showAbout'
    | 'startRemoteScoreServer'
    | 'stopRemoteScoreServer'
  >;
}

export function createMenu(
  { db, getMainWindow, getAutoUpdater, actions }: MenuContext,
  language?: string
): void {
  const {
    handleOpenFile,
    saveGlobalBackup,
    handleSaveAs,
    handleExport,
    handleImport,
    showAbout,
    startRemoteScoreServer,
    stopRemoteScoreServer,
  } = actions;
  if (language) setUiLanguage(language);
  const L = getL();

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: L.file,
      submenu: [
        {
          label: L.newCompetition,
          accelerator: 'CmdOrCtrl+N',
          click: () => getMainWindow()?.webContents.send('menu:new-competition'),
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
              logger.info(LogCategory.SYSTEM, 'Sauvegarde manuelle effectuée');
              getMainWindow()?.webContents.send('menu:save');
              void saveGlobalBackup();
            } catch (error) {
              logger.error(LogCategory.SYSTEM, 'Échec sauvegarde manuelle:', toError(error));
              getMainWindow()?.webContents.send('autosave:failed');
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
          click: () => getMainWindow()?.webContents.send('menu:open-settings'),
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
          click: () => getMainWindow()?.webContents.send('menu:competition-properties'),
        },
        { type: 'separator' },
        {
          label: L.addFencer,
          accelerator: 'CmdOrCtrl+T',
          click: () => getMainWindow()?.webContents.send('menu:add-fencer'),
        },
        {
          label: L.addReferee,
          click: () => getMainWindow()?.webContents.send('menu:add-referee'),
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
          click: () => getMainWindow()?.webContents.send('menu:next-phase'),
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
            const autoUpdater = getAutoUpdater();
            if (autoUpdater) {
              await autoUpdater.showUpdateDialog();
            } else {
              dialog.showMessageBox(getMainWindow()!, {
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
            getMainWindow()?.webContents.send('menu:report-issue');
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
