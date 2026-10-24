import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: { handle: vi.fn() } }));

import { previewPdf, type PdfPreviewDeps } from './ipc/pdfPreview';

describe('previewPdf (#1214)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-prev-test-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const makeDeps = (over: Partial<PdfPreviewDeps> = {}): PdfPreviewDeps => ({
    render: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
    tmpDir: dir,
    now: () => 42,
    openWindow: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(''),
    ...over,
  });

  it('écrit un PDF temporaire, l’ouvre dans la fenêtre interne et le supprime à la fermeture', async () => {
    const deps = makeDeps();
    const res = await previewPdf(deps, '<html></html>', 'Poule 1');
    const file = path.join(dir, 'bp-preview-42.pdf');
    expect(res).toEqual({ success: true, path: file });
    expect(fs.existsSync(file)).toBe(true);
    const [p, title, handlers] = (deps.openWindow as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(p).toBe(file);
    expect(title).toBe('Poule 1');
    handlers.onClosed();
    await new Promise(r => setTimeout(r, 20));
    expect(fs.existsSync(file)).toBe(false);
    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it('repli sur le lecteur externe si la fenêtre ne peut pas s’ouvrir', async () => {
    const deps = makeDeps({
      openWindow: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const res = await previewPdf(deps, '<html></html>');
    expect(deps.openExternal).toHaveBeenCalledWith(path.join(dir, 'bp-preview-42.pdf'));
    expect(res.success).toBe(true);
  });

  it('repli sur le lecteur externe si le chargement échoue', async () => {
    const deps = makeDeps();
    await previewPdf(deps, '<html></html>');
    (deps.openWindow as ReturnType<typeof vi.fn>).mock.calls[0][2].onFailed();
    expect(deps.openExternal).toHaveBeenCalledTimes(1);
  });

  it('erreur de rendu : échec sans fichier résiduel', async () => {
    const deps = makeDeps({ render: vi.fn().mockRejectedValue(new Error('render')) });
    const res = await previewPdf(deps, '<html></html>');
    expect(res).toEqual({ success: false, error: 'render' });
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
