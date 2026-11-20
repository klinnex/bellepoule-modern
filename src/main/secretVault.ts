/**
 * BellePoule Modern - Sous-ensemble asynchrone de `safeStorage` (Electron) : Keychain / DPAPI /
 * libsecret. L'API synchrone est dépréciée (#1988) ; l'asynchrone ne bloque pas le thread
 * principal pendant le déverrouillage du trousseau. Injecté pour les tests.
 * Licensed under GPL-3.0
 */
import * as fsp from 'fs/promises';

export interface SecretVault {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  /** `shouldReEncrypt` : clé du trousseau changée, réenregistrer le secret rechiffré */
  decryptStringAsync(encrypted: Buffer): Promise<{ shouldReEncrypt: boolean; result: string }>;
}

/** Écriture atomique (fichier temporaire + renommage), lisible par le seul compte courant */
export async function writeSecretFile(file: string, data: Buffer): Promise<void> {
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, data, { mode: 0o600 });
  await fsp.rename(tmp, file);
}
