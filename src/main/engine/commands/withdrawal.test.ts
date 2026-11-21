/**
 * Retrait et réintégration d'un tireur (#1980, docs/adr/0016), base SQLite réelle :
 * appel, poules, tableau, simulation, refus, recordScore avec statut spécial.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../database';
import { hasNodeSqlite } from '../../../database/testing/nodeSqliteDatabase';
import { Category, FencerStatus, Gender, Weapon } from '../../../shared/types';
import { buildDefaultCompetitionSettings } from '../../../shared/utils/defaultCompetitionSettings';
import type { CommandContext } from './context';
import { buildBracket, generatePools, listMatches, recordScore } from './sport';
import { invoke } from '../api/engine';

vi.mock('better-sqlite3-multiple-ciphers', async () => ({
  default: (await import('../../../database/testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

let db: DatabaseManager;
let ctx: CommandContext;

function setup(fencerCount: number) {
  const comp = db.createCompetition({
    title: 'Retrait',
    date: new Date('2026-12-06'),
    weapon: Weapon.EPEE,
    gender: Gender.MALE,
    category: Category.SENIOR,
    settings: buildDefaultCompetitionSettings({ weapon: Weapon.EPEE, category: Category.SENIOR }),
  });
  for (let i = 0; i < fencerCount; i++) {
    db.addFencer(comp.id, {
      lastName: `NOM${i}`,
      firstName: `P${i}`,
      club: `C${i}`,
      ranking: i + 1,
      status: FencerStatus.CHECKED_IN,
    });
  }
  return comp;
}

const call = (name: string, input: Record<string, unknown>) =>
  invoke(ctx, name, input) as Promise<Record<string, any>>;
const events = (id: string) => db.eventLog.getSince(id, 0);
const lastEvent = (id: string) => events(id)[events(id).length - 1];
const fencerIds = (id: string) => db.getFencersByCompetition(id).map(f => f.id);

/** Joue tous les matchs prêts d'un type : A gagne */
function playAll(id: string, kind: 'pool' | 'bracket') {
  for (let guard = 0; guard < 50; guard++) {
    const ready = listMatches(ctx, id, { state: 'ready' }).filter(m => m.kind === kind);
    if (!ready.length) return;
    for (const m of ready) {
      recordScore(ctx, id, { matchId: m.matchId, scoreA: kind === 'pool' ? 5 : 15, scoreB: 1 });
    }
  }
}

beforeEach(async () => {
  db = new DatabaseManager(':memory:');
  await db.open(':memory:');
  ctx = { db, actor: { source: 'screen' } };
});
afterEach(() => db.close());

d('withdrawFencer / reinstateFencer (ADR-0016)', () => {
  it('à l’appel : forfait DNS, journal, puis réintégration', async () => {
    const comp = setup(6);
    const [fid] = fencerIds(comp.id);
    const res = await call('withdrawFencer', {
      competitionId: comp.id,
      fencerId: fid,
      reason: 'forfait',
    });
    expect(res).toMatchObject({
      phase: 'checkin',
      status: FencerStatus.FORFAIT,
      exclusionReason: 'dns',
    });
    expect(db.getFencer(fid)).toMatchObject({
      status: FencerStatus.FORFAIT,
      exclusionReason: 'dns',
    });
    expect(lastEvent(comp.id)).toMatchObject({
      type: 'FencerWithdrawn',
      payload: { fencerId: fid, reason: 'forfait', blackCard: false, matchId: null },
    });
    await call('reinstateFencer', { competitionId: comp.id, fencerId: fid });
    expect(db.getFencer(fid)?.status).toBe(FencerStatus.CHECKED_IN);
    expect(lastEvent(comp.id)).toMatchObject({ type: 'FencerReinstated' });
  });

  it('en poules : matchs non disputés perdus, simulation sans écriture, réintégration', async () => {
    const comp = setup(5);
    generatePools(ctx, comp.id, { poolCount: 1 });
    const first = listMatches(ctx, comp.id, { state: 'ready' })[0];
    recordScore(ctx, comp.id, { matchId: first.matchId, scoreA: 5, scoreB: 2 });
    const fid = first.fencerA!.id;
    const pending = () =>
      listMatches(ctx, comp.id).filter(
        m => (m.fencerA?.id === fid || m.fencerB?.id === fid) && m.state === 'ready'
      );
    expect(pending()).toHaveLength(3);

    const before = db.eventLog.getRevision(comp.id);
    const sim = await call('withdrawFencer', {
      competitionId: comp.id,
      fencerId: fid,
      reason: 'abandon',
      dryRun: true,
    });
    expect(sim.forfeitedMatchIds).toHaveLength(3);
    expect(db.eventLog.getRevision(comp.id)).toBe(before);
    expect(pending()).toHaveLength(3);

    const res = await call('withdrawFencer', {
      competitionId: comp.id,
      fencerId: fid,
      reason: 'abandon',
    });
    expect(res).toMatchObject({ phase: 'pools', exclusionReason: null });
    expect(pending()).toHaveLength(0);
    expect(db.getFencer(fid)?.status).toBe(FencerStatus.ABANDONED);

    // Déjà retiré : réintégrer d'abord
    await expect(
      call('withdrawFencer', { competitionId: comp.id, fencerId: fid, reason: 'forfait' })
    ).rejects.toMatchObject({ code: 'already_withdrawn' });

    const back = await call('reinstateFencer', { competitionId: comp.id, fencerId: fid });
    expect(back.restoredMatchIds.length).toBeGreaterThanOrEqual(4);
    expect(pending()).toHaveLength(3);
    expect(db.getFencer(fid)?.status).toBe(FencerStatus.CHECKED_IN);
    // Le match joué avant le retrait garde son score
    expect(listMatches(ctx, comp.id).find(m => m.matchId === first.matchId)?.state).toBe('done');
  });

  it('au tableau : exclusion sur carton noir, l’adversaire passe ; réintégration bornée', async () => {
    const comp = setup(4);
    generatePools(ctx, comp.id, { poolCount: 1 });
    playAll(comp.id, 'pool');
    buildBracket(ctx, comp.id, { thirdPlaceMatch: false });
    const [semi, other] = listMatches(ctx, comp.id, { state: 'ready' });
    const out = semi.fencerA!.id;
    const res = await call('withdrawFencer', {
      competitionId: comp.id,
      fencerId: out,
      reason: 'exclusion',
      blackCard: true,
      matchId: semi.matchId,
    });
    expect(res).toMatchObject({ phase: 'tableau', forfeitedMatchIds: [semi.matchId] });
    expect(db.getFencer(out)).toMatchObject({
      status: FencerStatus.EXCLUDED,
      exclusionReason: 'black_card',
    });
    const decided = listMatches(ctx, comp.id).find(m => m.matchId === semi.matchId)!;
    expect(decided.state).toBe('done');
    const types = events(comp.id)
      .slice(-2)
      .map(e => e.type);
    expect(types).toEqual(['FencerWithdrawn', 'TableauMatchDecided']);

    // Réintégration possible tant que la finale n'est pas jouée
    await call('reinstateFencer', { competitionId: comp.id, fencerId: out, dryRun: true });
    await call('reinstateFencer', { competitionId: comp.id, fencerId: out });
    expect(listMatches(ctx, comp.id).find(m => m.matchId === semi.matchId)?.state).toBe('ready');

    // Nouveau retrait, demi-finale et finale jouées : réintégration refusée
    await call('withdrawFencer', { competitionId: comp.id, fencerId: out, reason: 'abandon' });
    recordScore(ctx, comp.id, { matchId: other.matchId, scoreA: 15, scoreB: 4 });
    playAll(comp.id, 'bracket');
    await expect(
      call('reinstateFencer', { competitionId: comp.id, fencerId: out })
    ).rejects.toMatchObject({ code: 'next_match_played' });
    // Tableau terminé : plus de retrait
    const winner = fencerIds(comp.id).find(
      id => id !== out && db.getFencer(id)?.status !== FencerStatus.ABANDONED
    )!;
    await expect(
      call('withdrawFencer', { competitionId: comp.id, fencerId: winner, reason: 'forfait' })
    ).rejects.toMatchObject({ code: 'tableau_complete' });
  });

  it('adversaire pas encore connu au tableau : match_not_ready', async () => {
    const comp = setup(4);
    generatePools(ctx, comp.id, { poolCount: 1 });
    playAll(comp.id, 'pool');
    buildBracket(ctx, comp.id, { thirdPlaceMatch: false });
    const [semi] = listMatches(ctx, comp.id, { state: 'ready' });
    recordScore(ctx, comp.id, { matchId: semi.matchId, scoreA: 15, scoreB: 3 });
    await expect(
      call('withdrawFencer', {
        competitionId: comp.id,
        fencerId: semi.fencerA!.id,
        reason: 'forfait',
      })
    ).rejects.toMatchObject({ code: 'match_not_ready' });
  });

  it('recordScore avec statut du perdant : ScoreRecorded et FencerWithdrawn sous une commande', async () => {
    const comp = setup(5);
    generatePools(ctx, comp.id, { poolCount: 1 });
    const m = listMatches(ctx, comp.id, { state: 'ready' })[0];
    await call('recordScore', {
      competitionId: comp.id,
      matchId: m.matchId,
      scoreA: 3,
      scoreB: 1,
      winner: 'A',
      specialStatus: 'abandon',
    });
    const [score, withdrawn] = events(comp.id).slice(-2);
    expect(score.type).toBe('ScoreRecorded');
    expect(withdrawn).toMatchObject({
      type: 'FencerWithdrawn',
      payload: { fencerId: m.fencerB!.id, reason: 'abandon', matchId: m.matchId },
    });
    expect(withdrawn.commandId).toBe(score.commandId);
    expect(db.getFencer(m.fencerB!.id)?.status).toBe(FencerStatus.ABANDONED);
    // Réintégration : le match du score revient à jouer
    await call('reinstateFencer', { competitionId: comp.id, fencerId: m.fencerB!.id });
    expect(listMatches(ctx, comp.id).find(x => x.matchId === m.matchId)?.state).toBe('ready');
  });

  it('épreuve par équipes, tireur inconnu : refus', async () => {
    const comp = setup(4);
    await expect(
      call('withdrawFencer', { competitionId: comp.id, fencerId: 'x', reason: 'forfait' })
    ).rejects.toMatchObject({ code: 'fencer_not_found' });
    db.updateCompetition(comp.id, { isTeamEvent: true } as never);
    await expect(
      call('withdrawFencer', {
        competitionId: comp.id,
        fencerId: fencerIds(comp.id)[0],
        reason: 'forfait',
      })
    ).rejects.toMatchObject({ code: 'unsupported_format' });
  });
});
