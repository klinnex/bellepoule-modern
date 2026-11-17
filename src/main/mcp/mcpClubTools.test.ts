/**
 * Outils MCP des séances du Mode Club (#1872, #1880) : base SQLite réelle, appels par le
 * protocole (handleMcpMessage), comme mcpExtraTools.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../database';
import { hasNodeSqlite } from '../../database/testing/nodeSqliteDatabase';
import { handleMcpMessage } from './mcpServer';
import type { McpWriteDeps } from './mcpWriteTools';
import { linkedClubSession, setLinkedClubSession } from '../remote/clubArena';

vi.mock('better-sqlite3', async () => ({
  default: (await import('../../database/testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

interface Reply {
  result?: { content: Array<{ text: string }>; isError?: boolean; tools?: Array<{ name: string }> };
  error?: { message: string };
}

let db: DatabaseManager;
let deps: McpWriteDeps;
let clubId: string;

const rpc = (method: string, params: Record<string, unknown>, allowWrite = true) =>
  handleMcpMessage(
    { jsonrpc: '2.0', id: 1, method, params },
    deps,
    '1',
    undefined,
    allowWrite
  ) as Promise<Reply>;
const call = (name: string, args: Record<string, unknown> = {}, allowWrite = true) =>
  rpc('tools/call', { name, arguments: args }, allowWrite);
const ok = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await call(name, args);
  if (r.error || r.result?.isError) {
    throw new Error(r.error?.message ?? r.result?.content[0].text);
  }
  return JSON.parse(r.result!.content[0].text);
};
const ko = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await call(name, args);
  expect(r.result?.isError).toBe(true);
  return r.result!.content[0].text;
};

beforeEach(async () => {
  db = new DatabaseManager(':memory:');
  await db.open(':memory:');
  deps = {
    db,
    notify: vi.fn(),
    remoteServers: () => [],
    cyranoStatus: () => null,
    allowedRoots: () => [],
  } as unknown as McpWriteDeps;
  clubId = db.club.createClub({ name: 'Club test' }).id;
});

afterEach(() => {
  setLinkedClubSession(null);
  db.close();
});

const member = (firstName: string, lastName: string) =>
  db.club.createMember(clubId, { firstName, lastName } as never);

d('outils MCP — séances du club', () => {
  it('sont déclarés en lecture et en écriture', async () => {
    const r = await rpc('tools/list', {});
    const names = r.result!.tools!.map(t => t.name);
    for (const n of [
      'list_clubs',
      'list_club_sessions',
      'get_club_session',
      'create_club_session',
      'start_club_session',
      'close_club_session',
      'reopen_club_session',
      'update_club_session',
      'check_in_club_members',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('liste les clubs et refuse un club inconnu', async () => {
    const clubs = await ok('list_clubs');
    expect(clubs.map((c: { id: string }) => c.id)).toContain(clubId);
    expect(await ko('list_club_sessions', { clubId: 'inconnu' })).toMatch(/Club inconnu/);
  });

  it('crée une séance ouverte, puis la prépare si planned est vrai', async () => {
    const open = await ok('create_club_session', {
      clubId,
      date: '2026-11-17',
      label: 'Cours débutants',
      weapon: 'F',
      stripCount: 3,
      ageFrom: 'U11',
      ageTo: 'U13',
    });
    expect(open).toMatchObject({ status: 'open', label: 'Cours débutants', stripCount: 3 });

    const planned = await ok('create_club_session', {
      clubId,
      date: '2026-11-24',
      planned: true,
    });
    expect(planned.status).toBe('planned');
    expect(db.club.getSession(planned.id)?.ageFrom).toBeUndefined();
  });

  it('valide la date, l’arme et les pistes à la création', async () => {
    expect(await ko('create_club_session', { clubId, date: '17/11/2026' })).toMatch(/AAAA-MM-JJ/);
    expect(await ko('create_club_session', { clubId, date: '2026-11-17', weapon: 'X' })).toMatch(
      /weapon/
    );
    expect(await ko('create_club_session', { clubId, date: '2026-11-17', stripCount: 0 })).toMatch(
      /stripCount/
    );
  });

  it('dryRun décrit sans écrire', async () => {
    const r = await ok('create_club_session', { clubId, date: '2026-11-17', dryRun: true });
    expect(r).toMatchObject({ dryRun: true });
    expect(db.club.listSessions(clubId)).toHaveLength(0);
  });

  it('ouvre une séance préparée, puis refuse de la rouvrir sans la fermer', async () => {
    const s = await ok('create_club_session', { clubId, date: '2026-11-24', planned: true });
    expect((await ok('start_club_session', { sessionId: s.id })).status).toBe('open');
    expect(await ko('start_club_session', { sessionId: s.id })).toMatch(/non préparée/);
    expect(await ko('reopen_club_session', { sessionId: s.id })).toMatch(/non fermée/);
  });

  it('ferme une séance, annule ses combats en cours et la délie du serveur d’entraînement', async () => {
    const s = await ok('create_club_session', { clubId, date: '2026-11-17' });
    const a = member('Ada', 'Lovelace');
    const b = member('Bob', 'Martin');
    const bout = db.club.createBout({
      sessionId: s.id,
      strip: 1,
      memberAId: a.id,
      memberBId: b.id,
    } as never);
    db.club.startBout(bout.id);
    setLinkedClubSession(s.id);

    const closed = await ok('close_club_session', { sessionId: s.id });
    expect(closed.status).toBe('closed');
    expect(db.club.getBout(bout.id)?.status).toBe('cancelled');
    expect(linkedClubSession()).toBeNull();
    expect(await ko('close_club_session', { sessionId: s.id })).toMatch(/non ouverte/);

    expect((await ok('reopen_club_session', { sessionId: s.id })).status).toBe('open');
  });

  it('pointe et dépointe les membres ; refuse un membre d’un autre club', async () => {
    const s = await ok('create_club_session', { clubId, date: '2026-11-17' });
    const a = member('Ada', 'Lovelace');
    const b = member('Bob', 'Martin');

    const checked = await ok('check_in_club_members', {
      sessionId: s.id,
      memberIds: [a.id, b.id],
      present: true,
    });
    expect(checked.attendeeCount).toBe(2);

    const detail = await ok('get_club_session', { sessionId: s.id });
    expect(detail.attendees.map((x: { name: string }) => x.name)).toEqual(
      expect.arrayContaining(['Ada Lovelace', 'Bob Martin'])
    );

    const after = await ok('check_in_club_members', {
      sessionId: s.id,
      memberIds: [a.id],
      present: false,
    });
    expect(after.attendeeCount).toBe(1);

    const other = db.club.createClub({ name: 'Autre' });
    const stranger = db.club.createMember(other.id, { firstName: 'X', lastName: 'Y' } as never);
    expect(
      await ko('check_in_club_members', {
        sessionId: s.id,
        memberIds: [stranger.id],
        present: true,
      })
    ).toMatch(/Membre inconnu/);
  });

  it('met à jour le bilan et les notes ; refuse une mise à jour vide', async () => {
    const s = await ok('create_club_session', { clubId, date: '2026-11-17' });
    const u = await ok('update_club_session', {
      sessionId: s.id,
      notes: 'Bon cours',
      feedback: { rating: 4, wentWell: 'Échauffement', toImprove: 'Temps de pause' },
    });
    expect(u.id).toBe(s.id);
    const stored = db.club.getSession(s.id)!;
    expect(stored.notes).toBe('Bon cours');
    expect(stored.feedback).toMatchObject({ rating: 4, wentWell: 'Échauffement' });

    expect(await ko('update_club_session', { sessionId: s.id, feedback: { rating: 9 } })).toMatch(
      /entre 1 et 5/
    );
    expect(await ko('update_club_session', { sessionId: s.id })).toMatch(/Aucun champ/);
  });

  it('refuse les écritures quand l’écriture n’est pas autorisée', async () => {
    const r = await call('create_club_session', { clubId, date: '2026-11-17' }, false);
    expect(r.result?.isError ?? r.error).toBeTruthy();
    expect(db.club.listSessions(clubId)).toHaveLength(0);
  });

  it('liste les séances avec filtres de période et de statut', async () => {
    const a = await ok('create_club_session', { clubId, date: '2026-10-01' });
    await ok('create_club_session', { clubId, date: '2026-11-17', planned: true });
    await ok('close_club_session', { sessionId: a.id });

    const all = await ok('list_club_sessions', { clubId });
    expect(all).toHaveLength(2);
    expect(await ok('list_club_sessions', { clubId, status: 'planned' })).toHaveLength(1);
    expect(await ok('list_club_sessions', { clubId, from: '2026-11-01' })).toHaveLength(1);
    expect(await ok('list_club_sessions', { clubId, to: '2026-10-31' })).toHaveLength(1);
  });
});
