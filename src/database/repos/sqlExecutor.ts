/**
 * Accès SQL minimal fourni par DatabaseManager aux dépôts par domaine (#1242).
 * Les dépôts n'ouvrent ni ne ferment la base : le cycle de vie reste dans DatabaseManager.
 */
export interface SqlExecutor {
  run(sql: string, params?: unknown[]): unknown;
  queryOne<T>(sql: string, params?: unknown[]): T | null;
  queryAll<T>(sql: string, params?: unknown[]): T[];
}
