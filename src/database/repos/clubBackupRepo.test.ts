/**
 * Mode Club : sauvegarde d'un club et rechargement sur un autre poste. SQLite réel.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ClubRepo } from './clubRepo';
import { ClubInventoryRepo } from './clubInventoryRepo';
import { ClubBackupRepo, CLUB_EXISTS_ERROR } from './clubBackupRepo';
import type { SqlExecutor } from './sqlExecutor';
import { ALL_MIGRATIONS } from '../migrations/migrations';
import { decodeClubBackup, encodeClubBackup } from '../../main/clubBackupFile';

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
      db.exec('SAVEPOINT t');
      try {
        const r = fn();
        db.exec('RELEASE t');
        return r;
      } catch (e) {
        db.exec('ROLLBACK TO t');
        db.exec('RELEASE t');
        throw e;
      }
    },
  };
}

function station() {
  const db = new DatabaseSync!(':memory:');
  for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
  const sql = makeSql(db);
  return {
    club: new ClubRepo(sql),
    inv: new ClubInventoryRepo(sql),
    backup: new ClubBackupRepo(sql),
  };
}

describe.skipIf(!DatabaseSync)('ClubBackupRepo (sauvegarde / chargement d’un club)', () => {
  let a: ReturnType<typeof station>;
  let b: ReturnType<typeof station>;
  let cid: string;

  beforeEach(() => {
    a = station();
    b = station();
    cid = a.club.createClub({ name: 'Cercle' }).id;
    const m1 = a.club.createMember(cid, { firstName: 'Ada', lastName: 'Lovelace' });
    const m2 = a.club.createMember(cid, { firstName: 'Alan', lastName: 'Turing' });
    const s = a.club.createSession(cid, { date: '2026-11-16' });
    a.club.setAttendance(s.id, m1.id, true);
    a.club.createBout({ sessionId: s.id, memberAId: m1.id, memberBId: m2.id });
    const cat = a.inv.createCategory(cid, 'Lames');
    a.inv.createBrand(cid, 'Allstar');
    const item = a.inv.createItem(cid, { name: 'Lame', category: cat.key, quantity: 4 });
    a.inv.lendItem({ itemId: item.id, memberId: m2.id, quantity: 1 });
    a.club.createExercise({ title: 'Footing', category: 'warmup', minutes: 10 });
    // Autre club, absent de la sauvegarde
    a.club.createMember(a.club.createClub({ name: 'Autre' }).id, {
      firstName: 'X',
      lastName: 'Y',
    });
  });

  it('recharge tout le club sur un autre poste (via le fichier .bpclub)', async () => {
    const file = await encodeClubBackup(a.backup.exportClub(cid));
    const r = b.backup.importClub(await decodeClubBackup(file));
    expect(r).toMatchObject({ clubId: cid, clubName: 'Cercle', replaced: false });
    expect(b.club.getClub(cid)?.name).toBe('Cercle');
    expect(b.club.listMembers(cid, true).map(m => m.lastName)).toEqual(['Lovelace', 'Turing']);
    const [session] = b.club.listSessions(cid);
    expect(session).toBeDefined();
    expect(b.club.listBouts({ clubId: cid, includeUnfinished: true })).toHaveLength(1);
    expect(b.inv.listCategories(cid).map(c => c.name)).toEqual(['Lames']);
    expect(b.inv.listBrands(cid).map(x => x.name)).toEqual(['Allstar']);
    const [item] = b.inv.listItems(cid);
    expect(item).toMatchObject({ name: 'Lame', quantity: 4, lentQuantity: 1 });
    expect(b.club.listExercises().map(e => e.title)).toEqual(['Footing']);
    expect(b.club.listClubs()).toHaveLength(1);
  });

  it('club déjà présent : refus sans remplacement, remplacement sans doublon', () => {
    const data = a.backup.exportClub(cid);
    b.backup.importClub(data);
    expect(() => b.backup.importClub(data)).toThrow(CLUB_EXISTS_ERROR);
    b.club.createMember(cid, { firstName: 'Local', lastName: 'Seulement' });
    const r = b.backup.importClub(data, true);
    expect(r.replaced).toBe(true);
    expect(b.club.listMembers(cid, true)).toHaveLength(2);
    expect(b.inv.listItems(cid)).toHaveLength(1);
    expect(b.club.listExercises()).toHaveLength(1);
  });

  it('refuse un fichier qui n’est pas une sauvegarde de club', async () => {
    expect(() => b.backup.importClub({ format: 'autre' })).toThrow(/sauvegarde de club/);
    expect(() => b.backup.importClub({ ...a.backup.exportClub(cid), version: 999 })).toThrow(
      /plus récente/
    );
    await expect(decodeClubBackup(Buffer.from('pas un zip'))).rejects.toThrow(/sauvegarde/);
  });
});
