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

import { registerWindowPrintHandlers } from './windowPrintHandlers';

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
