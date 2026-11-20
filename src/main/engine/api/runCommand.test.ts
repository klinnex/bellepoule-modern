/**
 * Révision dans la transaction (docs/adr/0006, #1980) : contrôle de expectedRevision,
 * écritures et ajout au journal forment un seul tout ; base SQLite réelle.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../../../database';
import { hasNodeSqlite } from '../../../database/testing/nodeSqliteDatabase';
import { Category, Gender, Weapon } from '../../../shared/types';
import { ApiError } from '../../../shared/api/client';
import type { CommandContext } from '../commands/context';
import { recordEvents } from '../commands/eventLog';
import { runCommand } from './engine';

vi.mock('better-sqlite3-multiple-ciphers', async () => ({
  default: (await import('../../../database/testing/nodeSqliteDatabase')).NodeSqliteDatabase,
}));

const d = hasNodeSqlite ? describe : describe.skip;

let db: DatabaseManager;
let ctx: CommandContext;
let id: string;

beforeEach(async () => {
  db = new DatabaseManager(':memory:');
  await db.open(':memory:');
  ctx = { db };
  id = db.createCompetition({
    title: 'Révision',
    date: new Date('2026-12-06'),
    weapon: Weapon.EPEE,
    gender: Gender.MALE,
    category: Category.SENIOR,
  }).id;
});

afterEach(() => db.close());

const write = (type: string) => recordEvents(ctx, id, [{ type, payload: { n: 1 } }]);

d('runCommand : révision dans la transaction (ADR-0006)', () => {
  it('révision à jour : écrit, rend la révision avant et après', () => {
    write('A');
    const run = runCommand(ctx, id, 1, () => write('B'));
    expect(run).toMatchObject({ before: 1, after: 2 });
  });

  it('révision périmée : refus revision_conflict, rien d’écrit', () => {
    write('A');
    write('B');
    const fn = vi.fn(() => write('C'));
    let error: unknown;
    try {
      runCommand(ctx, id, 1, fn);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('revision_conflict');
    expect((error as ApiError).data).toMatchObject({ revision: 2, missing: [{ revision: 2 }] });
    expect(fn).not.toHaveBeenCalled();
    expect(db.eventLog.getRevision(id)).toBe(2);
  });

  it('erreur après une écriture : tout est annulé (journal compris)', () => {
    write('A');
    expect(() =>
      runCommand(ctx, id, 1, () => {
        write('B');
        throw new Error('panne au milieu de la commande');
      })
    ).toThrow(/panne/);
    expect(db.eventLog.getRevision(id)).toBe(1);
    expect(db.eventLog.getSince(id).map(e => e.type)).toEqual(['A']);
  });

  it('commande asynchrone : refusée, aucune écriture validée', () => {
    expect(() =>
      runCommand(ctx, id, undefined, () => {
        write('A');
        return Promise.resolve('trop tard');
      })
    ).toThrow(/asynchrone/);
    expect(db.eventLog.getRevision(id)).toBe(0);
  });

  it('sans révision attendue : pas de contrôle, la commande écrit', () => {
    write('A');
    expect(runCommand(ctx, id, undefined, () => write('B'))).toMatchObject({
      before: 1,
      after: 2,
    });
  });
});
