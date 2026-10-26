import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import {
  buildPdfOptions,
  buildPrintOptions,
  DEFAULT_PRINT_SETTINGS,
  normalizePrintSettings,
  pageRangesToPdfString,
  parsePageRanges,
} from './printSettings';
import { executePrint, getPrinters, renderPreview, type PrintDialogDeps } from './ipc/printDialog';

describe('parsePageRanges (#1214)', () => {
  it('vide = toutes les pages', () => expect(parsePageRanges('  ')).toEqual([]));
  it('page seule et plage', () =>
    expect(parsePageRanges('1-3, 5')).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 5 },
    ]));
  it('trie et fusionne les plages qui se touchent', () =>
    expect(parsePageRanges('5, 1-3, 2-4')).toEqual([{ from: 1, to: 5 }]));
  it.each(['a', '0', '3-1', '1-', '1,,2', '-2', '1-2-3'])('rejette %s', s =>
    expect(parsePageRanges(s)).toBeNull()
  );
  it('format printToPDF', () =>
    expect(pageRangesToPdfString(parsePageRanges('1-3,5')!)).toBe('1-3, 5'));
});

describe('normalizePrintSettings (#1214)', () => {
  it('valeurs par défaut pour une entrée invalide', () => {
    expect(normalizePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(normalizePrintSettings('x')).toEqual(DEFAULT_PRINT_SETTINGS);
  });
  it('borne copies et échelle, rejette énumérations et plages inconnues', () => {
    const s = normalizePrintSettings({
      copies: 500,
      scale: 5,
      paperSize: 'B9',
      duplex: 'x',
      margins: 'y',
      pages: '3-1',
      color: 'oui',
    });
    expect(s).toMatchObject({
      copies: 99,
      scale: 10,
      paperSize: 'A4',
      duplex: 'simplex',
      margins: 'default',
      pages: '',
      color: true,
    });
  });
  it('conserve des réglages valides', () => {
    const s = normalizePrintSettings({
      printer: 'HP',
      copies: 2,
      pages: '1-3, 5',
      landscape: true,
      paperSize: 'A3',
      color: false,
      duplex: 'longEdge',
      margins: 'none',
      scale: 80,
    });
    expect(s.printer).toBe('HP');
    expect(s.pages).toBe('1-3, 5');
    expect(s.duplex).toBe('longEdge');
    expect(s.scale).toBe(80);
  });
});

describe('options Electron (#1214)', () => {
  it('printToPDF : échelle en fraction, marges en pouces', () => {
    const o = buildPdfOptions({ ...DEFAULT_PRINT_SETTINGS, scale: 50, margins: 'none' });
    expect(o.scale).toBe(0.5);
    expect(o.margins).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(o.pageSize).toBe('A4');
  });
  it('print : silencieux, imprimante, pages 0-indexées', () => {
    const o = buildPrintOptions({
      ...DEFAULT_PRINT_SETTINGS,
      printer: 'HP',
      copies: 3,
      pages: '2-3, 5',
      color: false,
      duplex: 'shortEdge',
    });
    expect(o).toMatchObject({
      silent: true,
      deviceName: 'HP',
      copies: 3,
      color: false,
      duplexMode: 'shortEdge',
      pageRanges: [
        { from: 1, to: 2 },
        { from: 4, to: 4 },
      ],
    });
  });
  it('print : imprimante par défaut et toutes les pages sans clés superflues', () => {
    const o = buildPrintOptions(DEFAULT_PRINT_SETTINGS);
    expect(o).not.toHaveProperty('deviceName');
    expect(o).not.toHaveProperty('pageRanges');
  });
});

describe('handlers print:* (#1214)', () => {
  const makeDeps = (over: Partial<PrintDialogDeps> = {}): PrintDialogDeps => ({
    listPrinters: vi.fn().mockResolvedValue([{ name: 'P', displayName: 'P', isDefault: true }]),
    renderPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF')),
    printHtml: vi.fn().mockResolvedValue(true),
    ...over,
  });

  it('liste les imprimantes, [] en cas d’erreur', async () => {
    expect(await getPrinters(makeDeps())).toHaveLength(1);
    expect(
      await getPrinters(makeDeps({ listPrinters: vi.fn().mockRejectedValue(new Error('x')) }))
    ).toEqual([]);
  });

  it('aperçu : PDF en mémoire avec les réglages normalisés', async () => {
    const deps = makeDeps();
    const res = await renderPreview(deps, '<p>a</p>', { scale: 50, paperSize: 'B9' as never });
    expect(res.success).toBe(true);
    expect(Array.from(res.data!.slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(deps.renderPdf).toHaveBeenCalledWith(
      '<p>a</p>',
      expect.objectContaining({ scale: 0.5, pageSize: 'A4' })
    );
  });

  it('refuse un HTML vide ou non textuel', async () => {
    const deps = makeDeps();
    expect((await renderPreview(deps, '')).success).toBe(false);
    expect((await executePrint(deps, 42)).error).toBe('html_required');
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(deps.printHtml).not.toHaveBeenCalled();
  });

  it('impression : envoie les options et remonte les échecs', async () => {
    const deps = makeDeps();
    expect(await executePrint(deps, '<p>a</p>', { printer: 'HP', copies: 2 })).toEqual({
      success: true,
    });
    expect(deps.printHtml).toHaveBeenCalledWith(
      '<p>a</p>',
      expect.objectContaining({ silent: true, deviceName: 'HP', copies: 2 })
    );
    expect(
      await executePrint(makeDeps({ printHtml: vi.fn().mockResolvedValue(false) }), '<p/>')
    ).toEqual({ success: false, error: 'print_failed' });
    expect(
      (
        await executePrint(
          makeDeps({ printHtml: vi.fn().mockRejectedValue(new Error('boom')) }),
          '<p/>'
        )
      ).error
    ).toBe('boom');
  });
});
