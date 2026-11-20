/**
 * Commandes des arbitres (docs/adr/0014), base SQLite réelle : réglages fusionnés côté
 * moteur, affectation automatique selon les réglages, affectation à la main.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../database';
import { hasNodeSqlite } from '../../../database/testing/nodeSqliteDatabase';
import { Category, FencerStatus, Gender, Weapon } from '../../../shared/types';
import { buildDefaultCompetitionSettings } from '../../../shared/utils/defaultCompetitionSettings';
import type { DomainChange, CommandContext } from './context';
import { generatePools } from './sport';
import { assignPoolReferee, assignPoolReferees, setRefereeingSettings } from './refereeing';
import { invoke } from '../api/engine';

vi.mock('better-sqlite3-multiple-ciphers', async () => ({
  default: (await import('../../../database/testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

let db: DatabaseManager;
let ctx: CommandContext;
let changes: DomainChange[];

beforeEach(async () => {
  db = new DatabaseManager(':memory:');
  await db.open(':memory:');
  changes = [];
  ctx = { db, emitChange: c => changes.push(c) };
});

afterEach(() => {
  db.close();
});

/** 8 tireurs français, clubs A/B, deux poules */
function setup() {
  const comp = db.createCompetition({
    title: 'Arbitres',
    date: new Date('2026-12-06'),
    weapon: Weapon.EPEE,
    gender: Gender.MALE,
    category: Category.SENIOR,
    settings: buildDefaultCompetitionSettings({ weapon: Weapon.EPEE, category: Category.SENIOR }),
  });
  for (let i = 0; i < 8; i++) {
    db.addFencer(comp.id, {
      lastName: `NOM${i}`,
      firstName: `P${i}`,
      club: i % 2 ? 'A' : 'B',
      nationality: 'FRA',
      ranking: i + 1,
      status: FencerStatus.CHECKED_IN,
    });
  }
  generatePools(ctx, comp.id, { poolCount: 2 } as never);
  return comp;
}

function referee(competitionId: string, name: string, club: string, nationality = 'FRA') {
  db.createReferee(competitionId, { name, club, nationality } as never);
  const r = db.getRefereesByCompetition(competitionId).find(x => x.club === club)!;
  db.updateReferee(r.id, { status: 'available' } as never);
  return r;
}

d('setRefereeingSettings', () => {
  it('fusionne côté moteur sans toucher aux autres réglages de l’épreuve', () => {
    const comp = setup();
    const before = db.getCompetition(comp.id)!.settings;
    setRefereeingSettings(ctx, comp.id, { neutrality: { nationality: true } });
    const res = setRefereeingSettings(ctx, comp.id, { balance: false });
    const after = db.getCompetition(comp.id)!.settings;
    expect(after.refereeing).toEqual({ neutrality: { nationality: true }, balance: false });
    expect(res.refereeing.neutrality).toEqual({ club: true, nationality: true, region: false });
    expect(after.defaultPoolMaxScore).toBe(before.defaultPoolMaxScore);
    expect(changes).toContainEqual({ scope: 'competitions', competitionIds: [comp.id] });
  });

  it('dryRun : rien d’écrit', () => {
    const comp = setup();
    setRefereeingSettings(ctx, comp.id, { balance: false, dryRun: true });
    expect(db.getCompetition(comp.id)!.settings.refereeing).toBeUndefined();
  });
});

d('assignReferees (moteur unique)', () => {
  it('neutralité de nation lue dans les réglages : arbitre français écarté', () => {
    const comp = setup();
    referee(comp.id, 'Jean FRANCE', 'Z', 'FRA');
    expect(assignPoolReferees(ctx, comp.id, { dryRun: true }).assignments).toHaveLength(2);
    setRefereeingSettings(ctx, comp.id, { neutrality: { nationality: true } });
    const res = assignPoolReferees(ctx, comp.id, { dryRun: true });
    expect(res.assignments).toEqual([]);
    expect(res.unassigned[0].conflicts[0].reasons).toEqual(['nationality']);
  });

  it('par le contrat : sortie validée, outil MCP « assign_referees »', async () => {
    const comp = setup();
    referee(comp.id, 'Jean NEUTRE', 'Z');
    const res = (await invoke(ctx, 'assignReferees', { competitionId: comp.id })) as {
      assignments: unknown[];
    };
    expect(res.assignments).toHaveLength(2);
  });
});

d('assignReferee (à la main)', () => {
  it('arbitre non neutre accepté et signalé ; null retire l’arbitre', () => {
    const comp = setup();
    const r = referee(comp.id, 'Anne CLUB', 'A');
    const res = assignPoolReferee(ctx, comp.id, { poolNumber: 1, refereeId: r.id });
    expect(res.conflicts).toEqual(['club']);
    expect(res.warnings[0]).toContain('n’est pas neutre');
    const pool = (
      db.getSessionState(comp.id) as {
        pools: {
          number: number;
          referees: { id: string }[];
          matches: { referee?: { id: string } }[];
        }[];
      }
    ).pools.find(p => p.number === 1)!;
    expect(pool.referees[0].id).toBe(r.id);
    expect(pool.matches.every(m => m.referee?.id === r.id)).toBe(true);

    assignPoolReferee(ctx, comp.id, { poolNumber: 1, refereeId: null });
    const cleared = (
      db.getSessionState(comp.id) as {
        pools: { number: number; referees: unknown[]; matches: { referee?: unknown }[] }[];
      }
    ).pools.find(p => p.number === 1)!;
    expect(cleared.referees).toEqual([]);
    expect(cleared.matches.every(m => !m.referee)).toBe(true);
  });

  it('poule ou arbitre inconnus : erreurs codées', () => {
    const comp = setup();
    expect(() => assignPoolReferee(ctx, comp.id, { poolNumber: 9, refereeId: null })).toThrow(
      /introuvable/
    );
    expect(() => assignPoolReferee(ctx, comp.id, { poolNumber: 1, refereeId: 'zz' })).toThrow(
      /introuvable/
    );
  });
});
