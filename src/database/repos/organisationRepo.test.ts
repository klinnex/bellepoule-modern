/**
 * Onglet Organisation (#1817) : journal des événements distants, horodatage des
 * matchs, appels DT et repos des arbitres. SQLite réel (node:sqlite en mémoire).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OrganisationRepo } from './organisationRepo';
import { RefereeRepo } from './refereeRepo';
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

const NOW = '2026-11-13T08:00:00.000Z';

describe.skipIf(!DatabaseSync)('OrganisationRepo (#1817)', () => {
  let sql: SqlExecutor;
  let repo: OrganisationRepo;

  const match = (id: string, ref: string | null, start: string, end: string, dur: number) =>
    sql.run(
      `INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, max_score, status,
         referee_id, strip, start_time, end_time, duration, created_at, updated_at)
       VALUES (?, 1, 'p1', 'fa', 'fb', 5, 'finished', ?, 2, ?, ?, ?, ?, ?)`,
      [id, ref, start, end, dur, NOW, NOW]
    );

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    sql = makeSql(db);
    repo = new OrganisationRepo(sql);
    for (const id of ['c1', 'c2'])
      sql.run(
        `INSERT INTO competitions (id, title, date, weapon, gender, category, created_at, updated_at)
         VALUES (?, ?, '2026-11-13', 'F', 'M', 'U15', ?, ?)`,
        [id, id, NOW, NOW]
      );
    for (const [id, comp] of [
      ['fa', 'c1'],
      ['fb', 'c1'],
      ['fx', 'c2'],
    ])
      sql.run(
        `INSERT INTO fencers (id, competition_id, ref, last_name, first_name, gender, created_at, updated_at)
         VALUES (?, ?, 1, 'N', 'P', 'M', ?, ?)`,
        [id, comp, NOW, NOW]
      );
    sql.run(
      `INSERT INTO phases (id, competition_id, name, type, order_index, created_at, updated_at)
       VALUES ('ph1', 'c1', 'Poules', 'pool', 0, ?, ?)`,
      [NOW, NOW]
    );
    sql.run(
      `INSERT INTO pools (id, phase_id, number, created_at, updated_at) VALUES ('p1', 'ph1', 1, ?, ?)`,
      [NOW, NOW]
    );
    sql.run(
      `INSERT INTO referees (id, competition_id, ref, name, created_at, updated_at)
       VALUES ('r1', 'c1', 1, 'Jean Arbitre', ?, ?)`,
      [NOW, NOW]
    );
  });

  it('journalise et relit les événements par compétition', () => {
    repo.logRemoteEvent({ competitionId: 'c1', type: 'dt_call', refereeId: 'r1', arenaId: 'a1' });
    repo.logRemoteEvent({ competitionId: 'c1', type: 'disconnect', arenaId: 'a2' });
    repo.logRemoteEvent({ competitionId: 'c2', type: 'sync_error' });
    // type inconnu ignoré
    repo.logRemoteEvent({ competitionId: 'c1', type: 'nope' as never });
    const evs = repo.getRemoteEvents('c1');
    expect(evs.map(e => e.type)).toEqual(['dt_call', 'disconnect']);
    expect(evs[0]).toMatchObject({ refereeId: 'r1', arenaId: 'a1', matchId: null });
  });

  it('renvoie l’horodatage des matchs de la compétition', () => {
    match('m1', 'r1', '2026-11-13T09:00:00Z', '2026-11-13T09:06:00Z', 240);
    sql.run(
      `INSERT INTO matches (id, number, fencer_a_id, fencer_b_id, max_score, created_at, updated_at)
       VALUES ('other', 1, 'fx', 'fx', 5, ?, ?)`,
      [NOW, NOW]
    );
    const tm = repo.getMatchTimings('c1');
    expect(tm).toHaveLength(1);
    expect(tm[0]).toMatchObject({ matchId: 'm1', strip: 2, duration: 240, refereeId: 'r1' });
  });

  it('stats arbitres : appels DT et repos moyen entre affectations', () => {
    match('m1', 'r1', '2026-11-13T09:00:00Z', '2026-11-13T09:05:00Z', 180);
    match('m2', 'r1', '2026-11-13T09:15:00Z', '2026-11-13T09:20:00Z', 180);
    match('m3', 'r1', '2026-11-13T09:40:00Z', '2026-11-13T09:45:00Z', 180);
    repo.logRemoteEvent({ competitionId: 'c1', type: 'dt_call', refereeId: 'r1' });
    repo.logRemoteEvent({ competitionId: 'c1', type: 'dt_call', refereeId: 'r1' });
    const [r] = new RefereeRepo(sql).getRefereeStats('c1');
    expect(r).toMatchObject({ refereeId: 'r1', matchesCount: 3, dtCalls: 2 });
    // repos : 10 min puis 20 min → 15 min
    expect(r.averageRestSeconds).toBe(900);
  });
});
