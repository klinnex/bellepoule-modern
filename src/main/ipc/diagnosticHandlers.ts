/**
 * BellePoule Modern - Canal IPC `diagnostic:exportReport` : export du rapport de diagnostic (#1326)
 * Le fichier est écrit par le main après un « Enregistrer sous » natif, comme les PDF d'impression.
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as os from 'os';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { buildDiagnosticReport, diagnosticFileName, DiagnosticInput } from '../diagnosticReport';
import { assertAuthorizedPath, authorizePath } from '../pathAuthorization';
import { remoteServers } from '../remoteRegistry';

export interface DiagnosticExportResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

export interface DiagnosticDeps {
  collect(): DiagnosticInput;
  /** Dialogue « Enregistrer sous » natif : chemin choisi, undefined si annulé */
  chooseSavePath(defaultName: string): Promise<string | undefined>;
  writeFile(filePath: string, content: string): Promise<void>;
}

export async function exportDiagnosticReport(
  deps: DiagnosticDeps
): Promise<DiagnosticExportResult> {
  try {
    const report = buildDiagnosticReport(deps.collect());
    const filePath = await deps.chooseSavePath(diagnosticFileName(report.generatedAt));
    if (!filePath) return { success: false, cancelled: true };
    await deps.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
}

/** Dépendances réelles du main : versions, dialogue natif et écriture autorisée uniquement en `.json` */
export function createDiagnosticDeps(opts: {
  getWindow: () => BrowserWindow | null;
  getVersionInfo: () => { version: string; build: number; channel?: string };
}): DiagnosticDeps {
  return {
    collect: () => {
      const info = opts.getVersionInfo();
      return {
        appVersion: info.version,
        build: info.build,
        channel: info.channel ?? 'unknown',
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        locale: app.getLocale(),
        electronVersion: process.versions.electron ?? 'unknown',
        chromeVersion: process.versions.chrome ?? 'unknown',
        nodeVersion: process.versions.node,
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round(process.memoryUsage().rss / 1048576),
        activeRemoteServers: remoteServers.size,
        generatedAt: new Date(),
      };
    },
    chooseSavePath: async defaultName => {
      const result = await dialog.showSaveDialog(opts.getWindow()!, {
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return undefined;
      authorizePath(result.filePath, 'write');
      return result.filePath;
    },
    writeFile: (filePath, content) =>
      fs.promises.writeFile(assertAuthorizedPath(filePath, 'write', ['.json']), content, 'utf-8'),
  };
}

export function registerDiagnosticHandlers(deps: DiagnosticDeps): void {
  ipcMain.handle('diagnostic:exportReport', () => exportDiagnosticReport(deps));
}
