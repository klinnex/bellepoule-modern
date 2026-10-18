/**
 * BellePoule Modern - Archive .bpm d'une compétition (#1117)
 * Un .bpm est une base SQLite. L'export n'y garde qu'une compétition ; l'ouverture
 * fusionne ses compétitions dans la base active (état d'avancement compris)
 * au lieu de remplacer la base.
 * Licensed under GPL-3.0
 */

import type Database from 'better-sqlite3';

type Db = Database.Database;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

const listTables = (db: Db, schema: string): string[] =>
  (
    db
      .prepare(
        `SELECT name FROM ${schema}.sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`
      )
      .all() as { name: string }[]
  ).map(r => r.name);

const listColumns = (db: Db, schema: string, table: string): string[] =>
  (db.prepare(`PRAGMA ${schema}.table_info(${quote(table)})`).all() as { name: string }[]).map(
    r => r.name
  );

/** Ordre parents → enfants selon les clés étrangères (REPLACE d'un parent purge ses enfants) */
const sortByDependencies = (db: Db, tables: string[]): string[] => {
  const set = new Set(tables);
  const parents = new Map<string, string[]>();
  for (const t of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list(${quote(t)})`).all() as { table: string }[];
    parents.set(
      t,
      fks.map(f => f.table).filter(p => p !== t && set.has(p))
    );
  }
  const sorted: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, stack: Set<string>) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const p of parents.get(t) ?? []) visit(p, stack);
    stack.delete(t);
    seen.add(t);
    sorted.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return sorted;
};

/**
 * Supprime les lignes orphelines (clé étrangère vers un parent absent) jusqu'à stabilité.
 * Un .bpm peut en contenir (export depuis une base déjà incohérente) : sans purge,
 * le contrôle différé échoue au commit (« FOREIGN KEY constraint failed »).
 */
const pruneForeignKeyViolations = (db: Db): void => {
  for (let pass = 0; pass < 10; pass++) {
    const violations = db.prepare('PRAGMA foreign_key_check').all() as {
      table: string;
      rowid: number | null;
    }[];
    if (violations.length === 0) return;
    let removed = 0;
    for (const v of violations) {
      if (v.rowid == null) continue;
      removed += db.prepare(`DELETE FROM ${quote(v.table)} WHERE rowid = ?`).run(v.rowid).changes;
    }
    if (removed === 0) return;
  }
};

/**
 * Réduit une copie de base à une seule compétition : supprime les autres
 * compétitions et toutes les lignes portant un autre `competition_id`.
 */
export function keepOnlyCompetition(db: Db, competitionId: string): void {
  db.pragma('foreign_keys = ON');
  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    db.prepare(
      `DELETE FROM pool_signatures WHERE pool_id IN (
         SELECT p.id FROM pools p JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id != ?
       )`
    ).run(competitionId);
    for (const table of listTables(db, 'main')) {
      if (table === 'competitions') continue;
      if (listColumns(db, 'main', table).includes('competition_id')) {
        db.prepare(`DELETE FROM ${quote(table)} WHERE competition_id != ?`).run(competitionId);
      }
    }
    db.prepare('DELETE FROM competitions WHERE id != ?').run(competitionId);
    pruneForeignKeyViolations(db);
  })();
}

/**
 * Fusionne la base attachée sous `schema` dans la base principale.
 * Les lignes de même identifiant sont remplacées : rouvrir un .bpm restaure
 * l'état sauvegardé. Renvoie les identifiants des compétitions importées.
 * `deleteCompetition` purge au préalable une compétition déjà présente.
 */
export function mergeAttachedDatabase(
  db: Db,
  schema: string,
  deleteCompetition: (id: string) => void
): string[] {
  const ids = (db.prepare(`SELECT id FROM ${schema}.competitions`).all() as { id: string }[]).map(
    r => r.id
  );
  const mainTables = new Set(listTables(db, 'main'));
  const tables = sortByDependencies(
    db,
    listTables(db, schema).filter(t => mainTables.has(t))
  );

  db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    for (const id of ids) {
      const exists = db.prepare('SELECT 1 FROM main.competitions WHERE id = ?').get(id);
      if (exists) deleteCompetition(id);
    }
    for (const table of tables) {
      const mainCols = new Set(listColumns(db, 'main', table));
      const cols = listColumns(db, schema, table).filter(c => mainCols.has(c));
      if (cols.length === 0) continue;
      const colList = cols.map(quote).join(', ');
      db.prepare(
        `INSERT OR REPLACE INTO main.${quote(table)} (${colList})
         SELECT ${colList} FROM ${schema}.${quote(table)}`
      ).run();
    }
    pruneForeignKeyViolations(db);
  })();
  return ids;
}
