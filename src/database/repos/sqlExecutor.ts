import type Database from 'better-sqlite3';

/**
 * Accès SQL minimal fourni par DatabaseManager aux dépôts par domaine (#1242).
 * Les dépôts n'ouvrent ni ne ferment la base : le cycle de vie reste dans DatabaseManager.
 */
export interface SqlExecutor {
  /** Connexion courante (null si la base est fermée) */
  readonly db: Database.Database | null;
  run(sql: string, params?: unknown[]): Database.RunResult;
  queryOne<T>(sql: string, params?: unknown[]): T | null;
  queryAll<T>(sql: string, params?: unknown[]): T[];
  /** Mutation multi-statements : rollback automatique si une étape échoue */
  transaction<T>(fn: () => T): T;
}
