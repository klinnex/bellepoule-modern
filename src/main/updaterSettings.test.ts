import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readUpdaterSettings, resolveChannel, writeUpdaterSettings } from './updaterSettings';

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

  it('persiste le canal choisi, ignore une valeur invalide', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    writeUpdaterSettings(dir, { autoCheck: true, channel: 'stable' });
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: true, channel: 'stable' });
    fs.writeFileSync(path.join(dir, 'updater-settings.json'), '{"channel":"nightly"}');
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: true });
  });

  it('resolveChannel : choix utilisateur prioritaire sur le paquet', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    expect(resolveChannel({ autoCheck: true }, 'stable')).toBe('stable');
    expect(resolveChannel({ autoCheck: true }, 'dev')).toBe('dev');
    expect(resolveChannel({ autoCheck: true }, undefined)).toBe('dev');
    expect(resolveChannel({ autoCheck: true, channel: 'dev' }, 'stable')).toBe('dev');
    expect(resolveChannel({ autoCheck: true, channel: 'stable' }, 'dev')).toBe('stable');
  });
});
