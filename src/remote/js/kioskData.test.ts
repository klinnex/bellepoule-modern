/**
 * Module kiosque /js/kioskData.js (#1401) : vues actives et séquence de chargement des données.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const K = req('./kioskData.js');

const res = (body: unknown, ok = true) => ({ ok, json: async () => body });
const routes =
  (map: Record<string, unknown>, calls: string[] = []) =>
  async (url: string) => {
    calls.push(url);
    return url in map ? res(map[url]) : res(null, false);
  };
const hooks = () => ({
  onSession: vi.fn(),
  onTraining: vi.fn(),
  onPools: vi.fn(),
  onArenas: vi.fn(),
  onUpcoming: vi.fn(),
});

describe('kioskData.js vues', () => {
  it('viewDefault : final désactivé par défaut, les autres activés', () => {
    expect(K.viewDefault({}, 'final')).toBe(false);
    expect(K.viewDefault({ final: true }, 'final')).toBe(true);
    expect(K.viewDefault({}, 'poules')).toBe(true);
    expect(K.viewDefault({ poules: false }, 'poules')).toBe(false);
  });

  it('resolveViewChecks : local prioritaire, sinon serveur, sinon null', () => {
    const all = ['poules', 'final'];
    expect(K.resolveViewChecks(all, null, null)).toBeNull();
    expect(K.resolveViewChecks(all, null, { poules: false })).toEqual({
      poules: false,
      final: false,
    });
    expect(K.resolveViewChecks(all, { final: true }, { poules: false })).toEqual({
      poules: true,
      final: true,
    });
  });
});

describe('kioskData.js loadKioskData', () => {
  it('sans session : false, aucun autre appel', async () => {
    const calls: string[] = [];
    const h = hooks();
    expect(await K.loadKioskData(routes({}, calls), h)).toBe(false);
    expect(calls).toEqual(['/api/session']);
    expect(h.onSession).not.toHaveBeenCalled();
  });

  it('compétition : poules, classement général fourni ou null, arènes, suivants', async () => {
    const calls: string[] = [];
    const h = hooks();
    const f = routes(
      {
        '/api/session': { competitionId: 'c1' },
        '/api/competitions/c1/results-data': { pools: [{ n: 1 }], overallRanking: [] },
        '/api/arenas': [{ id: 'a' }],
        '/api/session/upcoming-matches': { upcoming: [1] },
      },
      calls
    );
    expect(await K.loadKioskData(f, h)).toBe(true);
    expect(h.onPools).toHaveBeenCalledWith([{ n: 1 }], null);
    expect(h.onArenas).toHaveBeenCalledWith([{ id: 'a' }]);
    expect(h.onUpcoming).toHaveBeenCalledWith([1]);
    expect(h.onTraining).not.toHaveBeenCalled();
    expect(calls).toEqual([
      '/api/session',
      '/api/competitions/c1/results-data',
      '/api/arenas',
      '/api/session/upcoming-matches',
    ]);
  });

  it('classement général fourni par le serveur transmis', async () => {
    const h = hooks();
    await K.loadKioskData(
      routes({
        '/api/session': { competitionId: 'c1' },
        '/api/competitions/c1/results-data': { overallRanking: [{ r: 1 }] },
      }),
      h
    );
    expect(h.onPools).toHaveBeenCalledWith([], [{ r: 1 }]);
    expect(h.onArenas).not.toHaveBeenCalled();
  });

  it('entraînement : historique au lieu des poules', async () => {
    const h = hooks();
    await K.loadKioskData(
      routes({
        '/api/session': { competitionId: '__training__' },
        '/api/training/history': {},
      }),
      h
    );
    expect(h.onTraining).toHaveBeenCalledWith([]);
    expect(h.onPools).not.toHaveBeenCalled();
  });

  it('erreur réseau propagée (reprise gérée par l’appelant)', async () => {
    await expect(
      K.loadKioskData(async () => Promise.reject(new Error('net')), hooks())
    ).rejects.toThrow('net');
  });

  it('kiosk.html charge le module et délègue', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8');
    expect(html).toContain('<script src="/js/kioskData.js"></script>');
    expect(html).toContain('KioskData.loadKioskData(fetch,');
    expect(html).not.toContain("fetch('/api/session/upcoming-matches')");
  });
});
