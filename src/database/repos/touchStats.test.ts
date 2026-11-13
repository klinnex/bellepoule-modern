/**
 * Touches données / reçues par zone + événements simulés du remplissage automatique,
 * testés sur SQLite réel (node:sqlite en mémoire, schéma = toutes les migrations).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FencerRepo } from './fencerRepo';
import { MatchRepo } from './matchRepo';
import type { SqlExecutor } from './sqlExecutor';
import { ALL_MIGRATIONS } from '../migrations/migrations';
import type { DatabaseManager } from '../index';

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
    transaction: fn => {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const NOW = '2026-11-13T10:00:00.000Z';

describe.skipIf(!DatabaseSync)('Touches données / reçues par zone', () => {
  let sql: SqlExecutor;
  let fencers: FencerRepo;
  let matches: MatchRepo;

  const touch = (id: string, matchId: string, fencerId: string, zone: string, reversed = 0) =>
    sql.run(
      `INSERT INTO match_touches (id, match_id, fencer_id, zone, points, timestamp, is_valid_in_sudden_death, is_reversed)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, matchId, fencerId, zone, { A: 1, B: 3, C: 5 }[zone], NOW, reversed]
    );

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    sql = makeSql(db);
    fencers = new FencerRepo(sql);
    matches = new MatchRepo(sql, {} as DatabaseManager);
    sql.run(
      `INSERT INTO competitions (id, title, date, weapon, gender, category, created_at, updated_at)
       VALUES ('c1', 'Laser', '2026-11-13', 'L', 'M', 'SENIOR', ?, ?)`,
      [NOW, NOW]
    );
    ['a', 'b', 'c'].forEach((id, i) =>
      sql.run(
        `INSERT INTO fencers (id, competition_id, ref, last_name, first_name, gender, created_at, updated_at)
         VALUES (?, 'c1', ?, ?, 'X', 'M', ?, ?)`,
        [id, i + 1, id.toUpperCase(), NOW, NOW]
      )
    );
    for (const [id, fa, fb] of [
      ['m1', 'a', 'b'],
      ['m2', 'c', 'a'],
      ['m3', 'b', 'c'],
    ])
      sql.run(
        `INSERT INTO matches (id, number, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at)
         VALUES (?, 1, ?, ?, 15, 'finished', ?, ?)`,
        [id, fa, fb, NOW, NOW]
      );
  });

  it('compte les touches reçues des adversaires, par zone, hors touches annulées', () => {
    touch('t1', 'm1', 'a', 'C');
    touch('t2', 'm1', 'b', 'B');
    touch('t3', 'm1', 'b', 'A');
    touch('t4', 'm2', 'c', 'C');
    touch('t5', 'm2', 'c', 'B', 1); // annulée
    touch('t6', 'm3', 'b', 'C'); // match sans A

    const s = fencers.getFencerCompetitionStats('a');
    expect([s.touchesZoneA, s.touchesZoneB, s.touchesZoneC, s.totalTouchPoints]).toEqual([
      0, 0, 1, 5,
    ]);
    expect([s.receivedZoneA, s.receivedZoneB, s.receivedZoneC, s.receivedTouchPoints]).toEqual([
      1, 1, 1, 9,
    ]);
  });

  it('replaceSimulatedMatchEvents remplace puis efface les seuls événements simulés', () => {
    touch('real', 'm1', 'b', 'A');
    const events = {
      timing: { startTime: NOW, endTime: NOW, duration: 120 },
      touches: [
        {
          id: 'm1-a-sim-touch-0',
          matchId: 'm1',
          fencerId: 'a',
          zone: 'B',
          points: 3,
          timestamp: NOW,
        },
      ],
      cards: [
        {
          id: 'm1-b-sim-card-yellow-1',
          matchId: 'm1',
          fencerId: 'b',
          cardType: 'yellow',
          reason: 'early_start',
          cardGroup: 1,
          timestamp: NOW,
          pointsAwarded: 1,
        },
      ],
    };
    expect(matches.replaceSimulatedMatchEvents('absent', events)).toBe(false);
    expect(matches.replaceSimulatedMatchEvents('m1', events)).toBe(true);
    expect(matches.replaceSimulatedMatchEvents('m1', events)).toBe(true); // idempotent
    expect(fencers.getFencerCompetitionStats('b').receivedZoneB).toBe(1);
    expect(fencers.getFencerCompetitionStats('b').yellowCards).toBe(1);
    expect(fencers.getFencerCompetitionStats('a').totalDurationSeconds).toBe(120);

    matches.replaceSimulatedMatchEvents('m1', null);
    const b = fencers.getFencerCompetitionStats('b');
    expect([b.receivedZoneB, b.yellowCards, b.touchesZoneA]).toEqual([0, 0, 1]);
    expect(fencers.getFencerCompetitionStats('a').totalDurationSeconds).toBe(0);
  });
});
