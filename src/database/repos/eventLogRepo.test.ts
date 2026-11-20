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

  it('révision par épreuve, croissante, en ajout seul', () => {
    expect(repo.getRevision('c1')).toBe(0);
    const at = '2026-11-20T10:41:07.000Z';
    expect(
      repo.append(
        'c1',
        [
          { type: 'ScoreRecorded', payload: { matchId: 'm1', scoreA: 5, scoreB: 3 } },
          { type: 'PoolCompleted', payload: { poolId: 'p3' } },
        ],
        { source: 'tablet', author: 'arbitre P3' },
        at
      )
    ).toBe(2);
    expect(
      repo.append('c2', [{ type: 'FencerCheckedIn', payload: { fencerId: 'f1' } }], {
        source: 'screen',
      })
    ).toBe(1);
    expect(repo.getRevision('c1')).toBe(2);
    expect(repo.getSince('c1')).toEqual([
      {
        competitionId: 'c1',
        revision: 1,
        type: 'ScoreRecorded',
        payload: { matchId: 'm1', scoreA: 5, scoreB: 3 },
        author: 'arbitre P3',
        source: 'tablet',
        at,
      },
      {
        competitionId: 'c1',
        revision: 2,
        type: 'PoolCompleted',
        payload: { poolId: 'p3' },
        author: 'arbitre P3',
        source: 'tablet',
        at,
      },
    ]);
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
    repo.append(
      'c1',
      [{ type: 'ScoreRecorded', payload: { matchId: 'm1', scoreA: 4, scoreB: 5 } }],
      {
        source: 'tablet',
      }
    );
    repo.append(
      'c1',
      [{ type: 'ScoreRecorded', payload: { matchId: 'm2', scoreA: 5, scoreB: 0 } }],
      {
        source: 'screen',
      }
    );
    repo.append(
      'c1',
      [{ type: 'ScoreRecorded', payload: { matchId: 'm1', scoreA: 5, scoreB: 4 } }],
      {
        source: 'mcp',
        author: 'agent',
      }
    );
    const h = repo.getMatchHistory('c1', 'm1');
    expect(h.map(e => [e.revision, e.source, e.author, e.payload.scoreA])).toEqual([
      [1, 'tablet', null, 4],
      [3, 'mcp', 'agent', 5],
    ]);
  });

  it('même révision deux fois : refusée par la clé primaire', () => {
    repo.append('c1', [{ type: 'X', payload: {} }], { source: 'engine' });
    expect(() =>
      db
        .prepare(
          `INSERT INTO competition_events (competition_id, revision, type, payload, source, at)
           VALUES ('c1', 1, 'Y', '{}', 'engine', 'now')`
        )
        .run()
    ).toThrow();
  });
});
