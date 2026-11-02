/**
 * BellePoule Modern - Handlers IPC window:*, impression / PDF (file:printHtml*), perf:* et shell:openExternal
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { eventLoopMonitor } from '../eventLoopMonitor';
import { printHtmlSilently, printHtmlWithSystemDialog } from '../printWindows';
import { assertAuthorizedPath, authorizePath } from '../pathAuthorization';
import { previewPdf, registerPdfPreviewHandlers } from './pdfPreview';
import { registerPrintDialogHandlers } from './printDialog';
import { logger, LogCategory } from '../../shared/services/logger';

export interface WindowPrintHandlersContext {
  getMainWindow(): BrowserWindow | null;
}

export function registerWindowPrintHandlers({ getMainWindow }: WindowPrintHandlersContext): void {
  // Window resize handler
  ipcMain.handle(
    'window:setSize',
    (_event, width: number, height: number, options?: { force?: boolean }) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      const force = options?.force === true;
      // Auto-fit : ne pas écraser une fenêtre maximisée / plein écran choisie par l'utilisateur
      if (!force && (win.isMaximized() || win.isFullScreen())) return;
      // Choix explicite (préréglage) : sortir du maximisé / plein écran sinon setSize est ignoré (#1034)
      if (win.isFullScreen()) win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
      // Borner à la zone de travail de l'écran courant (un préréglage XL dépasse souvent l'écran)
      const area = screen.getDisplayMatching(win.getBounds()).workArea;
      const [minW, minH] = win.getMinimumSize();
      const w = Math.round(Math.min(Math.max(width, minW || 800), area.width));
      const h = Math.round(Math.min(Math.max(height, minH || 600), area.height));
      const x = Math.round(area.x + (area.width - w) / 2);
      const y = Math.round(area.y + (area.height - h) / 2);
      win.setBounds({ x, y, width: w, height: h }, true);
    }
  );

  // Print handler
  ipcMain.handle('window:print', async () => {
    const win = getMainWindow();
    if (win) {
      await win.webContents.print({ silent: false, printBackground: true });
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
    // Dossier privé (mkdtemp, 0700) + création exclusive 0600 : pas de fichier prévisible dans le tmp partagé
    let dir = '';
    let tmpFile = '';
    const cleanup = () => fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    return fs.promises
      .mkdtemp(path.join(os.tmpdir(), 'bp-pdf-'))
      .then(d => {
        dir = d;
        tmpFile = path.join(d, 'print.html');
        return fs.promises.writeFile(tmpFile, html, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      })
      .then(
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
                    void cleanup();
                    resolve(data);
                  })
                  .catch((err: Error) => {
                    pdfWin.destroy();
                    void cleanup();
                    reject(err);
                  });
              }, 800);
            });

            pdfWin.webContents.once('did-fail-load', () => {
              pdfWin.destroy();
              void cleanup();
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
    getMainWindow: () => getMainWindow(),
    render: renderHtmlToPdfBuffer,
    openExternal: p => shell.openPath(p),
  });

  registerPrintDialogHandlers({
    chooseSavePath: async defaultName => {
      const result = await dialog.showSaveDialog(getMainWindow()!, {
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
      (await (getMainWindow()?.webContents.getPrintersAsync() ?? Promise.resolve([]))).map(p => ({
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
      logger.warn(LogCategory.SYSTEM, '[shell:openExternal] URL rejetée (schéma non-https):', url);
      return;
    }
    await shell.openExternal(url);
  });
}
