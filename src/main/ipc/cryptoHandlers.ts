/**
 * BellePoule Modern - Handlers IPC `crypto:*` : safeStorage (Keychain/DPAPI/libsecret)
 * pour les secrets locaux, ex. clé de synchronisation cloud. Renvoie une chaîne base64
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { ipcMain, safeStorage } from 'electron';

export function registerCryptoHandlers(): void {
  ipcMain.handle('crypto:isAvailable', async () => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle('crypto:protect', async (_, plaintext: string) => {
    if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.encryptString(plaintext).toString('base64');
  });

  ipcMain.handle('crypto:unprotect', async (_, ciphertextB64: string) => {
    if (typeof ciphertextB64 !== 'string') throw new Error('ciphertext must be a string');
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(ciphertextB64, 'base64'));
  });
}
