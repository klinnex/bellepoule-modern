import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
let available = true;

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
  safeStorage: {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ''),
  },
}));

import { registerCryptoHandlers } from './cryptoHandlers';

describe('registerCryptoHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    available = true;
    registerCryptoHandlers();
  });

  it('enregistre les trois canaux crypto:*', () => {
    expect([...handlers.keys()].sort()).toEqual([
      'crypto:isAvailable',
      'crypto:protect',
      'crypto:unprotect',
    ]);
  });

  it('protect / unprotect font l’aller-retour en base64', async () => {
    const enc = await handlers.get('crypto:protect')!({}, 'secret');
    expect(typeof enc).toBe('string');
    expect(await handlers.get('crypto:unprotect')!({}, enc)).toBe('secret');
  });

  it('renvoie null sans chiffrement disponible', async () => {
    available = false;
    expect(await handlers.get('crypto:protect')!({}, 'x')).toBeNull();
    expect(await handlers.get('crypto:unprotect')!({}, 'eA==')).toBeNull();
  });

  it('refuse les entrées non-chaîne', async () => {
    await expect(handlers.get('crypto:protect')!({}, 42)).rejects.toThrow();
    await expect(handlers.get('crypto:unprotect')!({}, 42)).rejects.toThrow();
  });
});
