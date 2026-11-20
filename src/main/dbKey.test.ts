import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DB_KEY_FILE, loadOrCreateDatabaseKey, type KeyVault } from './dbKey';

/** Faux trousseau : « chiffrement » réversible, suffisant pour tester la logique */
function fakeVault(available = true): KeyVault {
  return {
    isAsyncEncryptionAvailable: async () => available,
    encryptStringAsync: async (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptStringAsync: async (b: Buffer) => {
      const s = b.toString('utf8');
      if (!s.startsWith('enc:')) throw new Error('bad blob');
      return { result: s.slice(4), shouldReEncrypt: false };
    },
  };
}

describe('clé de la base (SQLCipher, #1882)', () => {
  let dir: string;
  let dbFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-key-'));
    dbFile = path.join(dir, 'bellepoule.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('crée une clé de 256 bits au premier lancement, stockée chiffrée', async () => {
    const key = await loadOrCreateDatabaseKey(dir, fakeVault(), dbFile);
    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
    const stored = fs.readFileSync(path.join(dir, DB_KEY_FILE), 'utf8');
    expect(stored.startsWith('enc:')).toBe(true);
    expect(stored.includes(key!.toString('hex'))).toBe(true); // présent seulement via le trousseau
  });

  it('relit la même clé aux lancements suivants', async () => {
    const first = await loadOrCreateDatabaseKey(dir, fakeVault(), dbFile);
    const second = await loadOrCreateDatabaseKey(dir, fakeVault(), dbFile);
    expect(second!.equals(first!)).toBe(true);
  });

  it('trousseau indisponible : pas de clé (base en clair signalée par l’appelant)', async () => {
    expect(await loadOrCreateDatabaseKey(dir, fakeVault(false), dbFile)).toBeNull();
    expect(fs.existsSync(path.join(dir, DB_KEY_FILE))).toBe(false);
  });

  it('fichier de clé illisible : erreur, aucune nouvelle clé générée', async () => {
    fs.writeFileSync(path.join(dir, DB_KEY_FILE), 'corrompu');
    await expect(loadOrCreateDatabaseKey(dir, fakeVault(), dbFile)).rejects.toThrow(/illisible/);
    expect(fs.readFileSync(path.join(dir, DB_KEY_FILE), 'utf8')).toBe('corrompu');
  });

  it('base chiffrée sans fichier de clé : erreur, pas de nouvelle clé', async () => {
    fs.writeFileSync(dbFile, Buffer.concat([Buffer.from('SQLCIPHER-ENC'), Buffer.alloc(64, 3)]));
    await expect(loadOrCreateDatabaseKey(dir, fakeVault(), dbFile)).rejects.toThrow(/clé.*absente/);
    expect(fs.existsSync(path.join(dir, DB_KEY_FILE))).toBe(false);
  });

  it('clé du trousseau renouvelée : même clé de base, fichier rechiffré (#1988)', async () => {
    const first = await loadOrCreateDatabaseKey(dir, fakeVault(), dbFile);
    const rotated: KeyVault = {
      ...fakeVault(),
      encryptStringAsync: async (s: string) => Buffer.from(`enc:v2:${s}`, 'utf8'),
      decryptStringAsync: async (b: Buffer) => ({
        result: b.toString('utf8').replace(/^enc:(v2:)?/, ''),
        shouldReEncrypt: true,
      }),
    };
    const again = await loadOrCreateDatabaseKey(dir, rotated, dbFile);
    expect(again!.equals(first!)).toBe(true);
    const file = path.join(dir, DB_KEY_FILE);
    expect(fs.readFileSync(file, 'utf8')).toBe(`enc:v2:${first!.toString('hex')}`);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });
});
