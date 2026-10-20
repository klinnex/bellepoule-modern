/**
 * Client des sous-pistes des rapières (/common.js, #1118) : réclamation auprès du serveur,
 * repli sur la piste ou la sous-piste courante en cas d'erreur.
 */
import { describe, it, expect, vi } from 'vitest';

const { claimArenaSlot } = require('./common.js') as {
  claimArenaSlot: (baseId: string, current?: string) => Promise<string>;
};

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

function mockFetch(impl: () => Promise<unknown>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('claimArenaSlot (/common.js)', () => {
  it('envoie la clé persistante de la tablette et la sous-piste courante', async () => {
    const fetch = mockFetch(async () => ({
      ok: true,
      json: async () => ({ arenaId: 'arena3s2' }),
    }));
    expect(await claimArenaSlot('arena3', 'arena3s2')).toBe('arena3s2');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('/api/arenas/arena3/slot');
    const body = JSON.parse(init.body);
    expect(body.deviceKey).toBe(store.get('bp_screen_id'));
    expect(body.current).toBe('arena3s2');
  });

  it('refus, erreur réseau ou réponse invalide : piste ou sous-piste courante', async () => {
    mockFetch(async () => ({ ok: false, json: async () => ({}) }));
    expect(await claimArenaSlot('arena3', 'arena3s4')).toBe('arena3s4');
    mockFetch(async () => Promise.reject(new Error('offline')));
    expect(await claimArenaSlot('arena3')).toBe('arena3');
    mockFetch(async () => ({ ok: true, json: async () => ({ arenaId: '<img>' }) }));
    expect(await claimArenaSlot('arena3')).toBe('arena3');
  });
});
