/**
 * BellePoule Modern - Actions du menu natif (ouvrir, enregistrer, exporter, importer, à propos)
 * (extraites de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { dialog, type BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../database';
import { getL } from './menuLabels';
import { authorizePath } from './pathAuthorization';
import { readImportText } from './xlsxToCsv';

export interface MenuActionsContext {
  db: DatabaseManager;
  getMainWindow(): BrowserWindow | null;
}

export function createMenuActions({ db, getMainWindow }: MenuActionsContext) {
  function startRemoteScoreServer(): void {
    const L = getL();
    dialog.showMessageBox(getMainWindow()!, {
      type: 'info',
      title: L.remoteTitle,
      message: L.remoteUsePanel,
      buttons: ['OK'],
    });
  }

  function stopRemoteScoreServer(): void {
    startRemoteScoreServer();
  }

  async function handleOpenFile(): Promise<void> {
    const L = getL();
    const result = await dialog.showOpenDialog(getMainWindow()!, {
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
          getMainWindow()?.webContents.send('menu:import', 'xml', filepath, content);
          return;
        }
        // Fusion dans la base active, état d'avancement compris (#1117)
        const ids = await db.mergeFromFile(filepath);
        getMainWindow()?.webContents.send('file:opened', filepath, ids);
      } catch (error) {
        dialog.showErrorBox(L.errTitle, `${L.openErr} ${error}`);
      }
    }
  }

  // Compétition affichée dans le renderer : « Enregistrer sous » l'exporte seule (#1117)
  let currentCompetitionId: string | null = null;

  const setCurrentCompetitionId = (id: string | null): void => {
    currentCompetitionId = id;
  };

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
    const result = await dialog.showSaveDialog(getMainWindow()!, {
      title: L.saveTitle,
      defaultPath: competitionFileName(competition.title),
      filters: [{ name: L.filterBpm, extensions: ['bpm'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      await db.exportCompetitionToFile(competitionId, result.filePath);
      getMainWindow()?.webContents.send('file:saved', result.filePath);
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
        getMainWindow()?.webContents.send('file:saved', sessionBackupPath);
        return;
      } catch {
        // Écriture impossible : repli sur « Enregistrer sous » ci-dessous
      }
    }
    await saveGlobalAs();
  }

  async function saveGlobalAs(): Promise<void> {
    const L = getL();
    const result = await dialog.showSaveDialog(getMainWindow()!, {
      title: L.saveTitle,
      defaultPath: sessionBackupPath ?? 'competition.bpm',
      filters: [{ name: L.filterBpm, extensions: ['bpm'] }],
    });
    if (result.canceled || !result.filePath) return;
    try {
      await db.exportToFile(result.filePath);
      sessionBackupPath = result.filePath;
      getMainWindow()?.webContents.send('file:saved', result.filePath);
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
    getMainWindow()?.webContents.send('menu:export', format);
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

    const result = await dialog.showOpenDialog(getMainWindow()!, {
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
          getMainWindow()?.webContents.send('menu:import', format, filepath, '');
        } else {
          const content = await readImportText(filepath);
          getMainWindow()?.webContents.send('menu:import', format, filepath, content);
        }
      } catch (error) {
        dialog.showErrorBox(L.importErrTitle, `${L.importReadErr} ${error}`);
      }
    }
  }

  function showAbout(): void {
    getMainWindow()?.webContents.send('menu:show-about');
  }

  return {
    handleOpenFile,
    exportCompetitionDialog,
    saveGlobalBackup,
    handleSaveAs,
    handleExport,
    handleImport,
    showAbout,
    startRemoteScoreServer,
    stopRemoteScoreServer,
    setCurrentCompetitionId,
  };
}
