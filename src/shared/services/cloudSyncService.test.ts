// @vitest-environment jsdom
/**
 * Tests unitaires - CloudSyncService (chiffrement + compression)
 * BellePoule Modern
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CloudSyncService } from './cloudSyncService';

// jsdom n'expose pas forcément window.crypto.subtle → on branche celui de Node
beforeAll(() => {
  if (!window.crypto?.subtle) {
    Object.defineProperty(window, 'crypto', { value: globalThis.crypto, configurable: true });
  }
});

const makeService = (over: Record<string, unknown> = {}) =>
  new CloudSyncService({
    provider: 'dropbox',
    autoSync: false,
    encryptData: false,
    compressionEnabled: true,
    ...over,
  } as any);

describe('compression (round-trip)', () => {
  it('compresse puis décompresse vers la donnée d’origine', async () => {
    const svc = makeService() as any;
    const data = JSON.stringify({ hello: 'monde', n: Array.from({ length: 50 }, (_, i) => i) });
    const compressed = await svc.compressData(data);
    const back = await svc.decompressData(compressed);
    expect(back).toBe(data);
  });

  it('renvoie la donnée telle quelle si compression désactivée', async () => {
    const svc = makeService({ compressionEnabled: false }) as any;
    const data = '{"a":1}';
    expect(await svc.compressData(data)).toBe(data);
  });

  it('decompressData laisse passer un JSON non préfixé', async () => {
    const svc = makeService() as any;
    expect(await svc.decompressData('{"plain":true}')).toBe('{"plain":true}');
  });
});

describe('chiffrement (round-trip AES-GCM)', () => {
  // retry: le WebCrypto de Node échoue de façon intermittente sous charge
  // concurrente (« Cipher job failed », cf. nodejs/node#47723) sans rapport
  // avec le code testé ici.
  it(
    'chiffre puis déchiffre vers la donnée d’origine',
    { retry: 2 },
    async () => {
      const svc = makeService({ encryptData: true }) as any;
      svc.encryptionKey = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const data = 'secret de compétition';
      const encrypted = await svc.encryptData(data);
      expect(encrypted).not.toBe(data);
      expect(await svc.decryptData(encrypted)).toBe(data);
    }
  );

  it('ne chiffre pas sans clé', async () => {
    const svc = makeService({ encryptData: true }) as any;
    // pas de clé injectée
    const data = 'clair';
    expect(await svc.encryptData(data)).toBe(data);
  });

  it('ne chiffre pas si encryptData=false', async () => {
    const svc = makeService({ encryptData: false }) as any;
    svc.encryptionKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    expect(await svc.encryptData('x')).toBe('x');
  });
});
