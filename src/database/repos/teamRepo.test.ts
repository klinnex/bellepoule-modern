/**
 * TeamRepo — rappel d'un relais terminé (#1829) : la rencontre est recalculée.
 */
import { describe, it, expect, vi } from 'vitest';
import { TeamRepo } from './teamRepo';
import type { SqlExecutor } from './sqlExecutor';

/** Exécuteur SQL factice : 3 relais en mémoire, rencontre terminée gagnée par l'équipe A. */
function fakeSql() {
  const bouts = [
    { id: 'b1', match_id: 'm1', status: 'finished', score_a: 5, score_b: 3 },
    { id: 'b2', match_id: 'm1', status: 'finished', score_a: 5, score_b: 4 },
    { id: 'b3', match_id: 'm1', status: 'finished', score_a: 5, score_b: 2 },
  ];
  const match = { status: 'finished', winner_id: 'tA' as string | null, a: 15, b: 9, index: 3 };
  const run = vi.fn((sql: string, params: unknown[] = []) => {
    if (sql.startsWith('UPDATE team_bouts SET status')) {
      const bout = bouts.find(b => b.id === params[1]);
      if (bout) bout.status = 'in_progress';
    } else if (sql.startsWith('UPDATE team_matches')) {
      [match.a, match.b, match.status, match.winner_id, match.index] = params as [
        number,
        number,
        string,
        string | null,
        number,
      ];
    }
    return { changes: 1, lastInsertRowid: 0 };
  });
  const sql = {
    db: {},
    run,
    queryOne: (q: string, params: unknown[] = []) =>
      q.includes('FROM team_bouts')
        ? (bouts.find(b => b.id === params[0]) ?? null)
        : { team_a_id: 'tA', team_b_id: 'tB' },
    queryAll: () => bouts,
    transaction: <T>(fn: () => T) => fn(),
  } as unknown as SqlExecutor;
  return { sql, match, run };
}

describe('TeamRepo.reopenTeamBout', () => {
  it('rencontre terminée → en cours, vainqueur effacé, scores et relais courant recalculés', () => {
    const { sql, match, run } = fakeSql();
    new TeamRepo(sql).reopenTeamBout('b3');
    expect(run.mock.calls[0][0]).toMatch(/status = 'in_progress', winner_id = NULL/);
    expect(match).toEqual({ status: 'in_progress', winner_id: null, a: 15, b: 9, index: 2 });
  });
});
