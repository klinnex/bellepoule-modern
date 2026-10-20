import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import {
  AUTH_TTL_MS,
  ZIP_LIMITS,
  _resetPathAuthorization,
  assertAuthorizedPath,
  authorizePath,
  checkZipEntries,
  isSafeZipEntryName,
  readBoundedFile,
  validateImportedFencers,
} from './pathAuthorization';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-auth-'));
let t = 0;

beforeEach(() => {
  t = 1000;
  _resetPathAuthorization(() => t);
});

describe('chemins autorisés (#1146)', () => {
  it('refuse un chemin jamais choisi par dialogue', () => {
    expect(() => assertAuthorizedPath(path.join(tmp, 'x.csv'), 'write')).toThrow(/not authorized/);
  });
  it('accepte un chemin autorisé, refuse l’autre sens', () => {
    const p = path.join(tmp, 'a.csv');
    authorizePath(p, 'write');
    expect(assertAuthorizedPath(p, 'write')).toBe(p);
    expect(() => assertAuthorizedPath(p, 'read')).toThrow();
  });
  it('refuse chemins relatifs et octet nul', () => {
    expect(() => assertAuthorizedPath('rel.csv', 'write')).toThrow();
    expect(() => assertAuthorizedPath(path.join(tmp, 'a\0.csv'), 'write')).toThrow();
  });
  it('autorisation expirée', () => {
    const p = path.join(tmp, 'b.csv');
    authorizePath(p, 'write');
    t += AUTH_TTL_MS + 1;
    expect(() => assertAuthorizedPath(p, 'write')).toThrow();
  });
  it('refuse extensions exécutables en écriture', () => {
    const p = path.join(tmp, 'evil.exe');
    authorizePath(p, 'write');
    expect(() => assertAuthorizedPath(p, 'write')).toThrow(/extension/);
  });
  it('contrôle l’extension attendue en lecture', () => {
    const p = path.join(tmp, 'a.txt');
    authorizePath(p, 'read');
    expect(() => assertAuthorizedPath(p, 'read', ['.zip'])).toThrow();
  });
  it('refuse un lien symbolique', () => {
    const target = path.join(tmp, 'real.zip');
    const link = path.join(tmp, 'link.zip');
    fs.writeFileSync(target, 'x');
    fs.symlinkSync(target, link);
    authorizePath(link, 'read');
    expect(() => assertAuthorizedPath(link, 'read', ['.zip'])).toThrow(/Symbolic/);
  });
});

describe('limites ZIP (#1146)', () => {
  it('noms d’entrée dangereux', () => {
    expect(isSafeZipEntryName('a/b.jpg')).toBe(true);
    for (const n of ['../x.jpg', 'a/../../x', '/etc/passwd', 'C:/x', 'a\\b', ''])
      expect(isSafeZipEntryName(n)).toBe(false);
  });
  it('ne renvoie que des noms sûrs (JSZip neutralise déjà ../)', async () => {
    const zip = new JSZip();
    zip.file('../x.jpg', 'a');
    zip.file('ok.jpg', 'b');
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
    const names = checkZipEntries(loaded);
    expect(names).toContain('ok.jpg');
    expect(names.every(n => !n.includes('..') && !n.startsWith('/'))).toBe(true);
  });
  it('refuse trop d’entrées', async () => {
    const zip = new JSZip();
    for (let i = 0; i <= ZIP_LIMITS.maxEntries; i++) zip.file(`${i}.jpg`, 'x');
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(() => checkZipEntries(loaded)).toThrow(/entrées/);
  });
  it('refuse une bombe (entrée trop grosse décompressée)', async () => {
    const zip = new JSZip();
    zip.file('big.jpg', Buffer.alloc(ZIP_LIMITS.maxEntryBytes + 1));
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(buf.length).toBeLessThan(200_000);
    const loaded = await JSZip.loadAsync(buf);
    expect(() => checkZipEntries(loaded)).toThrow(/volumineuse/);
  });
  it('refuse un fichier trop gros avant lecture', async () => {
    const f = path.join(tmp, 'huge.zip');
    fs.writeFileSync(f, '');
    fs.truncateSync(f, ZIP_LIMITS.maxFileBytes + 1);
    await expect(readBoundedFile(f)).rejects.toThrow(/volumineux/);
  });
});

describe('validation fencers.json (#1146)', () => {
  it('accepte une liste valide', () => {
    expect(validateImportedFencers([{ lastName: 'A', firstName: 'B', club: 'C' }])).toHaveLength(1);
  });
  it('refuse non-tableau, éléments mal formés, champs trop longs', () => {
    expect(() => validateImportedFencers({})).toThrow();
    expect(() => validateImportedFencers([null])).toThrow();
    expect(() => validateImportedFencers([{ lastName: 'A' }])).toThrow();
    expect(() =>
      validateImportedFencers([{ lastName: 'A'.repeat(300), firstName: 'B' }])
    ).toThrow();
    expect(() => validateImportedFencers([{ lastName: 'A', firstName: 'B', club: 5 }])).toThrow();
  });
});
