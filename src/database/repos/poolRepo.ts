import { v4 as uuidv4 } from 'uuid';
import { Fencer, Pool, PoolSnapshot, Referee } from '../../shared/types';
import type { SqlExecutor } from './sqlExecutor';
import type { DatabaseManager } from '../index';
import { parseFencerRow, parsePoolRefereeIds } from './rowMappers';

/** Poules : composition, arbitres, instantanés (#1242) */
export class PoolRepo {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly dm: DatabaseManager
  ) {}

  public getPoolFencers(poolId: string): Fencer[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>(
        'SELECT f.* FROM fencers f INNER JOIN pool_fencers pf ON f.id = pf.fencer_id WHERE pf.pool_id = ? ORDER BY pf.position',
        [poolId]
      )
      .map(row => parseFencerRow(row));
  }

  public getCompetitionPools(competitionId: string): { id: string; name: string }[] {
    if (!this.sql.db) throw new Error('Database not open');
    try {
      const pools = this.sql.queryAll<{ id: string; number: number }>(
        'SELECT DISTINCT p.id, p.number FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ? ORDER BY p.number',
        [competitionId]
      );
      if (pools.length > 0) return pools.map(p => ({ id: p.id, name: 'Poule ' + p.number }));
    } catch (e) {
      console.warn('[Database] Error getting pools:', e);
    }
    try {
      return this.sql
        .queryAll<{ id: string; number: number }>(
          'SELECT p.id, p.number FROM pools p INNER JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id = ? ORDER BY p.number',
          [competitionId]
        )
        .map(p => ({ id: p.id, name: 'Poule ' + p.number }));
    } catch (e) {
      console.warn('[Database] Error getting pools via phases:', e);
    }
    return [];
  }

  public getPoolCount(competitionId: string): number {
    if (!this.sql.db) throw new Error('Database not open');
    try {
      const row = this.sql.queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT p.id) as count FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ?`,
        [competitionId]
      );
      if (row && row.count > 0) return row.count;
    } catch (e) {
      console.warn('[Database] Error getting pool count:', e);
    }
    try {
      const row = this.sql.queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT p.id) as count FROM pools p INNER JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id = ?`,
        [competitionId]
      );
      return row?.count ?? 0;
    } catch (e) {
      console.warn('[Database] Error getting pool count via phases:', e);
    }
    return 0;
  }

  public updatePool(pool: Pool): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    this.sql.run('UPDATE pools SET updated_at = ?, is_complete = ?, strip = ? WHERE id = ?', [
      now,
      pool.isComplete ? 1 : 0,
      pool.strip ?? null,
      pool.id,
    ]);
    for (const match of pool.matches || []) {
      if (match.scoreA !== undefined || match.scoreB !== undefined || match.status !== undefined) {
        this.dm.updateMatch(match.id, {
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          status: match.status,
        });
      }
    }
  }

  public updatePoolReferee(poolId: string, refereeId: string | null): void {
    this.updatePoolReferees(poolId, refereeId ? [refereeId] : []);
  }

  // Arbitres multiples (mode expert) : le premier est l'arbitre principal
  public updatePoolReferees(poolId: string, refereeIds: string[]): void {
    if (!this.sql.db) throw new Error('Database not open');
    const ids = Array.from(new Set(refereeIds.filter(Boolean)));
    this.sql.run('UPDATE pools SET referee_id = ?, referee_ids = ?, updated_at = ? WHERE id = ?', [
      ids[0] ?? null,
      ids.length > 0 ? JSON.stringify(ids) : null,
      new Date().toISOString(),
      poolId,
    ]);
  }

  // ─── Pool CRUD ──────────────────────────────────────────────────────────────

  public clearPoolsForPhase(phaseId: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      this.sql.run(
        'DELETE FROM pool_signatures WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)',
        [phaseId]
      );
      this.sql.run(
        'DELETE FROM matches WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)',
        [phaseId]
      );
      this.sql.run(
        'DELETE FROM pool_fencers WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)',
        [phaseId]
      );
      this.sql.run('DELETE FROM pools WHERE phase_id = ?', [phaseId]);
    });
  }

  public createPool(phaseId: string, number: number, poolId?: string): Pool {
    if (!this.sql.db) throw new Error('Database not open');
    const id = poolId || uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO pools (id, phase_id, number, is_complete, has_error, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)`,
      [id, phaseId, number, now, now]
    );
    return {
      id,
      phaseId,
      number,
      fencers: [],
      matches: [],
      isComplete: false,
      hasError: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    } as unknown as Pool;
  }

  public addFencerToPool(poolId: string, fencerId: string, position: number): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(
      `INSERT OR REPLACE INTO pool_fencers (pool_id, fencer_id, position) VALUES (?, ?, ?)`,
      [poolId, fencerId, position]
    );
  }

  /**
   * Synchronise une poule (état affiché = source de vérité) vers les tables relationnelles.
   * Auto-réparant : crée la phase / la poule / les lignes manquantes sans toucher aux existantes.
   * Utilisé pour l'ajout d'un tireur en cours de compétition (#905).
   */
  public syncPoolSnapshot(competitionId: string, snapshot: PoolSnapshot): void {
    if (!this.sql.db) throw new Error('Database not open');
    const doSync = this.sql.db.transaction(() => {
      const now = new Date().toISOString();
      const exists = this.sql.queryOne<{ id: string }>('SELECT id FROM pools WHERE id = ?', [
        snapshot.id,
      ]);
      if (!exists) {
        let phase = this.sql.queryOne<{ id: string }>(
          `SELECT id FROM phases WHERE competition_id = ? AND type = 'pool' ORDER BY order_index ASC LIMIT 1`,
          [competitionId]
        );
        if (!phase) phase = { id: this.dm.createPhase(competitionId, 'pool', 1, 'Poules').id };
        this.createPool(phase.id, snapshot.number, snapshot.id);
      }
      snapshot.fencerIds.forEach((fencerId, pos) => {
        this.sql.run(
          `INSERT OR REPLACE INTO pool_fencers (pool_id, fencer_id, position) VALUES (?, ?, ?)`,
          [snapshot.id, fencerId, pos]
        );
      });
      for (const m of snapshot.matches) {
        this.sql.run(
          `INSERT OR IGNORE INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.id,
            m.number,
            snapshot.id,
            m.fencerAId,
            m.fencerBId,
            m.maxScore || 5,
            'not_started',
            now,
            now,
          ]
        );
      }
    });
    doSync();
  }

  public getPoolsByPhase(phaseId: string): Pool[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>(
        'SELECT id, phase_id, number, is_complete, has_error, referee_id, referee_ids, created_at, updated_at FROM pools WHERE phase_id = ? ORDER BY number',
        [phaseId]
      )
      .map(row => {
        const poolId = row.id as string;
        const fencers = this.getPoolFencers(poolId);
        const matches = this.dm.getMatchesByPool(poolId);
        const referees: Referee[] = parsePoolRefereeIds(row)
          .map(id => this.dm.getReferee(id))
          .filter((r): r is Referee => !!r);
        return {
          id: poolId,
          phaseId: row.phase_id as string,
          number: row.number as number,
          fencers,
          matches,
          referees,
          isComplete: row.is_complete === 1,
          hasError: row.has_error === 1,
          createdAt: new Date(row.created_at as string),
          updatedAt: new Date(row.updated_at as string),
        } as unknown as Pool;
      });
  }
}
