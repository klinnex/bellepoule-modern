/**
 * Mode Club (#1872) : membres, séances, pointage, combats. SQLite réel (node:sqlite en mémoire).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ClubRepo } from './clubRepo';
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
    transaction: fn => fn(),
  };
}

describe.skipIf(!DatabaseSync)('ClubRepo (#1872)', () => {
  let repo: ClubRepo;

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    repo = new ClubRepo(makeSql(db));
  });

  const member = (lastName: string, extra = {}) =>
    repo.createMember({ firstName: 'X', lastName, ...extra });

  describe('membres', () => {
    it('crée, normalise et liste par nom', () => {
      const m = repo.createMember({
        firstName: '  <b>Léa</b> ',
        lastName: 'Zola',
        weapons: [Weapon.EPEE, 'Z' as Weapon, Weapon.EPEE],
        laterality: 'L',
        birthYear: 2010,
      });
      expect(m).toMatchObject({
        firstName: 'bLéa/b',
        weapons: [Weapon.EPEE],
        laterality: 'L',
        birthYear: 2010,
        active: true,
      });
      member('Abel');
      expect(repo.listMembers().map(x => x.lastName)).toEqual(['Abel', 'Zola']);
    });

    it('import en lot : création, complément, doublons', () => {
      const a = member('Abel', { license: '1' });
      const r = repo.importMembers([
        { firstName: 'X', lastName: 'Abel', license: '1' },
        { firstName: 'Y', lastName: 'Zola', gender: 'F', birthYear: 2012 },
        { firstName: 'Y', lastName: 'ZOLA' },
        { firstName: ' ', lastName: ' ' },
      ]);
      expect(r).toEqual({ created: 1, updated: 0, skipped: 3 });
      const zola = repo.listMembers().find(m => m.lastName === 'Zola')!;
      expect(zola).toMatchObject({ gender: 'F', birthYear: 2012 });
      expect(zola.cardCode).toMatch(/^[0-9A-F]{10}$/);
      expect(repo.importMembers([{ firstName: 'X', lastName: 'ABEL', birthYear: 2000 }])).toEqual({
        created: 0,
        updated: 1,
        skipped: 0,
      });
      expect(repo.getMember(a.id)!.birthYear).toBe(2000);
    });

    it('photo : validée, effaçable, import par licence', () => {
      const png = 'data:image/png;base64,iVBORw0KGgo=';
      const a = member('A', { license: '42' });
      expect(repo.updateMember(a.id, { photo: png })!.photo).toBe(png);
      expect(() =>
        repo.updateMember(a.id, { photo: 'data:image/svg+xml;base64,PHN2Zz4=' })
      ).toThrow();
      expect(repo.updateMember(a.id, { photo: null })!.photo).toBeUndefined();
      expect(
        repo.setPhotosByLicense([
          { license: '42', photo: png },
          { license: '99', photo: png },
          { license: '42', photo: 'javascript:x' },
        ])
      ).toEqual({ matched: 1, total: 3 });
      expect(repo.getMember(a.id)!.photo).toBe(png);
    });

    it('nom requis', () => {
      expect(() => repo.createMember({ firstName: ' ', lastName: '' })).toThrow();
    });

    it('archive : masqué par défaut, visible avec includeInactive', () => {
      const m = member('Abel');
      repo.updateMember(m.id, { active: false, laterality: 'X' as never });
      expect(repo.listMembers()).toHaveLength(0);
      expect(repo.listMembers(true)[0]).toMatchObject({ active: false, laterality: undefined });
    });

    it('suppression RGPD : combats et présences effacés', () => {
      const a = member('A');
      const b = member('B');
      const s = repo.createSession({ date: '2026-11-16' });
      repo.setAttendance(s.id, a.id, true);
      const bt = repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id });
      repo.finishBout(bt.id, { scoreA: 5, scoreB: 1 });
      repo.deleteMember(a.id);
      expect(repo.getMember(a.id)).toBeNull();
      expect(repo.listBouts()).toHaveLength(0);
      expect(repo.getSession(s.id)!.attendeeIds).toEqual([]);
    });
  });

  describe('cartes et identité du club', () => {
    it('code carte unique à la création, retrouvé par code (actifs)', () => {
      const a = member('A');
      const b = member('B');
      expect(a.cardCode).toMatch(/^[0-9A-F]{10}$/);
      expect(a.cardCode).not.toBe(b.cardCode);
      expect(repo.findMemberByCardCode(a.cardCode.toLowerCase())!.id).toBe(a.id);
      expect(repo.findMemberByCardCode('nope')).toBeNull();
      repo.updateMember(a.id, { active: false });
      expect(repo.findMemberByCardCode(a.cardCode)).toBeNull();
    });

    it('régénération : ancienne carte invalide', () => {
      const a = member('A');
      const b = repo.regenerateCardCode(a.id)!;
      expect(b.cardCode).not.toBe(a.cardCode);
      expect(repo.findMemberByCardCode(a.cardCode)).toBeNull();
      expect(repo.findMemberByCardCode(b.cardCode)!.id).toBe(a.id);
    });

    it('code non modifiable via updateMember', () => {
      const a = member('A');
      repo.updateMember(a.id, { cardCode: 'AAAAAAAAAA' } as never);
      expect(repo.getMember(a.id)!.cardCode).toBe(a.cardCode);
    });

    it('nom + logo, logo validé, null efface', () => {
      expect(repo.getSettings()).toEqual({ name: '', logo: undefined, stripCount: 1 });
      expect(repo.updateSettings({ stripCount: 250 }).stripCount).toBe(99);
      expect(repo.updateSettings({ stripCount: 4 }).stripCount).toBe(4);
      const png = 'data:image/png;base64,iVBORw0KGgo=';
      expect(repo.updateSettings({ name: ' <Cercle> ', logo: png })).toEqual({
        name: 'Cercle',
        logo: png,
        stripCount: 4,
      });
      expect(() => repo.updateSettings({ logo: 'javascript:alert(1)' })).toThrow();
      expect(() => repo.updateSettings({ logo: 'data:text/html;base64,PGI+' })).toThrow();
      expect(repo.updateSettings({ logo: null })).toEqual({
        name: 'Cercle',
        logo: undefined,
        stripCount: 4,
      });
    });

    it('migration 26 : codes générés pour les membres existants', () => {
      const db = new DatabaseSync!(':memory:');
      for (const m of ALL_MIGRATIONS.filter(x => x.version < 26))
        m.up({ run: (s: string) => db.exec(s) });
      db.exec(
        `INSERT INTO club_members (id, first_name, last_name, created_at, updated_at) VALUES ('x', 'A', 'B', '', ''), ('y', 'C', 'D', '', '')`
      );
      for (const m of ALL_MIGRATIONS.filter(x => x.version >= 26))
        m.up({ run: (s: string) => db.exec(s) });
      const r = new ClubRepo(makeSql(db));
      const codes = r.listMembers().map(m => m.cardCode);
      expect(codes.every(c => /^[0-9A-F]{10}$/.test(c))).toBe(true);
      expect(new Set(codes).size).toBe(2);
    });
  });

  describe('séances', () => {
    it('crée avec pistes bornées, date validée', () => {
      const s = repo.createSession({ date: '2026-11-16', stripCount: 500, weapon: Weapon.FOIL });
      expect(s).toMatchObject({ stripCount: 99, status: 'open', weapon: Weapon.FOIL });
      expect(() => repo.createSession({ date: '16/11/2026' })).toThrow();
    });

    it('liste filtrée par plage, plus récente d’abord', () => {
      repo.createSession({ date: '2026-09-10' });
      repo.createSession({ date: '2026-11-16' });
      repo.createSession({ date: '2027-01-05' });
      expect(repo.listSessions({ from: '2026-10-01', to: '2027-12-31' }).map(s => s.date)).toEqual([
        '2027-01-05',
        '2026-11-16',
      ]);
    });

    it('pointage idempotent, dépointage', () => {
      const a = member('A');
      const s = repo.createSession({ date: '2026-11-16' });
      repo.setAttendance(s.id, a.id, true);
      expect(repo.setAttendance(s.id, a.id, true)).toEqual([a.id]);
      expect(repo.setAttendance(s.id, a.id, false)).toEqual([]);
      expect(() => repo.setAttendance(s.id, 'ghost', true)).toThrow();
    });

    it('changer la date répercute sur les combats', () => {
      const [a, b] = [member('A'), member('B')];
      const s = repo.createSession({ date: '2026-11-16' });
      repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id });
      repo.updateSession(s.id, { date: '2026-11-17' });
      expect(repo.listBouts({ includeUnfinished: true })[0].date).toBe('2026-11-17');
    });

    it('fermeture : combats en cours annulés, création refusée', () => {
      const [a, b] = [member('A'), member('B')];
      const s = repo.createSession({ date: '2026-11-16' });
      const bt = repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id });
      expect(repo.closeSession(s.id)).toMatchObject({ status: 'closed' });
      expect(repo.getBout(bt.id)!.status).toBe('cancelled');
      expect(() => repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id })).toThrow(
        'Séance fermée'
      );
      expect(repo.reopenSession(s.id)).toMatchObject({ status: 'open', closedAt: undefined });
    });

    it('suppression : combats et présences effacés', () => {
      const [a, b] = [member('A'), member('B')];
      const s = repo.createSession({ date: '2026-11-16' });
      repo.setAttendance(s.id, a.id, true);
      repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id });
      repo.deleteSession(s.id);
      expect(repo.getSession(s.id)).toBeNull();
      expect(repo.listBouts({ includeUnfinished: true })).toHaveLength(0);
    });
  });

  describe('combats', () => {
    let a: string;
    let b: string;
    let sid: string;
    beforeEach(() => {
      a = member('A').id;
      b = member('B').id;
      sid = repo.createSession({ date: '2026-11-16', stripCount: 3, weapon: Weapon.SABRE }).id;
    });

    it('contrôles à la création', () => {
      expect(() => repo.createBout({ sessionId: sid, memberAId: a, memberBId: a })).toThrow();
      expect(() => repo.createBout({ sessionId: sid, memberAId: a, memberBId: 'x' })).toThrow();
      expect(() => repo.createBout({ sessionId: 'x', memberAId: a, memberBId: b })).toThrow();
      const bt = repo.createBout({ sessionId: sid, memberAId: a, memberBId: b, strip: 9 });
      expect(bt).toMatchObject({
        strip: 3,
        maxScore: 5,
        status: 'pending',
        weapon: Weapon.SABRE,
        date: '2026-11-16',
        entryMode: 'master',
      });
    });

    it('cycle : départ, score en cours, fin', () => {
      const bt = repo.createBout({ sessionId: sid, memberAId: a, memberBId: b, entryMode: 'self' });
      expect(repo.startBout(bt.id)!.status).toBe('in_progress');
      expect(repo.updateBoutScore(bt.id, 3, -2)).toMatchObject({ scoreA: 3, scoreB: 0 });
      const done = repo.finishBout(bt.id, { scoreA: 5, scoreB: 4, duration: 120 })!;
      expect(done).toMatchObject({
        status: 'finished',
        winnerId: a,
        entryMode: 'self',
        duration: 120,
      });
      expect(done.finishedAt).toBeDefined();
      // Score figé une fois terminé
      expect(repo.updateBoutScore(bt.id, 0, 0)).toMatchObject({ scoreA: 5 });
    });

    it('correction après coup + vainqueur explicite', () => {
      const bt = repo.createBout({ sessionId: sid, memberAId: a, memberBId: b });
      repo.finishBout(bt.id, { scoreA: 5, scoreB: 2 });
      expect(
        repo.finishBout(bt.id, { scoreA: 4, scoreB: 4, winnerId: b, entryMode: 'referee' })
      ).toMatchObject({ winnerId: b, entryMode: 'referee' });
      expect(repo.finishBout(bt.id, { scoreA: 3, scoreB: 3, winnerId: 'x' })!.winnerId).toBeNull();
    });

    it('piste occupée : second combat refusé, libérée une fois terminé', () => {
      const c = member('C').id;
      const bt = repo.createBout({ sessionId: sid, memberAId: a, memberBId: b, strip: 2 });
      expect(() =>
        repo.createBout({ sessionId: sid, memberAId: a, memberBId: c, strip: 2 })
      ).toThrow('Piste 2 occupée');
      repo.finishBout(bt.id, { scoreA: 5, scoreB: 3 });
      expect(repo.createBout({ sessionId: sid, memberAId: a, memberBId: c, strip: 2 }).strip).toBe(
        2
      );
    });

    it('annulé : non terminable', () => {
      const bt = repo.createBout({ sessionId: sid, memberAId: a, memberBId: b });
      repo.cancelBout(bt.id);
      expect(() => repo.finishBout(bt.id, { scoreA: 5, scoreB: 0 })).toThrow();
    });

    it('filtres : membre, plage, arme, terminés seuls par défaut', () => {
      const c = member('C').id;
      const s2 = repo.createSession({ date: '2027-02-01', weapon: Weapon.EPEE }).id;
      repo.finishBout(repo.createBout({ sessionId: sid, memberAId: a, memberBId: b }).id, {
        scoreA: 5,
        scoreB: 1,
      });
      repo.finishBout(repo.createBout({ sessionId: s2, memberAId: b, memberBId: c }).id, {
        scoreA: 2,
        scoreB: 5,
      });
      repo.createBout({ sessionId: s2, memberAId: a, memberBId: c });
      expect(repo.listBouts()).toHaveLength(2);
      expect(repo.listBouts({ includeUnfinished: true })).toHaveLength(3);
      expect(repo.listBouts({ memberId: c })).toHaveLength(1);
      expect(repo.listBouts({ from: '2027-01-01', to: '2027-03-31' })).toHaveLength(1);
      expect(repo.listBouts({ weapon: Weapon.SABRE })).toHaveLength(1);
      expect(repo.listBouts({ sessionId: s2, includeUnfinished: true })).toHaveLength(2);
    });

    it('suppression', () => {
      const bt = repo.createBout({ sessionId: sid, memberAId: a, memberBId: b });
      repo.deleteBout(bt.id);
      expect(repo.getBout(bt.id)).toBeNull();
    });
  });
});
