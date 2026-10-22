/**
 * Client des sous-pistes des rapières (/common.js, #1118) : réclamation auprès du serveur,
 * repli sur la piste ou la sous-piste courante en cas d'erreur.
 */
import { describe, it, expect, vi } from 'vitest';

const { claimArenaSlot } = require('./common.js') as {
  claimArenaSlot: (baseId: string, current?: string) => Promise<string>;
};

const store = new Map<string, string>();
const session = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => session.get(k) ?? null,
  setItem: (k: string, v: string) => void session.set(k, v),
});

function mockFetch(impl: () => Promise<unknown>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('claimArenaSlot (/common.js)', () => {
  it("envoie la clé de l'onglet (distincte entre onglets) et la sous-piste courante", async () => {
    const fetch = mockFetch(async () => ({
      ok: true,
      json: async () => ({ arenaId: 'arena3s2' }),
    }));
    expect(await claimArenaSlot('arena3', 'arena3s2')).toBe('arena3s2');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('/api/arenas/arena3/slot');
    const body = JSON.parse(init.body);
    expect(body.deviceKey).toBe(session.get('bp_slot_key'));
    expect(body.deviceKey).toMatch(/^tab_/);
    expect(body.current).toBe('arena3s2');
  });

  it('deux onglets du même navigateur : deux clés différentes', async () => {
    const fetch = mockFetch(async () => ({ ok: true, json: async () => ({ arenaId: 'arena3' }) }));
    await claimArenaSlot('arena3');
    const first = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    session.clear(); // nouvel onglet : sessionStorage vide, localStorage partagé
    await claimArenaSlot('arena3');
    const second = JSON.parse(
      (fetch.mock.calls[1] as unknown as [string, { body: string }])[1].body
    );
    expect(second.deviceKey).not.toBe(first.deviceKey);
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
