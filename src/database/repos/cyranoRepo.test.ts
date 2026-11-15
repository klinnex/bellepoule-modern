/**
 * Table des pistes Cyrano en base, par compétition (#1829). SQLite réel (node:sqlite en mémoire).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CyranoRepo } from './cyranoRepo';
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

describe.skipIf(!DatabaseSync)('CyranoRepo (#1829)', () => {
  let repo: CyranoRepo;

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    repo = new CyranoRepo(makeSql(db));
  });

  it('enregistre et relit les pistes dans l’ordre', () => {
    repo.replaceCyranoPistes('c1', [
      { piste: '2', config: { piste: '2', arena: 2, ip: '10.0.0.2', port: 50101 } },
      { piste: '1', config: { piste: '1', arena: 1, ip: '10.0.0.1', port: 50100 } },
    ]);
    expect(repo.getCyranoPistes('c1').map(p => p.piste)).toEqual(['2', '1']);
    expect(repo.getCyranoPistes('c1')[1].config).toMatchObject({ arena: 1, port: 50100 });
  });

  it('remplace la liste entière sans toucher aux autres compétitions', () => {
    repo.replaceCyranoPistes('c1', [{ piste: '1', config: { arena: 1 } }]);
    repo.replaceCyranoPistes('c2', [{ piste: '9', config: { arena: 9 } }]);
    repo.replaceCyranoPistes('c1', [{ piste: '3', config: { arena: 3 } }]);
    expect(repo.getCyranoPistes('c1').map(p => p.piste)).toEqual(['3']);
    expect(repo.getCyranoPistes('c2').map(p => p.piste)).toEqual(['9']);
  });

  it('compétition absente ou identifiant vide : liste vide, pas d’écriture', () => {
    repo.replaceCyranoPistes('', [{ piste: '1', config: {} }]);
    expect(repo.getCyranoPistes('')).toEqual([]);
    expect(repo.getCyranoPistes('inconnue')).toEqual([]);
  });
});
