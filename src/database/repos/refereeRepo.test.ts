/**
 * getMatchesWithReferees sur SQLite réel (node:sqlite en mémoire, schéma = toutes les migrations).
 * Régression : `p.name` inexistant faisait planter le rapport PDF post-tournoi (analytique).
 */
import { describe, it, expect, beforeEach } from 'vitest';
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

describe.skipIf(!DatabaseSync)('RefereeRepo.getMatchesWithReferees', () => {
  let sql: SqlExecutor;
  let repo: RefereeRepo;

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    sql = makeSql(db);
    repo = new RefereeRepo(sql);
    for (const c of ['c1', 'c2']) {
      sql.run(
        `INSERT INTO competitions (id, title, date, weapon, gender, category, created_at, updated_at)
         VALUES (?, ?, '2026-11-13', 'E', 'M', 'U15', ?, ?)`,
        [c, c, NOW, NOW]
      );
    }
    const fencer = (id: string, c: string, ln: string) =>
      sql.run(
        `INSERT INTO fencers (id, competition_id, ref, last_name, first_name, gender, created_at, updated_at)
         VALUES (?, ?, 1, ?, 'X', 'M', ?, ?)`,
        [id, c, ln, NOW, NOW]
      );
    fencer('a', 'c1', 'DUPONT');
    fencer('b', 'c1', 'MARTIN');
    fencer('z', 'c2', 'AUTRE');
    sql.run(
      `INSERT INTO referees (id, competition_id, ref, name, created_at, updated_at)
       VALUES ('r1', 'c1', 1, 'Arbitre Un', ?, ?)`,
      [NOW, NOW]
    );
    sql.run(
      `INSERT INTO phases (id, competition_id, name, type, order_index, created_at, updated_at)
       VALUES ('ph1', 'c1', 'Poules', 'pool', 0, ?, ?)`,
      [NOW, NOW]
    );
    sql.run(
      `INSERT INTO pools (id, phase_id, number, created_at, updated_at) VALUES ('p1', 'ph1', 2, ?, ?)`,
      [NOW, NOW]
    );
    const match = (id: string, pool: string | null, fa: string, fb: string, ref: string | null) =>
      sql.run(
        `INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, score_a, score_b, max_score,
           status, referee_id, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, '{"value":5}', '{"value":3}', 5, 'finished', ?, ?, ?)`,
        [id, pool, fa, fb, ref, NOW, NOW]
      );
    match('m1', 'p1', 'a', 'b', 'r1');
    match('m2', null, 'a', 'b', 'r1'); // match de tableau
    match('m3', 'p1', 'a', 'b', null); // sans arbitre
    match('m4', null, 'z', 'z', 'r1'); // autre compétition
  });

  it('ne plante pas et renvoie poules + tableau de la compétition', () => {
    const rows = repo.getMatchesWithReferees('c1');
    expect(rows.map(r => r.matchId).sort()).toEqual(['m1', 'm2']);
    const pool = rows.find(r => r.matchId === 'm1')!;
    expect(pool.poolName).toBe('Poule 2');
    expect(pool.fencerAName).toBe('DUPONT X');
    expect(pool.scoreA).toBe(5);
    expect(pool.refereeName).toBe('Arbitre Un');
    expect(rows.find(r => r.matchId === 'm2')!.poolName).toBeNull();
  });
});
