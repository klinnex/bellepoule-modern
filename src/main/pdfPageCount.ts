import { ipcMain } from 'electron';

/** Compte les pages d'un PDF produit par Chromium (objets « /Type /Page », hors « /Pages »). */
export function countPdfPages(data: Buffer): number {
  const m = data.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

/** Nombre de pages d'un HTML une fois rendu en PDF (sommaire du dossier, #1325) */
export function registerCountPagesHandler(render: (html: string) => Promise<Buffer>): void {
  ipcMain.handle('file:countHtmlPages', async (_, html: string) => {
    try {
      if (!html || typeof html !== 'string') throw new Error('HTML content is required');
      return { success: true, pages: countPdfPages(await render(html)) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
