import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
const openExternal = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showSaveDialog: vi.fn() },
  screen: {},
  shell: { openExternal: (...a: unknown[]) => openExternal(...a), openPath: vi.fn() },
  app: { getPath: () => '/tmp' },
  ipcMain: {
    handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn),
    on: vi.fn(),
  },
}));
vi.mock('../printWindows', () => ({
  printHtmlSilently: vi.fn(),
  printHtmlWithSystemDialog: vi.fn(),
}));

import { isAllowedPdfResource, registerWindowPrintHandlers } from './windowPrintHandlers';

describe('rendu PDF isolé (#1880)', () => {
  it('seuls le HTML temporaire et les data: URL sont chargés', () => {
    const tmp = '/tmp';
    expect(isAllowedPdfResource('file:///tmp/bp-pdf-abc/print.html', tmp)).toBe(true);
    expect(isAllowedPdfResource('data:image/png;base64,AA', tmp)).toBe(true);
    expect(isAllowedPdfResource('file:///home/u/.ssh/id_rsa', tmp)).toBe(false);
    expect(isAllowedPdfResource('file:///tmp/bp-pdf-abc/../../home/u/a.txt', tmp)).toBe(false);
    expect(isAllowedPdfResource('http://evil.example/x.png', tmp)).toBe(false);
  });
});

describe('registerWindowPrintHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    openExternal.mockClear();
    registerWindowPrintHandlers({ getMainWindow: () => null });
  });

  it('enregistre les canaux fenêtre / impression / shell', () => {
    for (const ch of [
      'window:setSize',
      'window:print',
      'file:printHtml',
      'file:printHtmlToPDF',
      'perf:getEventLoopDelay',
      'shell:openExternal',
    ]) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  it('shell:openExternal : https uniquement', async () => {
    await handlers.get('shell:openExternal')!({}, 'http://evil.example/');
    await handlers.get('shell:openExternal')!({}, 'file:///etc/passwd');
    expect(openExternal).not.toHaveBeenCalled();
    await handlers.get('shell:openExternal')!({}, 'https://github.com/klinnex');
    expect(openExternal).toHaveBeenCalledWith('https://github.com/klinnex');
  });

  it('sans fenêtre : setSize et print sont sans effet', async () => {
    expect(handlers.get('window:setSize')!({}, 1200, 800)).toBeUndefined();
    await expect(handlers.get('window:print')!({})).resolves.toBeUndefined();
  });
});
