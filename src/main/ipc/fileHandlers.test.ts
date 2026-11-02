import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  app: { getAppPath: () => '/opt/app', getPath: () => '/tmp' },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));

import { registerFileHandlers } from './fileHandlers';

describe('registerFileHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    registerFileHandlers({ db: {} as never, getMainWindow: () => null });
  });

  it('enregistre les canaux file:* et dialog:*', () => {
    expect([...handlers.keys()].sort()).toEqual([
      'dialog:openFile',
      'dialog:saveFile',
      'file:export',
      'file:exportFencersArchive',
      'file:exportPhotos',
      'file:import',
      'file:importFencersArchive',
      'file:importPhotos',
      'file:writeContent',
    ]);
  });

  it('refuse d’écrire un chemin non autorisé par une boîte de dialogue (#1146)', async () => {
    await expect(handlers.get('file:writeContent')!({}, '/etc/passwd', 'x')).rejects.toThrow();
  });
});
