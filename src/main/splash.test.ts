import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData, quit: vi.fn(), isPackaged: false },
  BrowserWindow: class {},
  ipcMain: { once: vi.fn(), handle: vi.fn() },
  screen: {},
}));
vi.mock('./versionInfo', () => ({ getVersionInfo: () => ({ version: '0.0.0', build: 0 }) }));

import {
  readSavedLanguage,
  saveLanguageToFile,
  closeSplash,
  isSplashEnabled,
  setSplashEnabled,
} from './splash';

describe('splash : langue mémorisée (#1341)', () => {
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-splash-'));
  });
  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
  });

  it('fr par défaut sans fichier', () => {
    expect(readSavedLanguage()).toBe('fr');
  });

  it('aller-retour de la langue enregistrée', () => {
    saveLanguageToFile('de');
    expect(readSavedLanguage()).toBe('de');
  });

  it('fichier corrompu : repli sur fr', () => {
    fs.writeFileSync(path.join(userData, 'bellepoule-language.json'), '{pas du json');
    expect(readSavedLanguage()).toBe('fr');
  });

  it('splash activé par défaut', () => {
    expect(isSplashEnabled()).toBe(true);
  });

  it('désactivation du splash conserve la langue', () => {
    saveLanguageToFile('it');
    setSplashEnabled(false);
    expect(isSplashEnabled()).toBe(false);
    expect(readSavedLanguage()).toBe('it');
    saveLanguageToFile('en');
    expect(isSplashEnabled()).toBe(false);
    setSplashEnabled(true);
    expect(isSplashEnabled()).toBe(true);
  });

  it('closeSplash sans fenêtre appelle le rappel immédiatement', () => {
    const cb = vi.fn();
    closeSplash(cb);
    expect(cb).toHaveBeenCalledOnce();
  });
});
