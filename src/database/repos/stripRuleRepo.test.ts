/**
 * Réservation des pistes d'une journée et affectation automatique (#1878). SQLite réel (node:sqlite).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StripRuleRepo } from './stripRuleRepo';
import { DEFAULT_STRIP_RULE } from '../../shared/utils/stripRules';
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

describe.skipIf(!DatabaseSync)('StripRuleRepo (#1878)', () => {
  let repo: StripRuleRepo;

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    db.exec(
      "INSERT INTO event_days (id, name, date, strip_count, created_at, updated_at) VALUES ('d1', 'J', '2026-11-16', 16, 'x', 'x')"
    );
    repo = new StripRuleRepo(makeSql(db));
  });

  it('réservation enregistrée, relue, retirée par la règle par défaut', () => {
    repo.setStripRule('d1', 16, { ...DEFAULT_STRIP_RULE, pools: false, tableauMax: 8 });
    expect(repo.getStripRules('d1')).toEqual({
      16: { competitions: null, pools: false, tableau: true, tableauMax: 8 },
    });
    repo.setStripRule('d1', 16, DEFAULT_STRIP_RULE);
    expect(repo.getStripRules('d1')).toEqual({});
    repo.setStripRule('d1', 3, { ...DEFAULT_STRIP_RULE, competitions: ['c1'] });
    repo.setStripRule('d1', 3, null);
    expect(repo.getStripRules('d1')).toEqual({});
  });

  it('affectation automatique par journée', () => {
    expect(repo.getAutoAssign('d1')).toBe(false);
    repo.setAutoAssign('d1', true);
    expect(repo.getAutoAssign('d1')).toBe(true);
    expect(repo.listAutoAssignDays()).toEqual(['d1']);
    repo.setAutoAssign('d1', false);
    expect(repo.listAutoAssignDays()).toEqual([]);
  });
});
