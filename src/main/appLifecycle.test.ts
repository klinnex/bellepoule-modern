import { describe, it, expect, vi } from 'vitest';
import { handleAllWindowsClosed, shutdownDb, type LifecycleDb } from './appLifecycle';

function makeDb(open = true): LifecycleDb & { close: ReturnType<typeof vi.fn> } {
  let isOpen = open;
  return {
    isOpen: () => isOpen,
    saveSync: vi.fn(),
    close: vi.fn(() => {
      isOpen = false;
    }),
  };
}

describe('shutdownDb', () => {
  it('checkpoint puis ferme une base ouverte', () => {
    const db = makeDb(true);
    shutdownDb(db);
    expect(db.saveSync).toHaveBeenCalledTimes(1);
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('ne fait rien si la base est déjà fermée', () => {
    const db = makeDb(false);
    shutdownDb(db);
    expect(db.saveSync).not.toHaveBeenCalled();
    expect(db.close).not.toHaveBeenCalled();
  });
});

describe('handleAllWindowsClosed', () => {
  it('macOS : la base reste ouverte et l’app ne quitte pas', () => {
    const db = makeDb(true);
    const quit = vi.fn();
    handleAllWindowsClosed('darwin', db, quit);
    expect(db.close).not.toHaveBeenCalled();
    expect(db.isOpen()).toBe(true);
    expect(db.saveSync).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();
  });

  it('Windows / Linux : ferme la base puis quitte', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const db = makeDb(true);
      const quit = vi.fn();
      handleAllWindowsClosed(platform, db, quit);
      expect(db.close).toHaveBeenCalledTimes(1);
      expect(quit).toHaveBeenCalledTimes(1);
    }
  });
});
