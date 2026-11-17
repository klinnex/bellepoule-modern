import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DatabaseEncryptionError,
  cleanupInterruptedMigration,
  encryptPlainDatabaseFile,
  isEncryptedDatabaseFile,
  isPlainSqliteFile,
  openDatabaseFile,
} from './encryption';

// better-sqlite3-multiple-ciphers natif : recompilé pour Electron en CI (postinstall) → test ignoré si non chargeable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null;
try {
  Database = require('better-sqlite3-multiple-ciphers');
  new Database(':memory:').close();
} catch {
  Database = null;
}

const SECRET = 'DONNEE-PERSONNELLE-SECRETE';
const KEY = Buffer.alloc(32, 0x5a);
const OTHER_KEY = Buffer.alloc(32, 0x11);

function makePlainDb(file: string): void {
  const db = new Database(file);
  db.exec(`CREATE TABLE fencers (id TEXT PRIMARY KEY, last_name TEXT);
    INSERT INTO fencers VALUES ('f1', '${SECRET}');`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}

function makeEncryptedDb(file: string, key: Buffer): void {
  const db = openDatabaseFile(file, key);
  db.exec('CREATE TABLE t (a TEXT)');
  db.close();
}

describe.skipIf(!Database)('chiffrement au repos (SQLCipher, #1882)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-enc-'));
    file = path.join(dir, 'bellepoule.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('une base créée avec clé ne contient pas la donnée en clair', () => {
    openDatabaseFile(file, KEY).close();
    const enc = openDatabaseFile(file, KEY);
    enc.exec(`CREATE TABLE fencers (id TEXT PRIMARY KEY, last_name TEXT);
      INSERT INTO fencers VALUES ('f1', '${SECRET}');`);
    enc.pragma('wal_checkpoint(TRUNCATE)');
    enc.close();
    expect(isEncryptedDatabaseFile(file)).toBe(true);
    expect(isPlainSqliteFile(file)).toBe(false);
    expect(fs.readFileSync(file).includes(SECRET)).toBe(false);
  });

  it('une base en clair existante est migrée en place et reste lisible avec la clé', () => {
    makePlainDb(file);
    expect(isPlainSqliteFile(file)).toBe(true);

    const db = openDatabaseFile(file, KEY);
    const row = db.prepare('SELECT last_name FROM fencers').get() as { last_name: string };
    expect(row.last_name).toBe(SECRET);
    db.close();

    expect(isEncryptedDatabaseFile(file)).toBe(true);
    expect(fs.readFileSync(file).includes(SECRET)).toBe(false);
    // Plus aucun fichier intermédiaire ni ancienne version en clair
    expect(fs.existsSync(`${file}.plain-old`)).toBe(false);
    expect(fs.existsSync(`${file}.enc-tmp`)).toBe(false);
  });

  it('une mauvaise clé est refusée sans modifier le fichier', () => {
    makeEncryptedDb(file, KEY);
    const before = fs.readFileSync(file);
    expect(() => openDatabaseFile(file, OTHER_KEY)).toThrow(DatabaseEncryptionError);
    expect(fs.readFileSync(file).equals(before)).toBe(true);
  });

  it('une base chiffrée sans clé est refusée', () => {
    makeEncryptedDb(file, KEY);
    expect(() => openDatabaseFile(file, null)).toThrow(DatabaseEncryptionError);
  });

  it('sans clé, une base en clair reste ouverte en clair (fichiers importés)', () => {
    makePlainDb(file);
    const db = openDatabaseFile(file, null);
    expect(db.prepare('SELECT count(*) AS n FROM fencers').get()).toEqual({ n: 1 });
    db.close();
    expect(isPlainSqliteFile(file)).toBe(true);
  });

  it('une migration interrompue laisse un ancien fichier en clair qui est écrasé au démarrage suivant', () => {
    makeEncryptedDb(file, KEY);
    const leftover = `${file}.plain-old`;
    fs.writeFileSync(leftover, 'contenu en clair restant');
    cleanupInterruptedMigration(file, KEY);
    expect(fs.existsSync(leftover)).toBe(false);
  });

  it('migration : la base d’origine est intacte si la vérification échoue', () => {
    makePlainDb(file);
    const before = fs.readFileSync(file);
    // Une clé vide (taille invalide) fait échouer la migration avant tout remplacement
    expect(() => encryptPlainDatabaseFile(file, Buffer.alloc(8))).toThrow();
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(fs.existsSync(`${file}.enc-tmp`)).toBe(false);
  });
});
