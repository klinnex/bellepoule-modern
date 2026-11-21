/**
 * Orchestration sportive dans le main (#1880, lot 3), base SQLite réelle :
 * poules → arbitres → scores → tableau → résultats → export.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseManager } from '../../../database';
import { hasNodeSqlite } from '../../../database/testing/nodeSqliteDatabase';
import { Category, FencerStatus, Gender, Weapon } from '../../../shared/types';
import { buildMatchScores, validatePoolScore } from '../../../shared/utils/poolOrchestration';
import { buildDefaultCompetitionSettings } from '../../../shared/utils/defaultCompetitionSettings';
import type { DomainChange, CommandContext } from './context';
import { buildBracket, generatePools, listMatches, recordScore } from './sport';
import { assignPoolReferees } from './refereeing';
import { getBracket, getPoolRanking } from './sessionView';
import { exportResults } from './exportResults';
import { planTableau } from '../../../shared/domain/tableau/tableauCalculations';
import type { Pool, PoolRanking } from '../../../shared/types';

vi.mock('better-sqlite3-multiple-ciphers', async () => ({
  default: (await import('../../../database/testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

let db: DatabaseManager;
let ctx: CommandContext;
let changes: DomainChange[];
let dir: string;

const CLUBS = ['Paris', 'Lyon', 'Nice', 'Lille'];

async function setup(fencerCount: number, weapon = Weapon.EPEE) {
  const comp = db.createCompetition({
    title: 'Test',
    date: new Date('2026-12-06'),
    weapon,
    gender: Gender.MALE,
    category: Category.SENIOR,
    settings: buildDefaultCompetitionSettings({ weapon, category: Category.SENIOR }),
  });
  for (let i = 0; i < fencerCount; i++) {
    db.addFencer(comp.id, {
      lastName: `NOM${i}`,
      firstName: `P${i}`,
      club: CLUBS[i % CLUBS.length],
      ranking: i + 1,
      status: FencerStatus.CHECKED_IN,
    });
  }
  return comp;
}

/** Joue tous les matchs prêts : A gagne 5-n (poule) ou 15-n (tableau) */
function playAll(competitionId: string, kind: 'pool' | 'bracket') {
  let guard = 0;
  for (;;) {
    const ready = listMatches(ctx, competitionId, { state: 'ready' }).filter(m => m.kind === kind);
    if (ready.length === 0 || guard++ > 200) return;
    for (const m of ready) {
      recordScore(ctx, competitionId, {
        matchId: m.matchId,
        scoreA: kind === 'pool' ? 5 : 15,
        scoreB: (m.fencerB?.lastName.length ?? 0) % 4,
      });
    }
  }
}

beforeEach(async () => {
  db = new DatabaseManager(':memory:');
  await db.open(':memory:');
  changes = [];
  ctx = { db, emitChange: c => changes.push(c) };
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-sport-'));
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('validation des scores de poule (identique à l’écran)', () => {
  const base = { maxScore: 5, isLaserSabre: false, tieByVictory: true };
  it('score max, égalité, vainqueur contraire', () => {
    expect(validatePoolScore({ ...base, scoreA: 6, scoreB: 2 })).toBe('score_above_max');
    expect(validatePoolScore({ ...base, scoreA: 3, scoreB: 3 })).toBe('draw_needs_winner');
    expect(validatePoolScore({ ...base, scoreA: 3, scoreB: 3, priority: 'A' })).toBeNull();
    // Règlement o.17 : pas d'égalité au score max, même avec vainqueur (#1990)
    expect(validatePoolScore({ ...base, scoreA: 5, scoreB: 5, winner: 'A' })).toBe('tie_at_max');
    expect(
      validatePoolScore({
        ...base,
        isLaserSabre: true,
        maxScore: 21,
        scoreA: 21,
        scoreB: 21,
        winner: 'A',
      })
    ).toBeNull();
    expect(
      validatePoolScore({ ...base, tieByVictory: false, scoreA: 3, scoreB: 3, priority: 'A' })
    ).toBe('priority_not_allowed');
    expect(validatePoolScore({ ...base, isLaserSabre: true, scoreA: 3, scoreB: 3 })).toBe(
      'draw_not_allowed'
    );
    expect(validatePoolScore({ ...base, scoreA: 2, scoreB: 4, winner: 'A' })).toBe(
      'winner_contradicts_score'
    );
    expect(
      validatePoolScore({ ...base, scoreA: 2, scoreB: 4, winner: 'A', specialStatus: 'abandon' })
    ).toBeNull();
  });

  it('statut spécial au perdant, priorité marquée', () => {
    const s = buildMatchScores(2, 4, 'A', 'abandon');
    expect(s.scoreA.isVictory).toBe(true);
    expect(s.scoreB).toMatchObject({ isVictory: false, isAbstention: true });
    expect(buildMatchScores(3, 3, undefined, undefined, 'B').scoreB).toMatchObject({
      isVictory: true,
      isPriority: true,
    });
  });
});

d('déroulé complet piloté hors écran', () => {
  it('poules → arbitres → scores → tableau → classement final → exports', async () => {
    const comp = await setup(14);
    // Club absent des poules : arbitre neutre (moteur unique, docs/adr/0014)
    db.createReferee(comp.id, { name: 'Anne ARBITRE', club: 'Marseille' });
    const refs = db.getRefereesByCompetition(comp.id);
    db.updateReferee(refs[0].id, { status: 'available' } as never);

    const sim = generatePools(ctx, comp.id, { dryRun: true });
    expect(sim.poolCount).toBe(2);
    expect(listMatches(ctx, comp.id)).toHaveLength(0);

    const pools = generatePools(ctx, comp.id);
    expect(pools.pools.map(p => p.fencers.length).sort()).toEqual([7, 7]);
    expect(db.getSessionState(comp.id)).toMatchObject({ currentPhase: 2, poolsLaunched: true });
    expect(changes[changes.length - 1]).toEqual({
      scope: 'session',
      competitionIds: [comp.id],
    });
    // Tables de poules aussi écrites (repli de l'écran, serveur distant)
    const phase = db.getPhasesByCompetition(comp.id).find(p => p.type === 'pool')!;
    expect(db.getPoolsByPhase(phase.id)).toHaveLength(2);

    // Un seul arbitre : il enchaîne les deux poules
    const assigned = assignPoolReferees(ctx, comp.id);
    expect(assigned.assignments).toHaveLength(2);
    expect(assigned.unassigned).toEqual([]);

    // Bracket refusé tant que les poules ne sont pas finies
    expect(() => buildBracket(ctx, comp.id)).toThrow(/poules/);
    const first = listMatches(ctx, comp.id, { state: 'ready' })[0];
    expect(() =>
      recordScore(ctx, comp.id, { matchId: first.matchId, scoreA: 9, scoreB: 1 })
    ).toThrow(/score_above_max/);
    playAll(comp.id, 'pool');
    const ranking = getPoolRanking(ctx, comp.id);
    expect(ranking.pools.every(p => p.complete)).toBe(true);
    expect(ranking.overallRanking).toHaveLength(14);

    const bracket = buildBracket(ctx, comp.id, { thirdPlaceMatch: true });
    expect(bracket.size).toBe(16);
    expect(db.getCompetition(comp.id)?.settings.thirdPlaceMatch).toBe(true);
    // Score de poule figé une fois le tableau construit
    expect(() =>
      recordScore(ctx, comp.id, { matchId: first.matchId, scoreA: 5, scoreB: 0 })
    ).toThrow(/figé/);
    playAll(comp.id, 'bracket');
    const final = getBracket(ctx, comp.id);
    expect(final.matches.every(m => m.isBye || m.state === 'done')).toBe(true);
    expect(final.finalResults).toHaveLength(14);
    expect(final.finalResults[0].rank).toBe(1);

    // Matchs de tableau en base (id composite)
    expect(db.getTableauMatchesForExport(comp.id).length).toBeGreaterThan(0);

    for (const format of ['xml', 'fff', 'csv', 'html'] as const) {
      const out = path.join(dir, `r.${format}`);
      const r = await exportResults(ctx, comp.id, { format, outputPath: out });
      expect(r.bytes).toBeGreaterThan(0);
    }
    await expect(
      exportResults(ctx, comp.id, { format: 'xml', outputPath: path.join(dir, 'r.xml') })
    ).rejects.toThrow(/existe déjà/);
    await expect(
      exportResults(ctx, comp.id, { format: 'pdf', outputPath: path.join(dir, 'r.pdf') })
    ).rejects.toThrow(/PDF indisponible/);
    expect(fs.readFileSync(path.join(dir, 'r.xml'), 'utf-8')).toContain('NOM');
  });

  it('régénérer des poules jouées exige replace', async () => {
    const comp = await setup(8);
    generatePools(ctx, comp.id);
    const m = listMatches(ctx, comp.id)[0];
    recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 5, scoreB: 1 });
    expect(() => generatePools(ctx, comp.id)).toThrow(/replace/);
    expect(generatePools(ctx, comp.id, { replace: true }).poolCount).toBeGreaterThan(0);
  });

  it('correction d’un match de tableau refusée si le tour suivant est joué', async () => {
    const comp = await setup(4);
    generatePools(ctx, comp.id, { poolCount: 1 });
    playAll(comp.id, 'pool');
    buildBracket(ctx, comp.id, { thirdPlaceMatch: false });
    const semis = listMatches(ctx, comp.id, { state: 'ready' });
    expect(semis).toHaveLength(2);
    for (const s of semis) recordScore(ctx, comp.id, { matchId: s.matchId, scoreA: 15, scoreB: 3 });
    // Égalité au tableau : vainqueur exigé
    const finalMatch = listMatches(ctx, comp.id, { state: 'ready' })[0];
    expect(() =>
      recordScore(ctx, comp.id, { matchId: finalMatch.matchId, scoreA: 7, scoreB: 7 })
    ).toThrow(/vainqueur/);
    recordScore(ctx, comp.id, { matchId: finalMatch.matchId, scoreA: 7, scoreB: 7, winner: 'B' });
    expect(() =>
      recordScore(ctx, comp.id, { matchId: semis[0].matchId, scoreA: 15, scoreB: 4 })
    ).toThrow(/tour suivant/);
    expect(getBracket(ctx, comp.id).finalResults[0].fencer?.id).toBe(finalMatch.fencerB?.id);
  });

  it('formats non pris en charge : erreur explicite', async () => {
    const comp = await setup(6);
    db.updateCompetition(comp.id, { isTeamEvent: true } as never);
    expect(() => generatePools(ctx, comp.id)).toThrow(/équipes/);
  });

  it('pas assez de tireurs pointés', async () => {
    const comp = await setup(3);
    expect(() => generatePools(ctx, comp.id)).toThrow(/au moins 4/);
  });

  it('abandon en poule : statut du tireur, ses autres matchs perdus, écarté du tableau', async () => {
    const comp = await setup(5);
    generatePools(ctx, comp.id, { poolCount: 1 });
    const first = listMatches(ctx, comp.id, { state: 'ready' })[0];
    recordScore(ctx, comp.id, {
      matchId: first.matchId,
      scoreA: 3,
      scoreB: 1,
      winner: 'A',
      specialStatus: 'abandon',
    });
    const loserId = first.fencerB!.id;
    expect(db.getFencer(loserId)?.status).toBe(FencerStatus.ABANDONED);
    const loserMatches = listMatches(ctx, comp.id).filter(
      m => m.fencerA?.id === loserId || m.fencerB?.id === loserId
    );
    expect(loserMatches.every(m => m.state === 'done')).toBe(true);
    playAll(comp.id, 'pool');
    const bracket = buildBracket(ctx, comp.id, { thirdPlaceMatch: false });
    expect(bracket.qualified).toBe(4);
  });

  it('Sabre Laser : scores max effectifs de l’écran (21 en poule)', async () => {
    const comp = await setup(4, Weapon.LASER);
    generatePools(ctx, comp.id, { poolCount: 1 });
    const m = listMatches(ctx, comp.id, { state: 'ready' })[0];
    expect(() =>
      recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 8, scoreB: 3 })
    ).not.toThrow();
  });

  it('tableau terminé : phase Résultats', async () => {
    const comp = await setup(4);
    generatePools(ctx, comp.id, { poolCount: 1 });
    playAll(comp.id, 'pool');
    buildBracket(ctx, comp.id, { thirdPlaceMatch: false });
    playAll(comp.id, 'bracket');
    expect((db.getSessionState(comp.id) as { currentPhase: number }).currentPhase).toBe(6);
  });

  it('journal de l’épreuve (#1980) : scores, poule terminée, tableau, auteur et source', async () => {
    const comp = await setup(4);
    ctx.actor = { source: 'mcp', author: 'agent' };
    generatePools(ctx, comp.id, { poolCount: 1 });
    const [m] = listMatches(ctx, comp.id);
    recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 5, scoreB: 2, dryRun: true });
    expect(db.eventLog.getRevision(comp.id)).toBe(0);
    recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 4, scoreB: 2 });
    recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 5, scoreB: 2 });
    const history = db.eventLog.getMatchHistory(comp.id, m.matchId);
    expect(
      history.map(e => [e.type, e.type === 'ScoreRecorded' && e.payload.scoreA, e.source, e.author])
    ).toEqual([
      ['ScoreRecorded', 4, 'mcp', 'agent'],
      ['ScoreRecorded', 5, 'mcp', 'agent'],
    ]);
    playAll(comp.id, 'pool');
    const types = db.eventLog.getSince(comp.id).map(e => e.type);
    expect(types.filter(t => t === 'PoolCompleted')).toHaveLength(1);
    expect(types[types.length - 1]).toBe('PoolCompleted');
    buildBracket(ctx, comp.id, { thirdPlaceMatch: false });
    playAll(comp.id, 'bracket');
    const all = db.eventLog.getSince(comp.id);
    expect(all.map(e => e.revision)).toEqual(all.map((_, i) => i + 1));
    expect(all.filter(e => e.type === 'TableauMatchDecided')).toHaveLength(3);
    expect(all[all.length - 1]?.type).toBe('TableauCompleted');
    // RGPD : identifiants seulement
    expect(JSON.stringify(all)).not.toContain('NOM');
  });

  it('révision : une sauvegarde de l’écran sur un état périmé est refusée', async () => {
    const comp = await setup(4);
    generatePools(ctx, comp.id, { poolCount: 1 });
    const loaded = db.getSessionState(comp.id) as { revision: number };
    const m = listMatches(ctx, comp.id)[0];
    recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 5, scoreB: 2 });
    expect(db.saveSessionStateChecked(comp.id, { ...loaded, pools: [] })).toBe(false);
    const current = db.getSessionState(comp.id) as { revision: number };
    expect(current.revision).toBe(loaded.revision + 1);
    expect(db.saveSessionStateChecked(comp.id, current)).toBe(true);
  });

  it('export : dossier hors périmètre refusé, pas d’écrasement par défaut', async () => {
    const comp = await setup(4);
    generatePools(ctx, comp.id, { poolCount: 1 });
    playAll(comp.id, 'pool');
    const allowed = fs.mkdtempSync(path.join(dir, 'ok-'));
    const restricted = { ...ctx, allowedRoots: () => [allowed] };
    await expect(
      exportResults(restricted, comp.id, { format: 'csv', outputPath: path.join(dir, 'x.csv') })
    ).rejects.toThrow(/hors des dossiers/);
    const out = path.join(allowed, 'x.csv');
    await exportResults(restricted, comp.id, { format: 'csv', outputPath: out });
    await expect(
      exportResults(restricted, comp.id, { format: 'csv', outputPath: out })
    ).rejects.toThrow(/existe déjà/);
    await exportResults(restricted, comp.id, { format: 'csv', outputPath: out, overwrite: true });
  });
});

d('saisie des scores : formats élargis (#1980, ADR-0005)', () => {
  const session = (id: string) => db.getSessionState(id) as Record<string, unknown>;

  it('tours multiples : score du tour courant, tour terminé figé', async () => {
    const comp = await setup(8);
    generatePools(ctx, comp.id, { poolCount: 1 });
    playAll(comp.id, 'pool');
    const round1 = session(comp.id).pools as Pool[];
    generatePools(ctx, comp.id, { poolCount: 1, replace: true });
    db.saveSessionState(comp.id, {
      ...session(comp.id),
      poolHistory: [round1],
      currentPoolRound: 2,
    });
    const m = listMatches(ctx, comp.id, { state: 'ready' })[0];
    const res = recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 5, scoreB: 2 });
    expect(res.kind).toBe('pool');
    expect((session(comp.id).overallRanking as PoolRanking[]).length).toBe(8);
    expect(() =>
      recordScore(ctx, comp.id, { matchId: round1[0].matches[0].id, scoreA: 5, scoreB: 1 })
    ).toThrow(/tour de poules terminé/);
  });

  it('rapières : score de poule admis', async () => {
    const comp = await setup(6);
    generatePools(ctx, comp.id, { poolCount: 1 });
    db.updateCompetition(comp.id, {
      settings: { ...comp.settings, specialMode: 'rapieres' },
    } as never);
    const m = listMatches(ctx, comp.id, { state: 'ready' })[0];
    expect(recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 5, scoreB: 3 }).kind).toBe(
      'pool'
    );
  });

  it('équipes : refusé', async () => {
    const comp = await setup(6);
    generatePools(ctx, comp.id, { poolCount: 1 });
    db.updateCompetition(comp.id, { isTeamEvent: true } as never);
    const m = listMatches(ctx, comp.id, { state: 'ready' })[0];
    expect(() => recordScore(ctx, comp.id, { matchId: m.matchId, scoreA: 5, scoreB: 3 })).toThrow(
      /équipes/
    );
  });

  it('toutes les places : barrages, tableaux de classement, classement complet', async () => {
    const comp = await setup(10);
    generatePools(ctx, comp.id, { poolCount: 2 });
    playAll(comp.id, 'pool');
    db.updateCompetition(comp.id, {
      settings: { ...comp.settings, playAllPositions: true, thirdPlaceMatch: true },
    } as never);
    const ranking = session(comp.id).overallRanking as PoolRanking[];
    const { matches } = planTableau(ranking, { playAllPositions: true, thirdPlaceMatch: true });
    db.saveSessionState(comp.id, {
      ...session(comp.id),
      currentPhase: 5,
      tableauMatches: matches,
      consolationBrackets: [],
    });
    playAll(comp.id, 'bracket');
    const after = session(comp.id);
    expect(after.currentPhase).toBe(6);
    expect((after.consolationBrackets as unknown[]).length).toBeGreaterThan(0);
    const ranks = (after.finalResults as Array<{ rank: number }>).map(r => r.rank);
    expect(ranks).toHaveLength(10);
    expect(new Set(ranks).size).toBe(10);
    expect(listMatches(ctx, comp.id).some(m => m.bracket)).toBe(true);
    // Perdants déjà versés dans un tableau de classement : correction refusée
    const qf = listMatches(ctx, comp.id).find(m => m.round === 8 && !m.bracket)!;
    expect(() =>
      recordScore(ctx, comp.id, { matchId: qf.matchId, scoreA: 15, scoreB: 14 })
    ).toThrow(/classement/);
  });
});
