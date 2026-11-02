import { describe, it, expect, vi } from 'vitest';

const showSaveDialog = vi.fn();

vi.mock('electron', () => ({
  dialog: { showSaveDialog: (...a: unknown[]) => showSaveDialog(...a), showErrorBox: vi.fn() },
}));

import { createMenuActions } from './menuActions';

function setup(competition: { title: string } | null) {
  const send = vi.fn();
  const win = { webContents: { send } } as never;
  const db = {
    getCompetition: vi.fn(() => competition),
    exportCompetitionToFile: vi.fn(async () => {}),
    exportToFile: vi.fn(async () => {}),
  };
  const actions = createMenuActions({ db: db as never, getMainWindow: () => win });
  return { send, db, actions };
}

describe('createMenuActions (#1341)', () => {
  it('handleExport relaie le format au renderer', async () => {
    const { send, actions } = setup(null);
    await actions.handleExport('csv');
    expect(send).toHaveBeenCalledWith('menu:export', 'csv');
  });

  it('showAbout prévient le renderer', () => {
    const { send, actions } = setup(null);
    actions.showAbout();
    expect(send).toHaveBeenCalledWith('menu:show-about');
  });

  it('« Enregistrer sous » exporte la compétition courante, nom de fichier assaini', async () => {
    const { db, send, actions } = setup({ title: 'Open: <Paris>/2026' });
    actions.setCurrentCompetitionId('c1');
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/x.bpm' });
    await actions.handleSaveAs();
    expect(showSaveDialog.mock.calls[0][1].defaultPath).toBe('Open Paris2026.bpm');
    expect(db.exportCompetitionToFile).toHaveBeenCalledWith('c1', '/tmp/x.bpm');
    expect(send).toHaveBeenCalledWith('file:saved', '/tmp/x.bpm');
  });

  it('sans compétition courante : export global', async () => {
    const { db, actions } = setup(null);
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/g.bpm' });
    await actions.handleSaveAs();
    expect(db.exportToFile).toHaveBeenCalledWith('/tmp/g.bpm');
  });
});
