import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ensurePrivateDir,
  getPendingJsonPath,
  isInsideDir,
  randomInstallerName,
  readPendingUpdate,
  writePendingUpdate,
} from './pendingUpdate';

describe('pendingUpdate', () => {
  let userData: string;
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-pu-'));
  });
  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
  });

  const mkInstaller = (): string => {
    const dir = ensurePrivateDir(userData);
    const p = path.join(dir, randomInstallerName('setup.exe'));
    fs.writeFileSync(p, 'x', { mode: 0o600 });
    return p;
  };

  it('relit un JSON valide', () => {
    const p = mkInstaller();
    writePendingUpdate(userData, {
      version: '1.0.0',
      path: p,
      sha256: 'a'.repeat(64),
      downloadedAt: 'now',
    });
    expect(readPendingUpdate(userData)?.path).toBe(p);
  });

  it('rejette un chemin hors du dossier privé', () => {
    const outside = path.join(userData, 'evil.exe');
    fs.writeFileSync(outside, 'x', { mode: 0o600 });
    writePendingUpdate(userData, { version: '1', path: outside, sha256: 'a', downloadedAt: 'n' });
    expect(readPendingUpdate(userData)).toBeNull();
  });

  it('rejette un traversal de chemin', () => {
    const p = path.join(userData, 'pending-update', '..', 'evil.exe');
    expect(isInsideDir(path.join(userData, 'pending-update'), p)).toBe(false);
  });

  it('rejette un JSON falsifié (champs manquants / invalide)', () => {
    ensurePrivateDir(userData);
    fs.writeFileSync(getPendingJsonPath(userData), '{"path":1}', { mode: 0o600 });
    expect(readPendingUpdate(userData)).toBeNull();
    fs.writeFileSync(getPendingJsonPath(userData), 'nope', { mode: 0o600 });
    expect(readPendingUpdate(userData)).toBeNull();
  });

  it.skipIf(process.platform === 'win32')('rejette des droits trop larges', () => {
    const p = mkInstaller();
    writePendingUpdate(userData, { version: '1', path: p, sha256: 'a', downloadedAt: 'n' });
    fs.chmodSync(p, 0o666);
    expect(readPendingUpdate(userData)).toBeNull();
    fs.chmodSync(p, 0o600);
    fs.chmodSync(getPendingJsonPath(userData), 0o666);
    expect(readPendingUpdate(userData)).toBeNull();
  });

  it('nom aléatoire sans traversal', () => {
    expect(randomInstallerName('../../x/setup.exe')).toMatch(/^[0-9a-f]{32}\.exe$/);
  });
});
