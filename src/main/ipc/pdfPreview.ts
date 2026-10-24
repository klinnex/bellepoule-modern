/**
 * BellePoule Modern - Handler IPC `file:previewPdf` : aperçu avant impression (#1214)
 * Même rendu que l'export PDF, affiché dans la visionneuse PDF de Chromium (fenêtre fille
 * modale sans preload ni Node) ; l'impression et l'enregistrement se font depuis la visionneuse.
 * Repli : lecteur PDF externe de l'OS.
 * Licensed under GPL-3.0
 */
import { BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

export interface PdfPreviewResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface PdfPreviewDeps {
  render(html: string): Promise<Buffer>;
  tmpDir: string;
  now(): number;
  /** Ouvre la visionneuse interne ; `onClosed` à la fermeture, `onFailed` si le chargement échoue */
  openWindow(
    pdfPath: string,
    title: string,
    handlers: { onClosed(): void; onFailed(): void }
  ): void;
  /** Lecteur externe (retourne un message d'erreur, vide si OK) */
  openExternal(pdfPath: string): Promise<string>;
}

/** Génère le PDF temporaire et l'ouvre dans l'aperçu interne (supprimé à la fermeture) */
export async function previewPdf(
  deps: PdfPreviewDeps,
  html: string,
  title = 'BellePoule Modern'
): Promise<PdfPreviewResult> {
  const pdfPath = path.join(deps.tmpDir, `bp-preview-${deps.now()}.pdf`);
  const cleanup = () => fs.promises.unlink(pdfPath).catch(() => {});
  try {
    await fs.promises.writeFile(pdfPath, await deps.render(html));
    const external = async () => {
      // Le fichier reste en place : le lecteur externe en a besoin (comportement historique)
      const err = await deps.openExternal(pdfPath);
      return err ? { success: false, error: err } : { success: true, path: pdfPath };
    };
    try {
      deps.openWindow(pdfPath, title, {
        onClosed: () => void cleanup(),
        onFailed: () => void deps.openExternal(pdfPath),
      });
      return { success: true, path: pdfPath };
    } catch {
      return await external();
    }
  } catch (e) {
    await cleanup();
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface PdfPreviewContext {
  getMainWindow(): BrowserWindow | null;
  render(html: string): Promise<Buffer>;
  openExternal(pdfPath: string): Promise<string>;
}

export function createPdfPreviewDeps(ctx: PdfPreviewContext): PdfPreviewDeps {
  return {
    render: ctx.render,
    tmpDir: os.tmpdir(),
    now: Date.now,
    openExternal: ctx.openExternal,
    openWindow: (pdfPath, title, { onClosed, onFailed }) => {
      const parent = ctx.getMainWindow() ?? undefined;
      const win = new BrowserWindow({
        parent,
        modal: !!parent,
        width: 1000,
        height: 800,
        title,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          // Visionneuse PDF de Chromium, uniquement pour cette fenêtre
          plugins: true,
        },
      });
      win.setMenu(null);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', e => e.preventDefault());
      win.webContents.once('did-fail-load', () => {
        win.destroy();
        onFailed();
      });
      win.on('closed', onClosed);
      void win.loadURL(pathToFileURL(pdfPath).toString());
    },
  };
}

export function registerPdfPreviewHandlers(ctx: PdfPreviewContext): PdfPreviewDeps {
  const deps = createPdfPreviewDeps(ctx);
  ipcMain.handle('file:previewPdf', (_e, html: string, title?: string) =>
    previewPdf(deps, html, typeof title === 'string' ? title : undefined)
  );
  return deps;
}
