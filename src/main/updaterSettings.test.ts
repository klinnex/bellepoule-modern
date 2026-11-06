import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readUpdaterSettings, writeUpdaterSettings } from './updaterSettings';

describe('updaterSettings', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('vérification auto activée par défaut', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: true });
  });

  it('persiste la désactivation', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    writeUpdaterSettings(dir, { autoCheck: false });
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: false });
  });

  it('JSON invalide → défaut', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    fs.writeFileSync(path.join(dir, 'updater-settings.json'), '{oops');
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: true });
    fs.writeFileSync(path.join(dir, 'updater-settings.json'), '{"autoCheck":"no"}');
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: true });
  });
});
