import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DB_KEY_FILE, loadOrCreateDatabaseKey, type KeyVault } from './dbKey';

/** Faux trousseau : « chiffrement » réversible, suffisant pour tester la logique */
function fakeVault(available = true): KeyVault {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b: Buffer) => {
      const s = b.toString('utf8');
      if (!s.startsWith('enc:')) throw new Error('bad blob');
      return s.slice(4);
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

  it('crée une clé de 256 bits au premier lancement, stockée chiffrée', () => {
    const key = loadOrCreateDatabaseKey(dir, fakeVault(), dbFile);
    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
    const stored = fs.readFileSync(path.join(dir, DB_KEY_FILE), 'utf8');
    expect(stored.startsWith('enc:')).toBe(true);
    expect(stored.includes(key!.toString('hex'))).toBe(true); // présent seulement via le trousseau
  });

  it('relit la même clé aux lancements suivants', () => {
    const first = loadOrCreateDatabaseKey(dir, fakeVault(), dbFile);
    const second = loadOrCreateDatabaseKey(dir, fakeVault(), dbFile);
    expect(second!.equals(first!)).toBe(true);
  });

  it('trousseau indisponible : pas de clé (base en clair signalée par l’appelant)', () => {
    expect(loadOrCreateDatabaseKey(dir, fakeVault(false), dbFile)).toBeNull();
    expect(fs.existsSync(path.join(dir, DB_KEY_FILE))).toBe(false);
  });

  it('fichier de clé illisible : erreur, aucune nouvelle clé générée', () => {
    fs.writeFileSync(path.join(dir, DB_KEY_FILE), 'corrompu');
    expect(() => loadOrCreateDatabaseKey(dir, fakeVault(), dbFile)).toThrow(/illisible/);
    expect(fs.readFileSync(path.join(dir, DB_KEY_FILE), 'utf8')).toBe('corrompu');
  });

  it('base chiffrée sans fichier de clé : erreur, pas de nouvelle clé', () => {
    fs.writeFileSync(dbFile, Buffer.concat([Buffer.from('SQLCIPHER-ENC'), Buffer.alloc(64, 3)]));
    expect(() => loadOrCreateDatabaseKey(dir, fakeVault(), dbFile)).toThrow(/clé.*absente/);
    expect(fs.existsSync(path.join(dir, DB_KEY_FILE))).toBe(false);
  });
});
