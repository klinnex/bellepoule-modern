import { describe, it, expect } from 'vitest';
import { keepOnlyCompetition, mergeAttachedDatabase } from './competitionArchive';

// better-sqlite3 natif : recompilé pour Electron en CI (postinstall) → test ignoré si non chargeable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require('better-sqlite3');
  new Database(':memory:').close();
} catch {
  Database = null;
}

const SCHEMA = `
  CREATE TABLE competitions (id TEXT PRIMARY KEY, title TEXT);
  CREATE TABLE phases (id TEXT PRIMARY KEY, competition_id TEXT NOT NULL,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE);
  CREATE TABLE pools (id TEXT PRIMARY KEY, phase_id TEXT NOT NULL);
  CREATE TABLE pool_signatures (id TEXT PRIMARY KEY, pool_id TEXT);
  CREATE TABLE fencers (id TEXT PRIMARY KEY, competition_id TEXT NOT NULL, last_name TEXT);
  CREATE TABLE session_state (competition_id TEXT PRIMARY KEY, state_json TEXT);
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
`;

const seed = (db: any, id: string, state: string) => {
  db.prepare('INSERT INTO competitions VALUES (?, ?)').run(id, `Compet ${id}`);
  db.prepare('INSERT INTO phases VALUES (?, ?)').run(`ph-${id}`, id);
  db.prepare('INSERT INTO fencers VALUES (?, ?, ?)').run(`f-${id}`, id, 'Dupont');
  db.prepare('INSERT INTO session_state VALUES (?, ?)').run(id, state);
};

describe.skipIf(!Database)('competitionArchive (#1117)', () => {
  it('keepOnlyCompetition ne garde que la compétition demandée', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    seed(db, 'a', '{}');
    seed(db, 'b', '{}');
    keepOnlyCompetition(db, 'a');
    expect(db.prepare('SELECT id FROM competitions').all()).toEqual([{ id: 'a' }]);
    expect(db.prepare('SELECT id FROM fencers').all()).toEqual([{ id: 'f-a' }]);
    expect(db.prepare('SELECT id FROM phases').all()).toEqual([{ id: 'ph-a' }]);
    expect(db.prepare('SELECT competition_id FROM session_state').all()).toEqual([
      { competition_id: 'a' },
    ]);
  });

  it("mergeAttachedDatabase importe la compétition et remplace l'état existant", () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    seed(db, 'keep', '{"phase":1}');
    seed(db, 'a', '{"phase":1}');
    db.prepare("INSERT INTO fencers VALUES ('stale', 'a', 'Ancien')").run();

    db.exec("ATTACH DATABASE ':memory:' AS src");
    db.exec(SCHEMA.replace(/CREATE TABLE /g, 'CREATE TABLE src.'));
    db.prepare("INSERT INTO src.competitions VALUES ('a', 'Compet a')").run();
    db.prepare("INSERT INTO src.phases VALUES ('ph-a', 'a')").run();
    db.prepare("INSERT INTO src.fencers VALUES ('f-a', 'a', 'Dupont')").run();
    db.prepare('INSERT INTO src.session_state VALUES (?, ?)').run('a', '{"phase":4}');
    db.prepare('INSERT INTO src.schema_migrations VALUES (99)').run();

    const ids = mergeAttachedDatabase(db, 'src', id => {
      db.prepare('DELETE FROM fencers WHERE competition_id = ?').run(id);
      db.prepare('DELETE FROM competitions WHERE id = ?').run(id);
    });

    expect(ids).toEqual(['a']);
    expect(
      db.prepare("SELECT state_json FROM session_state WHERE competition_id='a'").get()
    ).toEqual({ state_json: '{"phase":4}' });
    expect(db.prepare("SELECT id FROM fencers WHERE competition_id='a'").all()).toEqual([
      { id: 'f-a' },
    ]);
    expect(db.prepare("SELECT id FROM competitions WHERE id='keep'").get()).toEqual({
      id: 'keep',
    });
    expect(db.prepare('SELECT COUNT(*) n FROM main.schema_migrations').get()).toEqual({ n: 0 });
  });

  it("mergeAttachedDatabase purge les orphelins au lieu d'échouer (FOREIGN KEY)", () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    db.exec("ATTACH DATABASE ':memory:' AS src");
    db.exec(SCHEMA.replace(/CREATE TABLE /g, 'CREATE TABLE src.'));
    db.prepare("INSERT INTO src.competitions VALUES ('a', 'Compet a')").run();
    db.prepare("INSERT INTO src.phases VALUES ('ph-a', 'a')").run();
    // phase orpheline : compétition parente absente de l'archive
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO src.phases VALUES ('ph-x', 'absente')").run();
    db.pragma('foreign_keys = ON');

    expect(() => mergeAttachedDatabase(db, 'src', () => undefined)).not.toThrow();
    expect(db.prepare('SELECT id FROM phases').all()).toEqual([{ id: 'ph-a' }]);
  });

  it('keepOnlyCompetition retire poules et matchs des autres compétitions', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    db.exec(`
      CREATE TABLE pool_fencers (pool_id TEXT, fencer_id TEXT, PRIMARY KEY (pool_id, fencer_id));
      CREATE TABLE matches (id TEXT PRIMARY KEY, pool_id TEXT, fencer_a_id TEXT, fencer_b_id TEXT);
      CREATE TABLE match_touches (id TEXT PRIMARY KEY, match_id TEXT NOT NULL,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE);
    `);
    for (const id of ['a', 'b']) {
      seed(db, id, '{}');
      db.prepare('INSERT INTO pools VALUES (?, ?)').run(`p-${id}`, `ph-${id}`);
      db.prepare('INSERT INTO pool_fencers VALUES (?, ?)').run(`p-${id}`, `f-${id}`);
      db.prepare('INSERT INTO matches VALUES (?, ?, ?, ?)').run(`m-${id}`, `p-${id}`, null, null);
      db.prepare('INSERT INTO matches VALUES (?, ?, ?, ?)').run(`t-${id}`, null, `f-${id}`, null);
      db.prepare('INSERT INTO match_touches VALUES (?, ?)').run(`mt-${id}`, `m-${id}`);
    }
    keepOnlyCompetition(db, 'a');
    expect(db.prepare('SELECT id FROM pools').all()).toEqual([{ id: 'p-a' }]);
    expect(db.prepare('SELECT pool_id FROM pool_fencers').all()).toEqual([{ pool_id: 'p-a' }]);
    expect(db.prepare('SELECT id FROM matches ORDER BY id').all()).toEqual([
      { id: 'm-a' },
      { id: 't-a' },
    ]);
    expect(db.prepare('SELECT id FROM match_touches').all()).toEqual([{ id: 'mt-a' }]);
  });
});
