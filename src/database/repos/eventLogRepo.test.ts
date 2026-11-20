/**
 * Journal des événements par épreuve (#1980). SQLite réel (node:sqlite en mémoire).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventLogRepo } from './eventLogRepo';
import type { SqlExecutor } from './sqlExecutor';
import { ALL_MIGRATIONS } from '../migrations/migrations';

let DatabaseSync: (new (path: string) => SqliteDb) | null = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}

interface SqliteStmt {
  run(...p: unknown[]): unknown;
  get(...p: unknown[]): unknown;
  all(...p: unknown[]): unknown[];
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
}

function makeSql(db: SqliteDb): SqlExecutor {
  return {
    db: db as unknown as SqlExecutor['db'],
    run: (sql, params = []) => db.prepare(sql).run(...params) as never,
    queryOne: <T>(sql: string, params: unknown[] = []) =>
      (db.prepare(sql).get(...params) as T | undefined) ?? null,
    queryAll: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as T[],
    transaction: fn => fn(),
  };
}

describe.skipIf(!DatabaseSync)('EventLogRepo (#1980)', () => {
  let repo: EventLogRepo;
  let db: SqliteDb;

  beforeEach(() => {
    db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    repo = new EventLogRepo(makeSql(db));
  });

  const score = (matchId: string, scoreA: number, scoreB: number) => ({
    type: 'ScoreRecorded' as const,
    payload: { matchId, scoreA, scoreB, winnerId: null },
  });

  it('révision par épreuve, croissante ; identifiants d’événement et de commande', () => {
    expect(repo.getRevision('c1')).toBe(0);
    const at = '2026-11-20T10:41:07.000Z';
    expect(
      repo.append(
        'c1',
        [score('m1', 5, 3), { type: 'PoolCompleted', payload: { poolId: 'p3' } }],
        { source: 'tablet', author: 'arbitre P3' },
        'cmd-1',
        at
      )
    ).toBe(2);
    expect(
      repo.append('c2', [{ type: 'FencerCheckedIn', payload: { fencerId: 'f1' } }], {
        source: 'screen',
      })
    ).toBe(1);
    expect(repo.getRevision('c1')).toBe(2);
    const events = repo.getSince('c1');
    expect(events.map(({ eventId: _e, ...rest }) => rest)).toEqual([
      {
        commandId: 'cmd-1',
        competitionId: 'c1',
        revision: 1,
        type: 'ScoreRecorded',
        schemaVersion: 1,
        payload: { matchId: 'm1', scoreA: 5, scoreB: 3, winnerId: null },
        author: 'arbitre P3',
        source: 'tablet',
        at,
      },
      {
        commandId: 'cmd-1',
        competitionId: 'c1',
        revision: 2,
        type: 'PoolCompleted',
        schemaVersion: 1,
        payload: { poolId: 'p3' },
        author: 'arbitre P3',
        source: 'tablet',
        at,
      },
    ]);
    // UUID v4 distincts
    expect(new Set(events.map(e => e.eventId)).size).toBe(2);
    for (const e of events) expect(e.eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('commande déjà inscrite : détectée (idempotence)', () => {
    repo.append('c1', [score('m1', 5, 3)], { source: 'mcp' }, 'cmd-x');
    expect(repo.hasCommand('c1', 'cmd-x')).toBe(true);
    expect(repo.hasCommand('c2', 'cmd-x')).toBe(false);
    expect(repo.hasCommand('c1', 'cmd-y')).toBe(false);
  });

  it('sans identifiant de commande : un par ajout, commun à ses événements', () => {
    repo.append('c1', [score('m1', 1, 0), score('m2', 2, 0)], { source: 'engine' });
    repo.append('c1', [score('m3', 3, 0)], { source: 'engine' });
    const [a, b, c] = repo.getSince('c1');
    expect(a.commandId).toBe(b.commandId);
    expect(c.commandId).not.toBe(a.commandId);
  });

  it('resynchronisation : seulement les événements après la révision connue', () => {
    for (let i = 0; i < 5; i++) {
      repo.append('c1', [{ type: 'FencerCheckedIn', payload: { fencerId: `f${i}` } }], {
        source: 'screen',
      });
    }
    expect(repo.getSince('c1', 3).map(e => e.revision)).toEqual([4, 5]);
    expect(repo.getSince('c1', 0, 2).map(e => e.revision)).toEqual([1, 2]);
  });

  it('historique d’un match : chaque modification, auteur, source', () => {
    repo.append('c1', [score('m1', 4, 5)], { source: 'tablet' });
    repo.append('c1', [score('m2', 5, 0)], { source: 'screen' });
    repo.append('c1', [score('m1', 5, 4)], { source: 'mcp', author: 'agent' });
    const h = repo.getMatchHistory('c1', 'm1');
    expect(
      h.map(e => [e.revision, e.source, e.author, e.type === 'ScoreRecorded' && e.payload.scoreA])
    ).toEqual([
      [1, 'tablet', null, 4],
      [3, 'mcp', 'agent', 5],
    ]);
  });

  it('même révision deux fois : refusée (unicité épreuve + révision)', () => {
    repo.append('c1', [{ type: 'TableauCompleted', payload: {} }], { source: 'engine' });
    expect(() =>
      db
        .prepare(
          `INSERT INTO competition_events (event_id, command_id, competition_id, revision, type, payload, source, at)
           VALUES ('e2', 'k', 'c1', 1, 'Y', '{}', 'engine', 'now')`
        )
        .run()
    ).toThrow();
  });
});

describe.skipIf(!DatabaseSync)('migration 46 : journal de la 45 repris (#1980, ADR-0007)', () => {
  it('lignes recopiées : event_id neuf, command_id par ajout, schema_version 1', () => {
    const db = new DatabaseSync!(':memory:');
    const run = (s: string) => db.exec(s);
    for (const m of ALL_MIGRATIONS.filter(m => m.version <= 45)) m.up({ run });
    const insert = db.prepare(
      `INSERT INTO competition_events (competition_id, revision, type, payload, author, source, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run('c1', 1, 'ScoreRecorded', '{"matchId":"m1"}', null, 'mcp', '2026-11-20T10:00:00Z');
    insert.run('c1', 2, 'PoolCompleted', '{"poolId":"p1"}', null, 'mcp', '2026-11-20T10:00:00Z');
    insert.run(
      'c1',
      3,
      'FencerCheckedIn',
      '{"fencerId":"f1"}',
      'x',
      'screen',
      '2026-11-20T11:00:00Z'
    );
    for (const m of ALL_MIGRATIONS.filter(m => m.version === 46)) m.up({ run });

    const repo = new EventLogRepo(makeSql(db));
    const events = repo.getSince('c1');
    expect(events.map(e => [e.revision, e.type, e.schemaVersion, e.source])).toEqual([
      [1, 'ScoreRecorded', 1, 'mcp'],
      [2, 'PoolCompleted', 1, 'mcp'],
      [3, 'FencerCheckedIn', 1, 'screen'],
    ]);
    expect(events[0].commandId).toBe(events[1].commandId);
    expect(events[2].commandId).not.toBe(events[0].commandId);
    expect(new Set(events.map(e => e.eventId)).size).toBe(3);
    for (const e of events) {
      expect(e.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
    // La suite s'écrit au nouveau format, à la révision suivante
    expect(
      repo.append('c1', [{ type: 'TableauCompleted', payload: {} }], { source: 'engine' })
    ).toBe(4);
  });
});
