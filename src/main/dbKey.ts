/**
 * BellePoule Modern - Clé de chiffrement de la base (SQLCipher, #1882)
 * Licensed under GPL-3.0
 *
 * Clé aléatoire de 256 bits, stockée chiffrée par safeStorage (Keychain / DPAPI / libsecret)
 * dans `<userData>/db-key.bin`. Pas de mot de passe : la clé n'est lisible que par le compte
 * système qui l'a créée. Trousseau indisponible → `null` (base en clair, signalé dans le journal).
 * API asynchrone de safeStorage (#1988) : même format de fichier que l'API synchrone.
 */
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { DB_KEY_BYTES, isEncryptedDatabaseFile } from '../database/encryption';
import { writeSecretFile, type SecretVault } from './secretVault';

export const DB_KEY_FILE = 'db-key.bin';

/** Sous-ensemble de `safeStorage` (Electron) utilisé ici */
export type KeyVault = SecretVault;

/**
 * Renvoie la clé de la base, en la créant au premier lancement.
 * - trousseau indisponible → null ;
 * - fichier présent mais illisible (compte, trousseau réinitialisé) → exception ;
 * - base déjà chiffrée mais fichier de clé absent → exception.
 * On ne crée jamais une nouvelle clé pour une base existante.
 */
export async function loadOrCreateDatabaseKey(
  userDataPath: string,
  vault: KeyVault,
  dbFile: string
): Promise<Buffer | null> {
  if (!(await vault.isAsyncEncryptionAvailable())) return null;
  const file = path.join(userDataPath, DB_KEY_FILE);

  if (fs.existsSync(file)) {
    const blob = await fsp.readFile(file);
    let decrypted: { result: string; shouldReEncrypt: boolean };
    try {
      decrypted = await vault.decryptStringAsync(blob);
    } catch {
      throw new Error(
        `Clé de la base illisible (${file}) : le trousseau système a changé ou le fichier est corrompu.`
      );
    }
    const hex = decrypted.result;
    const key = Buffer.from(hex, 'hex');
    if (key.length !== DB_KEY_BYTES) throw new Error(`Clé de la base invalide (${file}).`);
    if (decrypted.shouldReEncrypt) {
      // Clé du trousseau renouvelée : même clé de base, rechiffrée
      try {
        await writeSecretFile(file, await vault.encryptStringAsync(hex));
      } catch {
        /* sans effet sur l'ouverture */
      }
    }
    return key;
  }

  if (isEncryptedDatabaseFile(dbFile)) {
    throw new Error(
      `La base ${dbFile} est chiffrée mais la clé (${file}) est absente : ouverture impossible.`
    );
  }
  const key = randomBytes(DB_KEY_BYTES);
  await fsp.mkdir(userDataPath, { recursive: true });
  await writeSecretFile(file, await vault.encryptStringAsync(key.toString('hex')));
  return key;
}
