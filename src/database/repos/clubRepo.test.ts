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
  let cid: string;

  beforeEach(() => {
    const db = new DatabaseSync!(':memory:');
    for (const m of ALL_MIGRATIONS) m.up({ run: (s: string) => db.exec(s) });
    repo = new ClubRepo(makeSql(db));
    cid = repo.createClub({ name: 'Club' }).id;
  });

  const member = (lastName: string, extra = {}) =>
    repo.createMember(cid, { firstName: 'X', lastName, ...extra });

  describe('membres', () => {
    it('crée, normalise et liste par nom', () => {
      const m = repo.createMember(cid, {
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
      expect(repo.listMembers(cid).map(x => x.lastName)).toEqual(['Abel', 'Zola']);
    });

    it('import en lot : création, complément, doublons', () => {
      const a = member('Abel', { license: '1' });
      const r = repo.importMembers(cid, [
        { firstName: 'X', lastName: 'Abel', license: '1' },
        { firstName: 'Y', lastName: 'Zola', gender: 'F', birthYear: 2012 },
        { firstName: 'Y', lastName: 'ZOLA' },
        { firstName: ' ', lastName: ' ' },
      ]);
      expect(r).toEqual({ created: 1, updated: 0, skipped: 3 });
      const zola = repo.listMembers(cid).find(m => m.lastName === 'Zola')!;
      expect(zola).toMatchObject({ gender: 'F', birthYear: 2012 });
      expect(zola.cardCode).toMatch(/^[0-9A-F]{10}$/);
      expect(
        repo.importMembers(cid, [{ firstName: 'X', lastName: 'ABEL', birthYear: 2000 }])
      ).toEqual({
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
        repo.setPhotosByLicense(cid, [
          { license: '42', photo: png },
          { license: '99', photo: png },
          { license: '42', photo: 'javascript:x' },
        ])
      ).toEqual({ matched: 1, total: 3 });
      expect(repo.getMember(a.id)!.photo).toBe(png);
    });

    it('nom requis', () => {
      expect(() => repo.createMember(cid, { firstName: ' ', lastName: '' })).toThrow();
    });

    it('archive : masqué par défaut, visible avec includeInactive', () => {
      const m = member('Abel');
      repo.updateMember(m.id, { active: false, laterality: 'X' as never });
      expect(repo.listMembers(cid)).toHaveLength(0);
      expect(repo.listMembers(cid, true)[0]).toMatchObject({
        active: false,
        laterality: undefined,
      });
    });

    it('suppression RGPD : combats et présences effacés', () => {
      const a = member('A');
      const b = member('B');
      const s = repo.createSession(cid, { date: '2026-11-16' });
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

    it('nom + logo + pistes du club, logo validé, null efface', () => {
      expect(repo.getClub(cid)).toMatchObject({ name: 'Club', logo: undefined, stripCount: 1 });
      expect(repo.updateClub(cid, { stripCount: 250 })!.stripCount).toBe(99);
      expect(repo.updateClub(cid, { stripCount: 4 })!.stripCount).toBe(4);
      const png = 'data:image/png;base64,iVBORw0KGgo=';
      expect(repo.updateClub(cid, { name: ' <Cercle> ', logo: png })).toMatchObject({
        name: 'Cercle',
        logo: png,
        stripCount: 4,
      });
      expect(() => repo.updateClub(cid, { logo: 'javascript:alert(1)' })).toThrow();
      expect(() => repo.updateClub(cid, { logo: 'data:text/html;base64,PGI+' })).toThrow();
      expect(() => repo.updateClub(cid, { name: '  ' })).toThrow();
      expect(repo.updateClub(cid, { logo: null })!.logo).toBeUndefined();
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
      const codes = r.listMembers('club-default').map(m => m.cardCode);
      expect(codes.every(c => /^[0-9A-F]{10}$/.test(c))).toBe(true);
      expect(new Set(codes).size).toBe(2);
    });
  });

  describe('préparation et bilan des séances', () => {
    it('séance préparée : plan, objectifs, démarrage, une seule ouverte', () => {
      const s = repo.createSession(cid, {
        date: '2026-11-20',
        label: 'Parades',
        planned: true,
        objectives: 'Parade de quarte',
        plan: [
          { id: 'e1', title: 'Échauffement', minutes: 15 },
          { id: 'e2', title: 'Assauts', minutes: 30, details: 'Touches à 5' },
        ],
      });
      expect(s).toMatchObject({ status: 'planned', objectives: 'Parade de quarte' });
      expect(s.plan.map(p => p.title)).toEqual(['Échauffement', 'Assauts']);
      // Pas de combat sur une séance seulement préparée
      const [a, b] = [member('A'), member('B')];
      expect(() =>
        repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id })
      ).toThrow();
      const other = repo.createSession(cid, { date: '2026-11-16' });
      expect(() => repo.startSession(s.id)).toThrow('Une séance est déjà ouverte');
      repo.closeSession(other.id);
      expect(repo.startSession(s.id)!.status).toBe('open');
      const done = repo.updateSession(s.id, {
        plan: s.plan.map(p => ({ ...p, done: p.id === 'e1' })),
        notes: 'Bonne énergie',
      })!;
      expect(done.plan.find(p => p.id === 'e1')!.done).toBe(true);
      expect(done.notes).toBe('Bonne énergie');
    });

    it('bilan de séance et remarques par tireur', () => {
      const [a, b] = [member('A'), member('B')];
      const s = repo.createSession(cid, { date: '2026-11-16', label: 'Soir' });
      repo.setAttendance(s.id, a.id, true);
      expect(
        repo.updateSession(s.id, { feedback: { rating: 4, wentWell: 'Rythme', toImprove: '' } })!
          .feedback
      ).toEqual({ rating: 4, wentWell: 'Rythme' });
      repo.setMemberFeedback(s.id, a.id, 'Bonne parade');
      expect(() => repo.setMemberFeedback(s.id, b.id, 'Absent')).toThrow();
      expect(repo.getSession(s.id)!.memberFeedback).toEqual({ [a.id]: 'Bonne parade' });
      expect(repo.getMemberFeedback(a.id)).toEqual([
        { sessionId: s.id, date: '2026-11-16', label: 'Soir', text: 'Bonne parade' },
      ]);
      repo.setMemberFeedback(s.id, a.id, '  ');
      expect(repo.getMemberFeedback(a.id)).toEqual([]);
      expect(repo.updateSession(s.id, { feedback: null })!.feedback).toBeUndefined();
    });
  });

  describe('plusieurs clubs', () => {
    it('membres, séances et combats cloisonnés par club ; résumé pour l’accueil', () => {
      const other = repo.createClub({ name: 'Autre salle', stripCount: 3 }).id;
      const a = member('A');
      const b = member('B');
      const z = repo.createMember(other, { firstName: 'Z', lastName: 'Zed' });
      expect(repo.listMembers(cid).map(m => m.lastName)).toEqual(['A', 'B']);
      expect(repo.listMembers(other).map(m => m.lastName)).toEqual(['Zed']);
      const s = repo.createSession(other, { date: '2026-11-16' });
      expect(s).toMatchObject({ clubId: other, stripCount: 3 });
      expect(repo.listSessions(cid)).toHaveLength(0);
      // Membre d'un autre club : refusé en pointage, en combat et au scan
      expect(() => repo.setAttendance(s.id, a.id, true)).toThrow();
      expect(() =>
        repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: z.id })
      ).toThrow();
      expect(repo.findMemberByCardCode(a.cardCode, other)).toBeNull();
      expect(repo.findMemberByCardCode(a.cardCode, cid)!.id).toBe(a.id);
      const s2 = repo.createSession(cid, { date: '2026-11-16' });
      repo.finishBout(repo.createBout({ sessionId: s2.id, memberAId: a.id, memberBId: b.id }).id, {
        scoreA: 5,
        scoreB: 1,
      });
      expect(repo.listBouts({ clubId: cid })).toHaveLength(1);
      expect(repo.listBouts({ clubId: other })).toHaveLength(0);
      expect(repo.listClubs()).toEqual([
        expect.objectContaining({
          id: other,
          name: 'Autre salle',
          membersCount: 1,
          openSessionDate: '2026-11-16',
        }),
        expect.objectContaining({ id: cid, name: 'Club', membersCount: 2 }),
      ]);
    });

    it('suppression d’un club : toutes ses données, pas celles des autres', () => {
      const other = repo.createClub({ name: 'Autre' }).id;
      const z = repo.createMember(other, { firstName: 'Z', lastName: 'Zed' });
      const a = member('A');
      const b = member('B');
      const s = repo.createSession(cid, { date: '2026-11-16' });
      repo.setAttendance(s.id, a.id, true);
      repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id });
      repo.deleteClub(cid);
      expect(repo.getClub(cid)).toBeNull();
      expect(repo.getMember(a.id)).toBeNull();
      expect(repo.getSession(s.id)).toBeNull();
      expect(repo.listBouts({ includeUnfinished: true })).toHaveLength(0);
      expect(repo.getMember(z.id)).not.toBeNull();
    });

    it('création : nom requis, club inconnu refusé', () => {
      expect(() => repo.createClub({ name: ' ' })).toThrow();
      expect(() => repo.createMember('nope', { firstName: 'A', lastName: 'B' })).toThrow();
      expect(() => repo.createSession('nope', { date: '2026-11-16' })).toThrow();
    });

    it('migration 28 : le club unique devient « club-default »', () => {
      const db = new DatabaseSync!(':memory:');
      for (const m of ALL_MIGRATIONS.filter(x => x.version < 28))
        m.up({ run: (q: string) => db.exec(q) });
      db.exec(
        `INSERT INTO club_settings (key, value) VALUES ('name', 'Cercle'), ('strip_count', '4');
         INSERT INTO club_members (id, first_name, last_name, card_code, created_at, updated_at)
           VALUES ('m1', 'A', 'B', 'A1B2C3D4E5', '', '');`
      );
      for (const m of ALL_MIGRATIONS.filter(x => x.version >= 28))
        m.up({ run: (q: string) => db.exec(q) });
      const r = new ClubRepo(makeSql(db));
      expect(r.listClubs()).toEqual([
        expect.objectContaining({
          id: 'club-default',
          name: 'Cercle',
          stripCount: 4,
          membersCount: 1,
        }),
      ]);
      expect(r.listMembers('club-default')[0].id).toBe('m1');
    });

    it('migration 28 sans données : aucun club créé', () => {
      expect(repo.listClubs().map(c => c.id)).toEqual([cid]);
    });
  });

  describe('séances', () => {
    it('crée avec pistes bornées, date validée', () => {
      const s = repo.createSession(cid, {
        date: '2026-11-16',
        stripCount: 500,
        weapon: Weapon.FOIL,
      });
      expect(s).toMatchObject({ stripCount: 99, status: 'open', weapon: Weapon.FOIL });
      expect(() => repo.createSession(cid, { date: '16/11/2026' })).toThrow();
    });

    it('liste filtrée par plage, plus récente d’abord', () => {
      repo.createSession(cid, { date: '2026-09-10' });
      repo.createSession(cid, { date: '2026-11-16' });
      repo.createSession(cid, { date: '2027-01-05' });
      expect(
        repo.listSessions(cid, { from: '2026-10-01', to: '2027-12-31' }).map(s => s.date)
      ).toEqual(['2027-01-05', '2026-11-16']);
    });

    it('pointage idempotent, dépointage', () => {
      const a = member('A');
      const s = repo.createSession(cid, { date: '2026-11-16' });
      repo.setAttendance(s.id, a.id, true);
      expect(repo.setAttendance(s.id, a.id, true)).toEqual([a.id]);
      expect(repo.setAttendance(s.id, a.id, false)).toEqual([]);
      expect(() => repo.setAttendance(s.id, 'ghost', true)).toThrow();
    });

    it('changer la date répercute sur les combats', () => {
      const [a, b] = [member('A'), member('B')];
      const s = repo.createSession(cid, { date: '2026-11-16' });
      repo.createBout({ sessionId: s.id, memberAId: a.id, memberBId: b.id });
      repo.updateSession(s.id, { date: '2026-11-17' });
      expect(repo.listBouts({ includeUnfinished: true })[0].date).toBe('2026-11-17');
    });

    it('fermeture : combats en cours annulés, création refusée', () => {
      const [a, b] = [member('A'), member('B')];
      const s = repo.createSession(cid, { date: '2026-11-16' });
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
      const s = repo.createSession(cid, { date: '2026-11-16' });
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
      sid = repo.createSession(cid, { date: '2026-11-16', stripCount: 3, weapon: Weapon.SABRE }).id;
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
      const s2 = repo.createSession(cid, { date: '2027-02-01', weapon: Weapon.EPEE }).id;
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
