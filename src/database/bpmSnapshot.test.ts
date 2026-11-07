// @vitest-environment node
/**
 * Snapshot .bpm : l'export d'une compétition doit restituer à l'identique (contenu
 * de chaque table) matchs, tableau (y compris places vides), touches, cartons,
 * poules, signatures, arbitres, état de session et arènes.
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseManager } from './index';

type Raw = {
  prepare: (sql: string) => { all: (...a: unknown[]) => unknown[] };
  exec: (s: string) => void;
};
const raw = (db: DatabaseManager) => (db as unknown as { db: Raw }).db;
const tablesOf = (db: DatabaseManager): string[] =>
  (
    raw(db)
      .prepare(
        `SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`
      )
      .all() as { name: string }[]
  ).map(r => r.name);
const contentOf = (db: DatabaseManager, table: string): string =>
  JSON.stringify(raw(db).prepare(`SELECT * FROM "${table}" ORDER BY 1`).all());

/** Compétition complète : poules, tableau (avec places vides), touches, cartons, arbitre, arène */
function seedCompetition(db: DatabaseManager, label: string) {
  const c = db.createCompetition({ title: `Compet ${label}` } as never) as unknown as {
    id: string;
  };
  const pool = db.createPhase(c.id, 'POOL', 1, 'Poules') as unknown as { id: string };
  const de = db.createPhase(c.id, 'DIRECT_ELIMINATION', 2, 'Tableau') as unknown as { id: string };
  const f = [0, 1, 2, 3].map(
    i =>
      db.addFencer(c.id, {
        firstName: `${label}${i}`,
        lastName: 'L',
        photo: `data:img${i}`,
      } as never) as unknown as { id: string }
  );
  const p = db.createPool(pool.id, 1) as unknown as { id: string };
  f.slice(0, 3).forEach((x, i) => db.addFencerToPool(p.id, x.id, i));
  const m1 = db.createMatch(
    { fencerA: f[0], fencerB: f[1], maxScore: 5, number: 1 } as never,
    p.id
  ) as unknown as { id: string };
  const m2 = db.createMatch(
    { fencerA: f[1], fencerB: f[2], maxScore: 5, number: 2 } as never,
    p.id
  ) as unknown as { id: string };
  db.updateMatch(m1.id, { scoreA: 5, scoreB: 3, status: 'finished' } as never);
  db.updateMatch(m2.id, { scoreA: 2, scoreB: 1, status: 'in_progress' } as never);
  db.saveTouch({
    id: `${label}-t1`,
    matchId: m1.id,
    fencerId: f[0].id,
    zone: 'A',
    points: 1,
    timestamp: 'T1',
  });
  db.saveCard({
    id: `${label}-k1`,
    matchId: m1.id,
    fencerId: f[1].id,
    cardType: 'yellow',
    reason: 'r',
    cardGroup: 1,
    timestamp: 'T2',
    pointsAwarded: 0,
  });
  db.logScoreChange({ matchId: m1.id, newScoreA: 5, newScoreB: 3, changedBy: 'arbitre' });
  db.savePoolSignature(p.id, f[0].id, 'sig-pool');
  // Tableau : une rencontre jouée, deux places vides (tours à venir)
  db.upsertTableauMatch({
    competitionId: c.id,
    matchId: `${label}-r1`,
    round: 1,
    position: 0,
    fencerAId: f[0].id,
    fencerBId: f[3].id,
    scoreA: 15,
    scoreB: 10,
    status: 'finished',
  });
  db.upsertTableauMatch({
    competitionId: c.id,
    matchId: `${label}-r2`,
    round: 2,
    position: 0,
    fencerAId: null,
    fencerBId: null,
    status: 'not_started',
  });
  db.upsertBracketNode({
    id: `${label}-bn1`,
    competitionId: c.id,
    phaseId: de.id,
    round: 1,
    position: 0,
    fencerId: f[0].id,
    matchId: m1.id,
  } as never);
  const ref = db.createReferee(c.id, { name: 'Ref R' }) as unknown as { id: string };
  db.updatePoolReferees(p.id, [ref.id]);
  db.saveAbandonSnapshot(f[2].id, c.id, 'qualified', 'withdraw', [
    { matchId: m2.id, status: 'not_started', scoreA: null, scoreB: null },
  ]);
  db.saveArenaExit({
    id: `${label}-x1`,
    matchId: m2.id,
    fencerId: f[1].id,
    exitType: 'exclusion',
    timestamp: 'T3',
    pointsAwarded: 0,
  });
  db.saveSessionState(c.id, {
    currentPhase: 1,
    pools: [{ id: p.id }],
    poolsLaunched: true,
  } as never);
  db.saveArenaState(`arene-${label}`, {
    competitionId: c.id,
    currentMatch: { id: m2.id },
    matchQueue: [],
    settings: {},
    status: 'running',
  });
  return { c, m1, m2 };
}

const dirs: string[] = [];
const newDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-snap-'));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

describe('.bpm snapshot (DatabaseManager réel)', () => {
  it('restitue à l’identique le contenu de chaque table de la compétition', async () => {
    const dir = newDir();
    const src = new DatabaseManager(path.join(dir, 'src.db'));
    await src.open();
    const { c, m1 } = seedCompetition(src, 'A');

    const file = path.join(dir, 'export.bpm');
    await src.exportCompetitionToFile(c.id, file);
    const dst = new DatabaseManager(path.join(dir, 'dst.db'));
    await dst.open();
    expect(await dst.mergeFromFile(file)).toEqual([c.id]);

    for (const t of tablesOf(src)) {
      expect(contentOf(dst, t), `table ${t}`).toBe(contentOf(src, t));
    }
    expect(dst.getMatch(m1.id)).toBeTruthy();
    src.close();
    dst.close();
  });

  it('n’embarque aucune donnée d’une autre compétition', async () => {
    const dir = newDir();
    const src = new DatabaseManager(path.join(dir, 'src.db'));
    await src.open();
    const { c } = seedCompetition(src, 'A');
    const other = seedCompetition(src, 'B');
    const file = path.join(dir, 'export.bpm');
    await src.exportCompetitionToFile(c.id, file);
    const dst = new DatabaseManager(path.join(dir, 'dst.db'));
    await dst.open();
    await dst.mergeFromFile(file);
    expect(dst.getMatch(other.m1.id)).toBeNull();
    expect(contentOf(dst, 'competitions')).not.toContain(other.c.id);
    expect(contentOf(dst, 'arena_state')).not.toContain('arene-B');
    src.close();
    dst.close();
  });

  it('ré-import remplace l’état existant : aucun match obsolète ne subsiste', async () => {
    const dir = newDir();
    const src = new DatabaseManager(path.join(dir, 'src.db'));
    await src.open();
    const { c } = seedCompetition(src, 'A');
    const file = path.join(dir, 'export.bpm');
    await src.exportCompetitionToFile(c.id, file);

    const dst = new DatabaseManager(path.join(dir, 'dst.db'));
    await dst.open();
    await dst.mergeFromFile(file);
    // Modification locale après import : un match de tableau qui n'est pas dans le snapshot
    dst.upsertTableauMatch({
      competitionId: c.id,
      matchId: 'stale',
      round: 3,
      position: 0,
      status: 'not_started',
    });
    await dst.mergeFromFile(file);
    for (const t of tablesOf(src)) {
      expect(contentOf(dst, t), `table ${t}`).toBe(contentOf(src, t));
    }
    src.close();
    dst.close();
  });
});
