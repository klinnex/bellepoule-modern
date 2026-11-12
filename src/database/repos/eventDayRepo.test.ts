/**
 * Journée multi-épreuves (#1714) : dépôt testé sur SQLite réel (node:sqlite en mémoire,
 * schéma = toutes les migrations). Ignoré si node:sqlite indisponible.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventDayRepo } from './eventDayRepo';
import type { SqlExecutor } from './sqlExecutor';
import { ALL_MIGRATIONS } from '../migrations/migrations';
import { Weapon } from '../../shared/types';

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

const NOW = '2026-11-12T08:00:00.000Z';

describe.skipIf(!DatabaseSync)('EventDayRepo (#1714)', () => {
  let db: SqliteDb;
  let sql: SqlExecutor;
  let repo: EventDayRepo;

  const addCompetition = (id: string, weapon: Weapon) =>
    sql.run(
      `INSERT INTO competitions (id, title, date, weapon, gender, category, created_at, updated_at)
       VALUES (?, ?, '2026-11-12', ?, 'M', 'U15', ?, ?)`,
      [id, `Épreuve ${id}`, weapon, NOW, NOW]
    );
  const competitionReferees = (id: string) =>
    sql.queryAll<{ id: string; name: string; day_referee_id: string | null; status: string }>(
      'SELECT id, name, day_referee_id, status FROM referees WHERE competition_id = ? ORDER BY ref',
      [id]
    );

  beforeEach(() => {
    db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    sql = makeSql(db);
    repo = new EventDayRepo(sql);
    addCompetition('foilM15', Weapon.FOIL);
    addCompetition('foilF17', Weapon.FOIL);
    addCompetition('epeeM17', Weapon.EPEE);
  });

  it('crée une journée et rattache des épreuves', () => {
    const day = repo.createDay({ name: 'NEC', date: '2026-11-12', stripCount: 16 });
    repo.setCompetitionDay('foilM15', day.id);
    repo.setCompetitionDay('epeeM17', day.id);
    const [loaded] = repo.listDays();
    expect(loaded).toMatchObject({ name: 'NEC', stripCount: 16 });
    expect(loaded.competitionIds.sort()).toEqual(['epeeM17', 'foilM15']);
    expect(repo.getCompetitionDayId('foilF17')).toBeNull();
  });

  it('borne le nombre de pistes', () => {
    expect(repo.createDay({ name: 'a', date: '2026-11-12', stripCount: -3 }).stripCount).toBe(0);
    expect(repo.createDay({ name: 'b', date: '2026-11-12', stripCount: 5000 }).stripCount).toBe(
      999
    );
  });

  it('reporte les arbitres selon leur arme, sans doublon', () => {
    const day = repo.createDay({ name: 'NEC', date: '2026-11-12' });
    for (const c of ['foilM15', 'foilF17', 'epeeM17']) repo.setCompetitionDay(c, day.id);
    repo.createReferee(day.id, { firstName: 'Anne', lastName: 'Fleuret', weapons: [Weapon.FOIL] });
    repo.createReferee(day.id, { firstName: 'Paul', lastName: 'Epee', weapons: [Weapon.EPEE] });
    repo.createReferee(day.id, { firstName: 'Max', lastName: 'Tout', weapons: [] });

    expect(repo.syncCompetition('foilM15')).toEqual({ added: 2, updated: 0 });
    expect(competitionReferees('foilM15').map(r => r.name)).toEqual(['Anne Fleuret', 'Max Tout']);
    expect(competitionReferees('foilM15')[0].status).toBe('unavailable');
    expect(repo.syncCompetition('epeeM17')).toEqual({ added: 2, updated: 0 });
    expect(competitionReferees('epeeM17').map(r => r.name)).toEqual(['Paul Epee', 'Max Tout']);
    // Seconde synchro : rien à faire
    expect(repo.syncCompetition('foilM15')).toEqual({ added: 0, updated: 0 });
  });

  it('reprend une fiche homonyme existante et répercute les modifications', () => {
    const day = repo.createDay({ name: 'NEC', date: '2026-11-12' });
    repo.setCompetitionDay('foilM15', day.id);
    sql.run(
      `INSERT INTO referees (id, competition_id, ref, name, status, created_at, updated_at)
       VALUES ('r-old', 'foilM15', 1, 'anne fleuret', 'available', ?, ?)`,
      [NOW, NOW]
    );
    const anne = repo.createReferee(day.id, {
      firstName: 'Anne',
      lastName: 'Fleuret',
      club: 'NEC',
      weapons: [Weapon.FOIL],
    });
    expect(repo.syncCompetition('foilM15')).toEqual({ added: 0, updated: 1 });
    expect(competitionReferees('foilM15')).toEqual([
      { id: 'r-old', name: 'Anne Fleuret', day_referee_id: anne.id, status: 'available' },
    ]);
    repo.updateReferee(anne.id, { lastName: 'Fleuret-Dupont' });
    expect(repo.syncCompetition('foilM15')).toEqual({ added: 0, updated: 1 });
    expect(competitionReferees('foilM15')[0].name).toBe('Anne Fleuret-Dupont');
  });

  it("n'agit pas sur une épreuve hors journée", () => {
    expect(repo.syncCompetition('foilM15')).toEqual({ added: 0, updated: 0 });
  });

  it('voit les occupations (poule non terminée, match de tableau en cours) sur la journée', () => {
    const day = repo.createDay({ name: 'NEC', date: '2026-11-12' });
    repo.setCompetitionDay('foilM15', day.id);
    repo.setCompetitionDay('foilF17', day.id);
    const anne = repo.createReferee(day.id, { firstName: 'Anne', lastName: 'F', weapons: [] });
    repo.syncCompetition('foilM15');
    repo.syncCompetition('foilF17');
    const refM15 = competitionReferees('foilM15')[0].id;
    const refF17 = competitionReferees('foilF17')[0].id;

    sql.run(
      `INSERT INTO phases (id, competition_id, name, type, order_index, created_at, updated_at)
       VALUES ('ph1', 'foilM15', 'Poules', 'pool', 0, ?, ?)`,
      [NOW, NOW]
    );
    sql.run(
      `INSERT INTO pools (id, phase_id, number, strip, is_complete, referee_id, created_at, updated_at)
       VALUES ('p1', 'ph1', 2, 3, 0, ?, ?, ?), ('p2', 'ph1', 3, 4, 1, ?, ?, ?)`,
      [refM15, NOW, NOW, refM15, NOW, NOW]
    );
    sql.run(
      `INSERT INTO fencers (id, competition_id, ref, last_name, first_name, gender, created_at, updated_at)
       VALUES ('f1', 'foilF17', 1, 'A', 'a', 'F', ?, ?)`,
      [NOW, NOW]
    );
    sql.run(
      `INSERT INTO matches (id, number, fencer_a_id, max_score, status, referee_id, strip, created_at, updated_at)
       VALUES ('m1', 7, 'f1', 15, 'in_progress', ?, 9, ?, ?), ('m2', 8, 'f1', 15, 'not_started', ?, 10, ?, ?)`,
      [refF17, NOW, NOW, refF17, NOW, NOW]
    );

    const assignments = repo.getAssignments(day.id);
    expect(assignments).toHaveLength(2);
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dayRefereeId: anne.id,
          competitionId: 'foilM15',
          kind: 'pool',
          number: 2,
          strip: 3,
        }),
        expect.objectContaining({
          dayRefereeId: anne.id,
          competitionId: 'foilF17',
          kind: 'match',
          number: 7,
          strip: 9,
        }),
      ])
    );
    expect(repo.getLinks({ competitionId: 'foilM15' })).toEqual({ [refM15]: anne.id });
    expect(repo.getCompetitionWeapons(day.id)).toEqual({
      foilM15: Weapon.FOIL,
      foilF17: Weapon.FOIL,
    });
  });

  it('délie les fiches quand on supprime arbitre, rattachement ou journée', () => {
    const day = repo.createDay({ name: 'NEC', date: '2026-11-12' });
    repo.setCompetitionDay('foilM15', day.id);
    repo.setCompetitionDay('foilF17', day.id);
    const anne = repo.createReferee(day.id, { firstName: 'Anne', lastName: 'F' });
    repo.createReferee(day.id, { firstName: 'Bob', lastName: 'G' });
    repo.syncCompetition('foilM15');
    repo.syncCompetition('foilF17');

    repo.deleteReferee(anne.id);
    expect(competitionReferees('foilM15').map(r => r.day_referee_id === null)).toEqual([
      true,
      false,
    ]);
    repo.setCompetitionDay('foilM15', null);
    expect(competitionReferees('foilM15').every(r => r.day_referee_id === null)).toBe(true);
    repo.deleteDay(day.id);
    expect(repo.listDays()).toEqual([]);
    expect(repo.getCompetitionDayId('foilF17')).toBeNull();
    expect(competitionReferees('foilF17')).toHaveLength(2);
    expect(competitionReferees('foilF17').every(r => r.day_referee_id === null)).toBe(true);
  });
});
