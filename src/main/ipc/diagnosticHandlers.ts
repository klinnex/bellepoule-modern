/**
 * BellePoule Modern - Canal IPC `diagnostic:exportReport` : export du rapport de diagnostic (#1326)
 * Le fichier est écrit par le main après un « Enregistrer sous » natif, comme les PDF d'impression.
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import { buildDiagnosticReport, diagnosticFileName, DiagnosticInput } from '../diagnosticReport';

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

export function registerDiagnosticHandlers(deps: DiagnosticDeps): void {
  ipcMain.handle('diagnostic:exportReport', () => exportDiagnosticReport(deps));
}
