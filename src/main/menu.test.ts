import { describe, it, expect, vi } from 'vitest';

let template: any[] = [];

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn() },
  Menu: {
    buildFromTemplate: (t: any[]) => {
      template = t;
      return {};
    },
    setApplicationMenu: vi.fn(),
  },
}));

import { createMenu } from './menu';

function build(forceSave = vi.fn()) {
  const send = vi.fn();
  const actions = {
    handleOpenFile: vi.fn(),
    saveGlobalBackup: vi.fn(async () => {}),
    handleSaveAs: vi.fn(),
    handleExport: vi.fn(),
    handleImport: vi.fn(),
    showAbout: vi.fn(),
    startRemoteScoreServer: vi.fn(),
    stopRemoteScoreServer: vi.fn(),
  };
  createMenu(
    {
      db: { forceSave },
      getMainWindow: () => ({ webContents: { send } }) as never,
      getAutoUpdater: () => null,
      actions,
    },
    'fr'
  );
  return { send, actions, forceSave };
}

const find = (items: any[], label: string): any => items.find(i => i.label === label);

describe('createMenu (#1341)', () => {
  it('construit un menu avec plusieurs sections', () => {
    build();
    expect(template.length).toBeGreaterThanOrEqual(4);
  });

  it('Ctrl+S force la sauvegarde et notifie le renderer', () => {
    const { send, forceSave, actions } = build();
    const save = template
      .flatMap(m => (Array.isArray(m.submenu) ? m.submenu : []))
      .find((i: any) => i.accelerator === 'CmdOrCtrl+S');
    save.click();
    expect(forceSave).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('menu:save');
    expect(actions.saveGlobalBackup).toHaveBeenCalled();
  });

  it('échec de sauvegarde : signale autosave:failed', () => {
    const { send } = build(
      vi.fn(() => {
        throw new Error('disque plein');
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = template
      .flatMap(m => (Array.isArray(m.submenu) ? m.submenu : []))
      .find((i: any) => i.accelerator === 'CmdOrCtrl+S');
    save.click();
    expect(send).toHaveBeenCalledWith('autosave:failed');
    expect(find(template, 'x')).toBeUndefined();
  });
});
