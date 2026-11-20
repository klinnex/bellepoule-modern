import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isUsableDownloadDir,
  readUpdaterSettings,
  resolveChannel,
  writeUpdaterSettings,
} from './updaterSettings';

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

  it('conserve cleanupExe (ancien exe portable à supprimer)', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    writeUpdaterSettings(dir, { autoCheck: false, cleanupExe: 'D:\\bp\\old.exe' });
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: false, cleanupExe: 'D:\\bp\\old.exe' });
  });

  it('répertoire de téléchargement : persisté, absent par défaut', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    expect(readUpdaterSettings(dir).downloadDir).toBeUndefined();
    writeUpdaterSettings(dir, { autoCheck: true, downloadDir: dir });
    expect(readUpdaterSettings(dir)).toEqual({ autoCheck: true, downloadDir: dir });
    writeUpdaterSettings(dir, { autoCheck: true });
    expect(readUpdaterSettings(dir).downloadDir).toBeUndefined();
  });

  it('isUsableDownloadDir : dossier absolu existant uniquement', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upds-'));
    expect(isUsableDownloadDir(dir)).toBe(true);
    expect(isUsableDownloadDir(path.join(dir, 'absent'))).toBe(false);
    expect(isUsableDownloadDir('relatif/dir')).toBe(false);
    expect(isUsableDownloadDir(42)).toBe(false);
    const f = path.join(dir, 'f.txt');
    fs.writeFileSync(f, 'x');
    expect(isUsableDownloadDir(f)).toBe(false);
  });
});
