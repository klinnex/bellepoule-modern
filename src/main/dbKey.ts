/**
 * BellePoule Modern - Clé de chiffrement de la base (SQLCipher, #1882)
 * Licensed under GPL-3.0
 *
 * Clé aléatoire de 256 bits, stockée chiffrée par safeStorage (Keychain / DPAPI / libsecret)
 * dans `<userData>/db-key.bin`. Pas de mot de passe : la clé n'est lisible que par le compte
 * système qui l'a créée. Trousseau indisponible → `null` (base en clair, signalé dans le journal).
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { DB_KEY_BYTES, isEncryptedDatabaseFile } from '../database/encryption';

export const DB_KEY_FILE = 'db-key.bin';

/** Sous-ensemble de `safeStorage` (Electron) utilisé ici */
export interface KeyVault {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * Renvoie la clé de la base, en la créant au premier lancement.
 * - trousseau indisponible → null ;
 * - fichier présent mais illisible (compte, trousseau réinitialisé) → exception ;
 * - base déjà chiffrée mais fichier de clé absent → exception.
 * On ne crée jamais une nouvelle clé pour une base existante.
 */
export function loadOrCreateDatabaseKey(
  userDataPath: string,
  vault: KeyVault,
  dbFile: string
): Buffer | null {
  if (!vault.isEncryptionAvailable()) return null;
  const file = path.join(userDataPath, DB_KEY_FILE);

  if (fs.existsSync(file)) {
    const blob = fs.readFileSync(file);
    let hex: string;
    try {
      hex = vault.decryptString(blob);
    } catch {
      throw new Error(
        `Clé de la base illisible (${file}) : le trousseau système a changé ou le fichier est corrompu.`
      );
    }
    const key = Buffer.from(hex, 'hex');
    if (key.length !== DB_KEY_BYTES) throw new Error(`Clé de la base invalide (${file}).`);
    return key;
  }

  if (isEncryptedDatabaseFile(dbFile)) {
    throw new Error(
      `La base ${dbFile} est chiffrée mais la clé (${file}) est absente : ouverture impossible.`
    );
  }
  const key = randomBytes(DB_KEY_BYTES);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(tmp, vault.encryptString(key.toString('hex')), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return key;
}
