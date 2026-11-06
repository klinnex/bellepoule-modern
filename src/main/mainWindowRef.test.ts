import { describe, it, expect } from 'vitest';
import type { BrowserWindow } from 'electron';
import { getSharedMainWindow, setSharedMainWindow } from './mainWindowRef';

describe('mainWindowRef', () => {
  it('renvoie null par défaut puis la fenêtre définie', () => {
    setSharedMainWindow(null);
    expect(getSharedMainWindow()).toBeNull();
    const win = { isDestroyed: () => false } as unknown as BrowserWindow;
    setSharedMainWindow(win);
    expect(getSharedMainWindow()).toBe(win);
  });

  it('renvoie null si la fenêtre est détruite', () => {
    setSharedMainWindow({ isDestroyed: () => true } as unknown as BrowserWindow);
    expect(getSharedMainWindow()).toBeNull();
  });
});
