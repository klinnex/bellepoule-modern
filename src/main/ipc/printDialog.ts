/**
 * BellePoule Modern - Boîte d'impression intégrée : canaux IPC `print:*` (#1214, étape 1)
 * `print:getPrinters` (imprimantes installées), `print:render` (PDF d'aperçu en mémoire,
 * sans fichier temporaire), `print:execute` (impression silencieuse avec les réglages choisis),
 * `print:savePdf` (enregistrement via le dialogue natif), `print:systemDialog` (boîte du système).
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import {
  buildPdfOptions,
  buildPrintOptions,
  normalizePrintSettings,
  type PrintSettings,
} from '../printSettings';

export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface PrintDialogDeps {
  listPrinters(): Promise<PrinterInfo[]>;
  /** HTML → PDF avec les options printToPDF */
  renderPdf(html: string, options: ReturnType<typeof buildPdfOptions>): Promise<Buffer>;
  /** HTML → imprimante avec les options webContents.print */
  printHtml(html: string, options: ReturnType<typeof buildPrintOptions>): Promise<boolean>;
  /** Dialogue « Enregistrer sous » natif : chemin choisi, undefined si annulé */
  chooseSavePath(defaultName: string): Promise<string | undefined>;
  writeFile(filePath: string, data: Buffer): Promise<void>;
  /** Impression avec la boîte de dialogue native du système */
  printWithSystemDialog(html: string): Promise<{ success: boolean; error?: string }>;
}

export interface PrintResult {
  success: boolean;
  error?: string;
}

const checkHtml = (html: unknown): html is string => typeof html === 'string' && html.length > 0;

export async function getPrinters(deps: PrintDialogDeps): Promise<PrinterInfo[]> {
  try {
    return await deps.listPrinters();
  } catch {
    return [];
  }
}

/** PDF (octets) pour l'aperçu à l'écran : transmis en mémoire, jamais écrit sur disque */
export async function renderPreview(
  deps: PrintDialogDeps,
  html: unknown,
  settings?: Partial<PrintSettings>
): Promise<{ success: boolean; data?: Uint8Array; error?: string }> {
  if (!checkHtml(html)) return { success: false, error: 'html_required' };
  try {
    const pdf = await deps.renderPdf(html, buildPdfOptions(normalizePrintSettings(settings)));
    return { success: true, data: new Uint8Array(pdf) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function executePrint(
  deps: PrintDialogDeps,
  html: unknown,
  settings?: Partial<PrintSettings>
): Promise<PrintResult> {
  if (!checkHtml(html)) return { success: false, error: 'html_required' };
  try {
    const ok = await deps.printHtml(html, buildPrintOptions(normalizePrintSettings(settings)));
    return ok ? { success: true } : { success: false, error: 'print_failed' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Nom de fichier proposé : sans séparateur ni caractère interdit, extension .pdf */
export function pdfFileName(title: unknown): string {
  const base =
    (typeof title === 'string' ? title : '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      // Caractères de contrôle
      .split('')
      .map(c => (c.charCodeAt(0) < 32 ? ' ' : c))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'BellePoule';
  return `${base}.pdf`;
}

/** Rend le PDF avec les réglages choisis puis l'enregistre là où l'utilisateur le décide */
export async function savePdf(
  deps: PrintDialogDeps,
  html: unknown,
  settings?: Partial<PrintSettings>,
  title?: unknown
): Promise<PrintResult & { canceled?: boolean; path?: string }> {
  if (!checkHtml(html)) return { success: false, error: 'html_required' };
  try {
    const target = await deps.chooseSavePath(pdfFileName(title));
    if (!target) return { success: false, canceled: true };
    const pdf = await deps.renderPdf(html, buildPdfOptions(normalizePrintSettings(settings)));
    await deps.writeFile(target, pdf);
    return { success: true, path: target };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function registerPrintDialogHandlers(deps: PrintDialogDeps): void {
  ipcMain.handle('print:getPrinters', () => getPrinters(deps));
  ipcMain.handle('print:render', (_e, html: unknown, settings?: Partial<PrintSettings>) =>
    renderPreview(deps, html, settings)
  );
  ipcMain.handle('print:execute', (_e, html: unknown, settings?: Partial<PrintSettings>) =>
    executePrint(deps, html, settings)
  );
  ipcMain.handle(
    'print:savePdf',
    (_e, html: unknown, settings?: Partial<PrintSettings>, title?: unknown) =>
      savePdf(deps, html, settings, title)
  );
  ipcMain.handle('print:systemDialog', async (_e, html: unknown) =>
    checkHtml(html)
      ? deps.printWithSystemDialog(html)
      : ({ success: false, error: 'html_required' } as PrintResult)
  );
}
