import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData, quit: vi.fn(), isPackaged: false },
  BrowserWindow: class {},
  ipcMain: { once: vi.fn() },
  screen: {},
}));
vi.mock('./versionInfo', () => ({ getVersionInfo: () => ({ version: '0.0.0', build: 0 }) }));

import { readSavedLanguage, saveLanguageToFile, closeSplash } from './splash';

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

  it('closeSplash sans fenêtre appelle le rappel immédiatement', () => {
    const cb = vi.fn();
    closeSplash(cb);
    expect(cb).toHaveBeenCalledOnce();
  });
});
