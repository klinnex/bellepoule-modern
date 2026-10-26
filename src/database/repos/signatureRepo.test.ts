import { describe, it, expect, vi } from 'vitest';
import { SignatureRepo } from './signatureRepo';
import type { SqlExecutor } from './sqlExecutor';

function fakeSql(rows: unknown[] = []) {
  const sql = {
    run: vi.fn(),
    queryOne: vi.fn(),
    queryAll: vi.fn(() => rows),
  };
  return { sql, repo: new SignatureRepo(sql as unknown as SqlExecutor) };
}

describe('SignatureRepo', () => {
  it('enregistre une signature de poule (upsert)', () => {
    const { sql, repo } = fakeSql();
    repo.savePool('p1', 'f1', 'data');
    const [query, params] = sql.run.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('pool_signatures');
    expect(query).toContain('ON CONFLICT(pool_id, fencer_id)');
    expect(params.slice(1, 4)).toEqual(['p1', 'f1', 'data']);
  });

  it('mappe les lignes en camelCase', () => {
    const { repo } = fakeSql([{ fencer_id: 'f1', signature_data: 'x' }]);
    expect(repo.getPool('p1')).toEqual([{ fencerId: 'f1', signatureData: 'x' }]);
    expect(repo.getDEMatch('m1')).toEqual([{ fencerId: 'f1', signatureData: 'x' }]);
  });

  it('ne requête pas sans identifiants de match', () => {
    const { sql, repo } = fakeSql();
    expect(repo.getDEMatchesByIds([])).toEqual([]);
    expect(sql.queryAll).not.toHaveBeenCalled();
  });

  it('requête par lot avec placeholders', () => {
    const { sql, repo } = fakeSql([{ match_id: 'm1', fencer_id: 'f1', signature_data: 'x' }]);
    expect(repo.getDEMatchesByIds(['m1', 'm2'])).toEqual([
      { matchId: 'm1', fencerId: 'f1', signatureData: 'x' },
    ]);
    expect((sql.queryAll.mock.calls[0] as unknown[])[0]).toContain('IN (?,?)');
  });
});
