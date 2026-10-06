/**
 * BellePoule Modern - Système de migrations DB versionnées
 * Chaque migration est appliquée une seule fois, dans l'ordre croissant.
 */

import Database from 'better-sqlite3';

export interface Migration {
  version: number;
  description: string;
  up(db: { run(sql: string): void }): void;
}

export class MigrationManager {
  constructor(private db: Database.Database) {}

  run(migrations: Migration[]): number {
    this.ensureMigrationsTable();
    const applied = this.getAppliedVersions();
    const pending = migrations
      .filter(m => !applied.has(m.version))
      .sort((a, b) => a.version - b.version);

    const dbWrapper = { run: (sql: string) => this.db.exec(sql) };

    for (const migration of pending) {
      console.log(`[DB] Migration v${migration.version}: ${migration.description}`);
      migration.up(dbWrapper);
      this.recordMigration(migration.version, migration.description);
    }

    if (pending.length > 0) {
      console.log(`[DB] ${pending.length} migration(s) appliquée(s)`);
    }
    return pending.length;
  }

  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  private getAppliedVersions(): Set<number> {
    const rows = this.db.prepare('SELECT version FROM schema_migrations').all() as {
      version: number;
    }[];
    return new Set(rows.map(r => r.version));
  }

  private recordMigration(version: number, description: string): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
      )
      .run(version, description, new Date().toISOString());
  }
}
