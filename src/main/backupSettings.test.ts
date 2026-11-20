import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AUTOSAVE_FILE_NAME,
  defaultBackupDir,
  readBackupSettings,
  resolveBackupDir,
  sanitizeBackupDir,
  writeBackupSettings,
} from './backupSettings';

const tmpDirs: string[] = [];
const makeTmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-backup-'));
  tmpDirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('sanitizeBackupDir', () => {
  it('accepte un chemin absolu et le normalise', () => {
    expect(sanitizeBackupDir('  /home/club//sauvegardes/ ')).toBe(
      path.normalize('/home/club/sauvegardes/')
    );
  });

  it('refuse vide, relatif, octet nul ou non-texte', () => {
    for (const bad of ['', '   ', 'relatif/dossier', '/x\0y', 42, null, undefined]) {
      expect(sanitizeBackupDir(bad)).toBeNull();
    }
  });
});

describe('dossier par défaut', () => {
  it('vaut <Documents>/BellePoule sans réglage', () => {
    const userData = makeTmp();
    const docs = '/home/u/Documents';
    expect(resolveBackupDir(userData, docs)).toEqual({
      dir: defaultBackupDir(docs),
      isDefault: true,
    });
    expect(defaultBackupDir(docs)).toBe(path.join(docs, 'BellePoule'));
  });

  it('un réglage invalide dans le fichier retombe sur le défaut', () => {
    const userData = makeTmp();
    fs.writeFileSync(path.join(userData, 'backup-settings.json'), '{"dir":"relatif"}');
    expect(readBackupSettings(userData)).toEqual({});
    expect(resolveBackupDir(userData, '/d').isDefault).toBe(true);
  });

  it('fichier corrompu : pas d’exception, défaut', () => {
    const userData = makeTmp();
    fs.writeFileSync(path.join(userData, 'backup-settings.json'), '{pas du json');
    expect(readBackupSettings(userData)).toEqual({});
  });
});

describe('réglage utilisateur', () => {
  it('écrit puis relit le dossier choisi', () => {
    const userData = makeTmp();
    const chosen = path.join(makeTmp(), 'Club');
    writeBackupSettings(userData, { dir: chosen });
    expect(resolveBackupDir(userData, '/d')).toEqual({ dir: chosen, isDefault: false });
  });

  it('réinitialiser (réglage vide) rétablit le défaut', () => {
    const userData = makeTmp();
    writeBackupSettings(userData, { dir: makeTmp() });
    writeBackupSettings(userData, {});
    expect(resolveBackupDir(userData, '/d/Documents').isDefault).toBe(true);
  });

  it('le nom de la sauvegarde automatique est fixe', () => {
    expect(AUTOSAVE_FILE_NAME).toMatch(/\.bpm$/);
  });
});
