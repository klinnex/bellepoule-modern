/**
 * BellePoule Modern - Tests : base SQLite réelle en mémoire pour DatabaseManager (#1880)
 * better-sqlite3 est recompilé pour Electron (ABI différente de Node) : les tests de la
 * couche domaine le remplacent par node:sqlite derrière la même interface :
 *   vi.mock('better-sqlite3', () => ({ default: NodeSqliteDatabase }))
 * Toutes les migrations s'appliquent : schéma identique à la production.
 * Licensed under GPL-3.0
 */

interface NodeStmt {
  run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...p: unknown[]): unknown;
  all(...p: unknown[]): unknown[];
}
interface NodeDb {
  exec(sql: string): void;
  prepare(sql: string): NodeStmt;
  close(): void;
}

let DatabaseSync: (new (path: string) => NodeDb) | null = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}

/** node:sqlite disponible (Node ≥ 22.5) : sinon les tests concernés sont ignorés */
export const hasNodeSqlite = DatabaseSync !== null;

const bind = (params: unknown[]): unknown[] =>
  params.map(p => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

export class NodeSqliteDatabase {
  private readonly db: NodeDb;
  private depth = 0;

  constructor(_path?: string) {
    if (!DatabaseSync) throw new Error('node:sqlite indisponible');
    // Toujours en mémoire : les tests n'écrivent rien sur disque
    this.db = new DatabaseSync(':memory:');
  }

  pragma(sql: string): unknown {
    try {
      this.db.exec(`PRAGMA ${sql}`);
    } catch {
      /* pragma sans effet en mémoire (WAL…) */
    }
    return undefined;
  }

  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...p: unknown[]) => stmt.run(...bind(p)),
      get: (...p: unknown[]) => stmt.get(...bind(p)),
      all: (...p: unknown[]) => stmt.all(...bind(p)),
    };
  }

  /** Comme better-sqlite3 : transaction imbriquée = savepoint */
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return (...args: unknown[]) => {
      const name = `sp${this.depth}`;
      this.db.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
      this.depth++;
      try {
        const r = fn(...args);
        this.depth--;
        this.db.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
        return r;
      } catch (e) {
        this.depth--;
        this.db.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
        throw e;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}
