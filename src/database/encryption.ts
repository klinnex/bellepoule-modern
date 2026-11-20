/**
 * BellePoule Modern - Chiffrement au repos de la base (SQLCipher, #1882)
 * Licensed under GPL-3.0
 *
 * - Moteur : better-sqlite3-multiple-ciphers en mode `cipher='sqlcipher'` (format SQLCipher 4).
 * - Clé : 256 bits aléatoires, fournie par l'appelant (main : trousseau via safeStorage).
 * - Base en clair existante → migrée en place : copie, `rekey` de la copie, vérification,
 *   remplacement atomique, puis écrasement de l'ancien fichier avant suppression.
 * - Une base chiffrée sans clé, ou avec une mauvaise clé, est refusée (jamais écrasée).
 */
import Database from 'better-sqlite3-multiple-ciphers';
import * as fs from 'fs';
import { randomBytes } from 'crypto';

/** En-tête d'une base SQLite en clair */
const PLAIN_HEADER = Buffer.from('SQLite format 3\0', 'ascii');
export const DB_KEY_BYTES = 32;

/** Erreur explicite (affichée à l'utilisateur) : base illisible sans la bonne clé */
export class DatabaseEncryptionError extends Error {}

/** Vrai si le fichier existe, n'est pas vide et commence par l'en-tête SQLite en clair */
export function isPlainSqliteFile(file: string): boolean {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r', 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
  try {
    const head = Buffer.alloc(PLAIN_HEADER.length);
    const read = fs.readSync(fd, head, 0, head.length, 0);
    return read === PLAIN_HEADER.length && head.equals(PLAIN_HEADER);
  } finally {
    fs.closeSync(fd);
  }
}

/** Vrai si le fichier est non vide et ne ressemble pas à une base en clair (donc chiffré) */
export function isEncryptedDatabaseFile(file: string): boolean {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
  return size > 0 && !isPlainSqliteFile(file);
}

function keyLiteral(key: Buffer): string {
  if (key.length !== DB_KEY_BYTES) throw new Error('Clé de base invalide (256 bits attendus)');
  return `"x'${key.toString('hex')}'"`;
}

/** Applique la clé SQLCipher à une connexion (doit précéder toute lecture) */
export function applyDatabaseKey(db: Database.Database, key: Buffer): void {
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`key=${keyLiteral(key)}`);
}

/** Ouvre une base chiffrée et vérifie la clé ; ferme et rejette sinon */
export function openEncryptedDatabase(file: string, key: Buffer): Database.Database {
  const db = new Database(file);
  try {
    applyDatabaseKey(db, key);
    db.prepare('SELECT count(*) AS n FROM sqlite_master').get();
    return db;
  } catch {
    db.close();
    throw new DatabaseEncryptionError(
      `Impossible de déchiffrer la base (${file}) : clé incorrecte ou fichier endommagé. ` +
        `La base n'a pas été modifiée.`
    );
  }
}

/**
 * Ouvre la base principale.
 * - `key` null : base en clair (poste sans trousseau, fichiers importés). Refuse une base chiffrée.
 * - `key` fournie : migre une base en clair existante, puis ouvre en chiffré.
 */
export function openDatabaseFile(file: string, key: Buffer | null): Database.Database {
  if (!key) {
    if (isEncryptedDatabaseFile(file)) {
      throw new DatabaseEncryptionError(
        `La base ${file} est chiffrée : clé de chiffrement requise pour l'ouvrir.`
      );
    }
    return new Database(file);
  }
  if (isPlainSqliteFile(file)) encryptPlainDatabaseFile(file, key);
  else cleanupInterruptedMigration(file, key);
  return openEncryptedDatabase(file, key);
}

/** Écrase le contenu d'un fichier de zéros avant suppression (best effort, cf. docs/RGPD.md) */
export function shredFile(file: string): void {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r+', 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  try {
    // Taille lue sur le descripteur ouvert : pas de vérification par chemin puis ouverture
    const size = fs.fstatSync(fd).size;
    const zeros = Buffer.alloc(Math.min(size, 1 << 20));
    for (let off = 0; off < size; off += zeros.length) {
      fs.writeSync(fd, zeros, 0, Math.min(zeros.length, size - off), off);
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.unlinkSync(file);
}

function removeSidecars(file: string): void {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    fs.rmSync(`${file}${suffix}`, { force: true });
  }
}

/** Fichier de migration intermédiaire / ancienne version en clair laissés par un arrêt brutal */
const MIGRATION_TMP = '.enc-tmp';
/** Nom de copie imprévisible : évite toute collision avec un fichier préexistant */
function migrationTmpName(file: string): string {
  return `${file}.${randomBytes(8).toString('hex')}${MIGRATION_TMP}`;
}
const PLAIN_OLD = '.plain-old';

/**
 * Migre une base en clair vers un fichier chiffré, en place.
 * Étapes : checkpoint + copie → rekey de la copie → vérification → remplacement → écrasement.
 * En cas d'échec avant le remplacement, la base en clair d'origine reste intacte.
 */
export function encryptPlainDatabaseFile(file: string, key: Buffer): void {
  const tmp = migrationTmpName(file);

  // 1. Tout dans le fichier principal (pas de WAL), puis copie
  const src = new Database(file);
  try {
    src.pragma('wal_checkpoint(TRUNCATE)');
    src.pragma('journal_mode = DELETE');
  } finally {
    src.close();
  }
  removeSidecars(file);
  // COPYFILE_EXCL : échoue plutôt que d'écraser un fichier apparu entre-temps
  fs.copyFileSync(file, tmp, fs.constants.COPYFILE_EXCL);

  try {
    // 2. Chiffrement de la copie
    const enc = new Database(tmp);
    try {
      enc.pragma(`cipher='sqlcipher'`);
      enc.pragma(`rekey=${keyLiteral(key)}`);
    } finally {
      enc.close();
    }
    // 3. Vérification : ouverture avec la clé + intégrité, même nombre d'objets que l'original
    const check = openEncryptedDatabase(tmp, key);
    try {
      const quick = check.pragma('quick_check(1)', { simple: true });
      if (quick !== 'ok')
        throw new DatabaseEncryptionError(`Intégrité après chiffrement : ${quick}`);
    } finally {
      check.close();
    }
    removeSidecars(tmp);
  } catch (e) {
    removeSidecars(tmp);
    fs.rmSync(tmp, { force: true });
    throw e;
  }

  // 4. Remplacement : l'original en clair est mis de côté, la copie chiffrée prend sa place
  const old = `${file}${PLAIN_OLD}`;
  fs.renameSync(file, old);
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.renameSync(old, file);
    throw e;
  }
  // 5. Ancien fichier en clair écrasé puis supprimé
  shredFile(old);
}

/** Nettoyage après une migration interrompue : ancien fichier en clair restant, si la base chiffrée est saine */
export function cleanupInterruptedMigration(file: string, key: Buffer): void {
  // Base chiffrée saine requise ; shredFile ignore un ancien fichier absent
  if (!isEncryptedDatabaseFile(file)) return;
  openEncryptedDatabase(file, key).close();
  shredFile(`${file}${PLAIN_OLD}`);
}
