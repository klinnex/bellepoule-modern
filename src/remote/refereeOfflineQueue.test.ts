/**
 * File hors-ligne de la tablette arbitre (classe OfflineQueueInline, inline dans
 * referee.html) : scénarios de coupure réseau (#1076).
 * La classe est extraite du HTML et exécutée sur IndexedDB simulé (fake-indexeddb).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.join(__dirname, 'referee.html'), 'utf8');
const start = html.indexOf('class OfflineQueueInline {');
const end = html.indexOf('// ────', start);
const classSource = html.slice(start, end);

interface Action {
  id: string;
  type: string;
  payload: { matchId?: string; scoreA?: number; scoreB?: number };
  timestamp: number;
}
interface Queue {
  addAction(type: string, payload: unknown): Promise<Action>;
  getAllActions(): Promise<Action[]>;
  getQueueSize(): Promise<number>;
  sync(endpoint: string): Promise<{ synced: number; failed: number }>;
}

let fetchMock: ReturnType<typeof vi.fn>;
let serverLog: Action[][];

function makeQueue(): Queue {
  const factory = new Function(
    'indexedDB',
    'crypto',
    'fetch',
    `${classSource}\nreturn new OfflineQueueInline();`
  );
  // fetch indirect : un test peut remplacer fetchMock après création de la file
  const fetchProxy = (...args: unknown[]) => fetchMock(...args);
  return factory(new IDBFactory(), globalThis.crypto, fetchProxy) as Queue;
}

/** Serveur qui accepte tout (sauf ids listés) et journalise chaque lot reçu. */
function serverAccepting(rejectIds: Set<string> = new Set()) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const { actions } = JSON.parse(init.body) as { actions: Action[] };
    serverLog.push(actions);
    return {
      ok: true,
      json: async () => ({
        results: actions.map(a => ({ id: a.id, success: !rejectIds.has(a.id) })),
      }),
    };
  });
}

beforeEach(() => {
  serverLog = [];
  fetchMock = serverAccepting();
});

it('extrait bien la classe depuis referee.html', () => {
  expect(start).toBeGreaterThan(-1);
  expect(classSource).toContain('async sync(endpoint)');
});

describe('OfflineQueueInline — chaos réseau', () => {
  it('rejoue dans l’ordre chronologique (pas dans l’ordre des UUID)', async () => {
    const q = makeQueue();
    for (let i = 0; i < 20; i++) await q.addAction('card', { n: i });
    await q.sync('/api/sync');
    const sent = serverLog.flat().map(a => (a.payload as { n: number }).n);
    expect(sent).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(await q.getQueueSize()).toBe(0);
  });

  it('ne garde que le dernier score par match : un ancien score n’écrase jamais le récent', async () => {
    const q = makeQueue();
    await q.addAction('score_save', { matchId: 'm1', scoreA: 1, scoreB: 0 });
    await q.addAction('score_save', { matchId: 'm2', scoreA: 0, scoreB: 1 });
    await q.addAction('score_save', { matchId: 'm1', scoreA: 2, scoreB: 0 });
    await q.addAction('score_save', { matchId: 'm1', scoreA: 3, scoreB: 1 });
    await q.sync('/api/sync');
    const sent = serverLog.flat();
    expect(sent.map(a => a.payload)).toEqual([
      { matchId: 'm2', scoreA: 0, scoreB: 1 },
      { matchId: 'm1', scoreA: 3, scoreB: 1 },
    ]);
  });

  it('coupure pendant le rejeu : rien n’est perdu, tout part au retour du réseau', async () => {
    const q = makeQueue();
    await q.addAction('score_save', { matchId: 'm1', scoreA: 4, scoreB: 2 });
    await q.addAction('card', { color: 'yellow' });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await q.sync('/api/sync')).toEqual({ synced: 0, failed: 2 });
    expect(await q.getQueueSize()).toBe(2);

    expect(await q.sync('/api/sync')).toEqual({ synced: 2, failed: 0 });
    expect(await q.getQueueSize()).toBe(0);
  });

  it('erreur serveur (HTTP 429/500) : la file est conservée', async () => {
    const q = makeQueue();
    await q.addAction('score_save', { matchId: 'm1', scoreA: 1, scoreB: 1 });
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await q.sync('/api/sync')).toEqual({ synced: 0, failed: 1 });
    expect(await q.getQueueSize()).toBe(1);
  });

  it('action refusée par le serveur : seule celle-ci reste en file', async () => {
    const q = makeQueue();
    const a = await q.addAction('card', { n: 1 });
    await q.addAction('card', { n: 2 });
    fetchMock = serverAccepting(new Set([a.id]));
    expect(await q.sync('/api/sync')).toEqual({ synced: 1, failed: 1 });
    expect((await q.getAllActions()).map(x => x.id)).toEqual([a.id]);
  });

  it('deux sync simultanés (reconnexion + bouton) : aucun doublon envoyé', async () => {
    const q = makeQueue();
    for (let i = 0; i < 5; i++) await q.addAction('card', { n: i });
    const [r1, r2] = await Promise.all([q.sync('/api/sync'), q.sync('/api/sync')]);
    expect(r1.synced + r2.synced).toBe(5);
    expect(serverLog).toHaveLength(1);
    expect(serverLog[0]).toHaveLength(5);
  });

  it('envoie par lots de 50 au plus', async () => {
    const q = makeQueue();
    for (let i = 0; i < 60; i++) await q.addAction('card', { n: i });
    await q.sync('/api/sync');
    expect(serverLog[0]).toHaveLength(50);
    expect(await q.getQueueSize()).toBe(10);
    await q.sync('/api/sync');
    expect(await q.getQueueSize()).toBe(0);
  });
});

describe('Badge de synchronisation (#1304)', () => {
  const badgeState = new Function(
    `${classSource}\nreturn OfflineQueueInline.badgeState;`
  )() as (online: boolean, failed: boolean) => string;

  it('hors ligne prime sur un échec de synchronisation', () => {
    expect(badgeState(false, false)).toBe('offline');
    expect(badgeState(false, true)).toBe('offline');
  });

  it('en ligne : échec signalé, sinon état normal', () => {
    expect(badgeState(true, true)).toBe('failed');
    expect(badgeState(true, false)).toBe('online');
  });
});
