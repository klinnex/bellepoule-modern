import { v4 as uuidv4 } from 'uuid';
import { Fencer, Match, MatchStatus, Referee, MatchEventEntry } from '../../shared/types';
import { safeJsonParse } from './dbUtils';
import type { SqlExecutor } from './sqlExecutor';
import type { DatabaseManager } from '../index';
import {
  healMatchStatus,
  parseFencerRow,
  rowToReferee,
  parseAuditRow,
  parseTimelineRow,
} from './rowMappers';

/** Matchs (poules + tableau), touches, cartons, arbre, journal des scores et chronologie (#1242) */
export class MatchRepo {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly dm: DatabaseManager
  ) {}

  // Match CRUD
  public createMatch(match: Partial<Match>, poolId?: string): Match {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = match.id || uuidv4();
    this.sql.run(
      `INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        match.number || 1,
        poolId || null,
        match.fencerA?.id || (match as any).fencerAId || null,
        match.fencerB?.id || (match as any).fencerBId || null,
        match.maxScore || 5,
        'not_started',
        now,
        now,
      ]
    );
    return this.getMatch(id)!;
  }

  public upsertMultipleTableauMatches(
    competitionId: string,
    matches: Array<{
      matchId: string;
      round: number;
      position: number;
      fencerAId?: string | null;
      fencerBId?: string | null;
      scoreA?: any | null;
      scoreB?: any | null;
      status?: string;
      maxScore?: number;
      isBye?: boolean;
    }>
  ): void {
    if (!this.sql.db) throw new Error('Database not open');
    if (matches.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.sql.db.prepare(`
      INSERT INTO matches
        (id, number, table_id, fencer_a_id, fencer_b_id, score_a, score_b, max_score, status, round, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        fencer_a_id = excluded.fencer_a_id,
        fencer_b_id = excluded.fencer_b_id,
        score_a     = excluded.score_a,
        score_b     = excluded.score_b,
        max_score   = excluded.max_score,
        status      = excluded.status,
        round       = excluded.round,
        position    = excluded.position,
        updated_at  = excluded.updated_at
    `);
    // Scores existants : un changement de score alimente l'historique (#927)
    const existing = new Map<string, { a: any; b: any }>();
    for (const r of this.sql.queryAll<any>(
      `SELECT id, score_a, score_b FROM matches WHERE table_id = ? AND round IS NOT NULL`,
      [competitionId]
    )) {
      existing.set(r.id as string, {
        a: safeJsonParse(r.score_a, null, `match ${r.id} score_a`),
        b: safeJsonParse(r.score_b, null, `match ${r.id} score_b`),
      });
    }
    const insertMany = this.sql.db.transaction((rows: typeof matches) => {
      for (const m of rows) {
        const dbId = `${competitionId}-${m.matchId}`;
        const prev = existing.get(dbId);
        const scoreChanged =
          (prev?.a?.value ?? null) !== (m.scoreA?.value ?? null) ||
          (prev?.b?.value ?? null) !== (m.scoreB?.value ?? null);
        if (!m.isBye && m.scoreA != null && m.scoreB != null && scoreChanged) {
          this.logScoreChange({
            matchId: dbId,
            previousScoreA: prev?.a ?? undefined,
            previousScoreB: prev?.b ?? undefined,
            newScoreA: m.scoreA,
            newScoreB: m.scoreB,
            changedBy: 'ui',
            reason: 'tableau_entry',
          });
        }
        stmt.run(
          dbId,
          parseInt(m.matchId.replace('-', '')) || 0,
          competitionId,
          m.fencerAId ?? null,
          m.fencerBId ?? null,
          m.scoreA != null ? JSON.stringify(m.scoreA) : null,
          m.scoreB != null ? JSON.stringify(m.scoreB) : null,
          m.maxScore ?? 15,
          m.status ?? 'not_started',
          m.round,
          m.position,
          now,
          now
        );
      }
    });
    insertMany(matches);
  }

  public upsertTableauMatch(params: {
    competitionId: string;
    matchId: string;
    round: number;
    position: number;
    fencerAId?: string | null;
    fencerBId?: string | null;
    scoreA?: any | null;
    scoreB?: any | null;
    status?: string;
    maxScore?: number;
    isBye?: boolean;
  }): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const dbId = `${params.competitionId}-${params.matchId}`;
    const status = params.status ?? 'not_started';
    if (!this.getMatch(dbId)) {
      this.sql.run(
        `INSERT INTO matches (id, number, table_id, fencer_a_id, fencer_b_id, max_score, status, round, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dbId,
          parseInt(params.matchId.replace('-', '')) || 0,
          params.competitionId,
          params.fencerAId ?? null,
          params.fencerBId ?? null,
          params.maxScore ?? 15,
          status,
          params.round,
          params.position,
          now,
          now,
        ]
      );
    } else {
      this.sql.run(
        `UPDATE matches SET fencer_a_id=?, fencer_b_id=?, score_a=?, score_b=?, status=?, round=?, position=?, updated_at=? WHERE id=?`,
        [
          params.fencerAId ?? null,
          params.fencerBId ?? null,
          params.scoreA != null ? JSON.stringify(params.scoreA) : null,
          params.scoreB != null ? JSON.stringify(params.scoreB) : null,
          status,
          params.round,
          params.position,
          now,
          dbId,
        ]
      );
    }
  }

  public getTableauMatchesForExport(competitionId: string): Array<{
    id: string;
    round: number;
    position: number;
    isBye: boolean;
    fencerA: { id: string; firstName?: string; lastName: string; club?: string } | null;
    fencerB: { id: string; firstName?: string; lastName: string; club?: string } | null;
    scoreA: number | null;
    scoreB: number | null;
    winner: { id: string } | null;
  }> {
    if (!this.sql.db) throw new Error('Database not open');
    const rows = this.sql.queryAll<any>(
      `SELECT m.id, m.round, m.position,
              m.fencer_a_id, m.fencer_b_id, m.score_a, m.score_b,
              fa.first_name AS fa_first, fa.last_name AS fa_last, fa.club AS fa_club,
              fb.first_name AS fb_first, fb.last_name AS fb_last, fb.club AS fb_club
       FROM matches m
       LEFT JOIN fencers fa ON fa.id = m.fencer_a_id
       LEFT JOIN fencers fb ON fb.id = m.fencer_b_id
       WHERE m.table_id = ? AND m.round IS NOT NULL
       ORDER BY m.round, m.position`,
      [competitionId]
    );
    return rows.map(row => {
      let scoreAVal: number | null = null;
      let scoreBVal: number | null = null;
      let winner: { id: string } | null = null;
      try {
        if (row.score_a) {
          const sa = JSON.parse(row.score_a as string);
          scoreAVal = sa.value ?? null;
          if (sa.isVictory && row.fencer_a_id) winner = { id: row.fencer_a_id as string };
        }
        if (row.score_b) {
          const sb = JSON.parse(row.score_b as string);
          scoreBVal = sb.value ?? null;
          if (sb.isVictory && row.fencer_b_id) winner = { id: row.fencer_b_id as string };
        }
      } catch {
        /* skip bad score JSON */
      }
      return {
        id: row.id as string,
        round: row.round as number,
        position: row.position as number,
        isBye: !!row.fencer_a_id !== !!row.fencer_b_id,
        fencerA: row.fencer_a_id
          ? {
              id: row.fencer_a_id as string,
              firstName: row.fa_first as string | undefined,
              lastName: (row.fa_last as string) || '',
              club: row.fa_club as string | undefined,
            }
          : null,
        fencerB: row.fencer_b_id
          ? {
              id: row.fencer_b_id as string,
              firstName: row.fb_first as string | undefined,
              lastName: (row.fb_last as string) || '',
              club: row.fb_club as string | undefined,
            }
          : null,
        scoreA: scoreAVal,
        scoreB: scoreBVal,
        winner,
      };
    });
  }

  public getMatch(id: string): Match | null {
    if (!this.sql.db) throw new Error('Database not open');
    const row = this.sql.queryOne<any>('SELECT * FROM matches WHERE id = ?', [id]);
    if (!row) return null;
    const scoreA = safeJsonParse<any>(row.score_a, null, `match ${row.id} score_a`);
    const scoreB = safeJsonParse<any>(row.score_b, null, `match ${row.id} score_b`);
    const status = healMatchStatus(row.status as MatchStatus, scoreA, scoreB);
    return {
      id: row.id as string,
      number: row.number as number,
      fencerA: row.fencer_a_id ? this.dm.getFencer(row.fencer_a_id as string) : null,
      fencerB: row.fencer_b_id ? this.dm.getFencer(row.fencer_b_id as string) : null,
      scoreA,
      scoreB,
      maxScore: row.max_score as number,
      status,
      poolId: row.pool_id as string,
      tableId: row.table_id as string,
      round: row.round as number,
      referee: row.referee_id
        ? (this.dm.getReferee(row.referee_id as string) ?? undefined)
        : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  public getMatchesByPool(poolId: string): Match[] {
    if (!this.sql.db) throw new Error('Database not open');
    const matchRows = this.sql.queryAll<any>(
      'SELECT * FROM matches WHERE pool_id = ? ORDER BY number',
      [poolId]
    );
    return this.hydrateMatchRows(matchRows);
  }

  // Hydratation batch : charge tous les tireurs/arbitres en 2 requêtes au lieu d'un getMatch() par ligne.
  private hydrateMatchRows(matchRows: any[]): Match[] {
    if (matchRows.length === 0) return [];

    const fencerIds = new Set<string>();
    for (const row of matchRows) {
      if (row.fencer_a_id) fencerIds.add(row.fencer_a_id as string);
      if (row.fencer_b_id) fencerIds.add(row.fencer_b_id as string);
    }
    const fencersById = new Map<string, Fencer>();
    if (fencerIds.size > 0) {
      const placeholders = Array.from({ length: fencerIds.size }, () => '?').join(',');
      this.sql
        .queryAll<any>(`SELECT * FROM fencers WHERE id IN (${placeholders})`, Array.from(fencerIds))
        .forEach(fRow => fencersById.set(fRow.id as string, parseFencerRow(fRow)));
    }

    const refereeIds = new Set<string>();
    for (const row of matchRows) {
      if (row.referee_id) refereeIds.add(row.referee_id as string);
    }
    const refereesById = new Map<string, Referee>();
    if (refereeIds.size > 0) {
      const placeholders = Array.from({ length: refereeIds.size }, () => '?').join(',');
      this.sql
        .queryAll<any>(
          `SELECT * FROM referees WHERE id IN (${placeholders})`,
          Array.from(refereeIds)
        )
        .forEach(rRow => refereesById.set(rRow.id as string, rowToReferee(rRow)));
    }

    return matchRows.map(row => {
      const scoreA = safeJsonParse<any>(row.score_a, null, `match ${row.id} score_a`);
      const scoreB = safeJsonParse<any>(row.score_b, null, `match ${row.id} score_b`);
      const status = healMatchStatus(row.status as MatchStatus, scoreA, scoreB);
      return {
        id: row.id as string,
        number: row.number as number,
        fencerA: row.fencer_a_id ? (fencersById.get(row.fencer_a_id as string) ?? null) : null,
        fencerB: row.fencer_b_id ? (fencersById.get(row.fencer_b_id as string) ?? null) : null,
        scoreA,
        scoreB,
        maxScore: row.max_score as number,
        status,
        poolId: row.pool_id as string,
        tableId: row.table_id as string,
        round: row.round as number,
        referee: row.referee_id
          ? (refereesById.get(row.referee_id as string) ?? undefined)
          : undefined,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      };
    });
  }

  public getPendingMatches(competitionId: string): Match[] {
    if (!this.sql.db) throw new Error('Database not open');
    let poolIds: string[] = [];
    try {
      poolIds = this.sql
        .queryAll<{ id: string }>(
          'SELECT id FROM pools WHERE phase_id IN (SELECT id FROM phases WHERE competition_id = ?) ORDER BY number',
          [competitionId]
        )
        .map(r => r.id);
    } catch (e) {
      console.warn('[Database] Falling back to pool_fencers approach for getPendingMatches:', e);
    }
    if (poolIds.length === 0) {
      try {
        poolIds = this.sql
          .queryAll<{ id: string }>(
            `SELECT DISTINCT p.id FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ?`,
            [competitionId]
          )
          .map(r => r.id);
      } catch (e) {
        console.warn('[Database] Alternative approach also failed:', e);
      }
    }
    if (poolIds.length === 0) return [];
    const placeholders = poolIds.map(() => '?').join(',');
    const matchRows = this.sql.queryAll<any>(
      `SELECT m.* FROM matches m JOIN pools p ON m.pool_id = p.id WHERE m.pool_id IN (${placeholders}) AND m.status IN ('not_started', 'in_progress') ORDER BY p.number, m.number`,
      poolIds
    );
    return this.hydrateMatchRows(matchRows);
  }

  public getAllPendingMatchesFromPools(competitionId: string): Match[] {
    if (!this.sql.db) throw new Error('Database not open');
    let poolIds: string[] = [];
    try {
      poolIds = this.sql
        .queryAll<{ id: string }>(
          `SELECT DISTINCT p.id FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ? ORDER BY p.number`,
          [competitionId]
        )
        .map(r => r.id);
    } catch (e) {
      console.warn('[Database] Error getting pools via pool_fencers:', e);
      return [];
    }
    if (poolIds.length === 0) return [];
    const placeholders = poolIds.map(() => '?').join(',');
    const matchRows = this.sql.queryAll<any>(
      `SELECT m.* FROM matches m JOIN pools p ON m.pool_id = p.id WHERE m.pool_id IN (${placeholders}) AND m.status IN ('not_started', 'in_progress') ORDER BY p.number, m.number`,
      poolIds
    );
    return this.hydrateMatchRows(matchRows);
  }

  public getPendingMatchesDirectly(competitionId: string): Match[] {
    if (!this.sql.db) throw new Error('Database not open');
    try {
      const matchRows = this.sql.queryAll<any>(
        `SELECT m.* FROM matches m
         LEFT JOIN pools p ON m.pool_id = p.id
         INNER JOIN fencers fA ON m.fencer_a_id = fA.id
         INNER JOIN fencers fB ON m.fencer_b_id = fB.id
         WHERE (fA.competition_id = ? OR fB.competition_id = ?)
         AND m.status IN ('not_started', 'in_progress')
         ORDER BY p.number, m.number`,
        [competitionId, competitionId]
      );
      if (matchRows.length > 0) {
        return this.hydrateMatchRows(matchRows);
      }
    } catch (e) {
      console.error('[Database] getPendingMatchesDirectly: Error:', e);
    }
    try {
      const compFencers = new Set(
        this.sql
          .queryAll<{ id: string }>('SELECT id FROM fencers WHERE competition_id = ?', [
            competitionId,
          ])
          .map(r => r.id)
      );
      const matchRows = this.sql.queryAll<any>('SELECT * FROM matches WHERE status IN (?, ?)', [
        'not_started',
        'in_progress',
      ]);
      return this.hydrateMatchRows(matchRows).filter(m => {
        if (!m.fencerA || !m.fencerB) return false;
        return compFencers.has(m.fencerA.id) || compFencers.has(m.fencerB.id);
      });
    } catch (e) {
      console.error('[Database] getPendingMatchesDirectly: Fallback error:', e);
    }
    return [];
  }

  public updateMatch(id: string, updates: Partial<Match> & { refereeId?: string | null }): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const params: unknown[] = [];
    if (updates.scoreA !== undefined) {
      setClauses.push('score_a = ?');
      params.push(JSON.stringify(updates.scoreA));
    }
    if (updates.scoreB !== undefined) {
      setClauses.push('score_b = ?');
      params.push(JSON.stringify(updates.scoreB));
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }
    if (updates.refereeId !== undefined) {
      setClauses.push('referee_id = ?');
      params.push(updates.refereeId);
    }
    if (setClauses.length === 0) return;
    setClauses.push('updated_at = ?');
    params.push(now, id);
    this.sql.run(`UPDATE matches SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }

  // ─── Touch / Card read methods ───────────────────────────────────────────────

  public getTouches(matchId: string): Array<{
    id: string;
    fencerId: string;
    zone: string;
    points: number;
    timestamp: string;
    isValidInSuddenDeath: boolean;
    isReversed: boolean;
  }> {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<any>(
        'SELECT id, fencer_id, zone, points, timestamp, is_valid_in_sudden_death, is_reversed FROM match_touches WHERE match_id = ? ORDER BY timestamp ASC',
        [matchId]
      )
      .map(r => ({
        id: r.id as string,
        fencerId: r.fencer_id as string,
        zone: r.zone as string,
        points: r.points as number,
        timestamp: r.timestamp as string,
        isValidInSuddenDeath: r.is_valid_in_sudden_death === 1,
        isReversed: r.is_reversed === 1,
      }));
  }

  public getCards(matchId: string): Array<{
    id: string;
    fencerId: string;
    cardType: string;
    reason: string;
    cardGroup: number;
    timestamp: string;
    pointsAwarded: number;
    resultingExclusion: boolean;
  }> {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<any>(
        'SELECT id, fencer_id, card_type, reason, card_group, timestamp, points_awarded, resulting_exclusion FROM match_cards WHERE match_id = ? ORDER BY timestamp ASC',
        [matchId]
      )
      .map(r => ({
        id: r.id as string,
        fencerId: r.fencer_id as string,
        cardType: r.card_type as string,
        reason: r.reason as string,
        cardGroup: r.card_group as number,
        timestamp: r.timestamp as string,
        pointsAwarded: r.points_awarded as number,
        resultingExclusion: r.resulting_exclusion === 1,
      }));
  }

  // ─── Statistiques combattants ───────────────────────────────────────────────

  public saveTouch(touch: {
    id: string;
    matchId: string;
    fencerId: string;
    zone: string;
    points: number;
    timestamp: string;
    isValidInSuddenDeath?: boolean;
    isReversed?: boolean;
  }): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(
      `INSERT OR REPLACE INTO match_touches (id, match_id, fencer_id, zone, points, timestamp, is_valid_in_sudden_death, is_reversed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        touch.id,
        touch.matchId,
        touch.fencerId,
        touch.zone,
        touch.points,
        touch.timestamp,
        touch.isValidInSuddenDeath ? 1 : 0,
        touch.isReversed ? 1 : 0,
      ]
    );
  }

  public saveCard(card: {
    id: string;
    matchId: string;
    fencerId: string;
    cardType: string;
    reason: string;
    cardGroup: number;
    timestamp: string;
    pointsAwarded: number;
    resultingExclusion?: boolean;
  }): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(
      `INSERT OR REPLACE INTO match_cards (id, match_id, fencer_id, card_type, reason, card_group, timestamp, points_awarded, resulting_exclusion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        card.matchId,
        card.fencerId,
        card.cardType,
        card.reason,
        card.cardGroup,
        card.timestamp,
        card.pointsAwarded,
        card.resultingExclusion ? 1 : 0,
      ]
    );
  }

  public updateMatchTiming(
    matchId: string,
    startTime: string | null,
    endTime: string | null,
    duration: number | null
  ): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(
      `UPDATE matches SET start_time = ?, end_time = ?, duration = ?, updated_at = ? WHERE id = ?`,
      [startTime, endTime, duration, new Date().toISOString(), matchId]
    );
  }

  public saveArenaExit(exit: {
    id: string;
    matchId: string;
    fencerId: string;
    exitType: string;
    timestamp: string;
    pointsAwarded: number;
  }): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(
      `INSERT OR REPLACE INTO match_arena_exits (id, match_id, fencer_id, exit_type, timestamp, points_awarded) VALUES (?, ?, ?, ?, ?, ?)`,
      [exit.id, exit.matchId, exit.fencerId, exit.exitType, exit.timestamp, exit.pointsAwarded]
    );
  }

  // ─── Bracket nodes (élimination directe) ────────────────────────────────────

  public upsertBracketNode(node: {
    id: string;
    competitionId: string;
    phaseId: string;
    round: number;
    position: number;
    fencerId?: string | null;
    matchId?: string | null;
    isBye?: boolean;
    isThirdPlace?: boolean;
    parentNodeId?: string | null;
  }): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT OR REPLACE INTO bracket_nodes
        (id, competition_id, phase_id, round, position, fencer_id, match_id, is_bye, is_third_place, parent_node_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM bracket_nodes WHERE id=?), ?), ?)`,
      [
        node.id,
        node.competitionId,
        node.phaseId,
        node.round,
        node.position,
        node.fencerId ?? null,
        node.matchId ?? null,
        node.isBye ? 1 : 0,
        node.isThirdPlace ? 1 : 0,
        node.parentNodeId ?? null,
        node.id,
        now,
        now,
      ]
    );
  }

  public getBracketNodes(competitionId: string, phaseId: string): any[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>(
        `SELECT * FROM bracket_nodes WHERE competition_id=? AND phase_id=? ORDER BY round, position`,
        [competitionId, phaseId]
      )
      .map(r => ({ ...r, isBye: r.is_bye === 1, isThirdPlace: r.is_third_place === 1 }));
  }

  public clearBracket(competitionId: string, phaseId: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(`DELETE FROM bracket_nodes WHERE competition_id=? AND phase_id=?`, [
      competitionId,
      phaseId,
    ]);
  }

  // ─── Score audit log ─────────────────────────────────────────────────────────

  public logScoreChange(entry: {
    matchId: string;
    arenaId?: string;
    previousScoreA?: any;
    previousScoreB?: any;
    newScoreA: any;
    newScoreB: any;
    changedBy: string;
    reason?: string;
    refereeId?: string;
    refereeName?: string;
    ipAddress?: string;
    poolId?: string;
  }): void {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: uuidv4gen } = require('uuid');
    this.sql.run(
      `INSERT INTO score_audit_log (id, match_id, arena_id, previous_score_a, previous_score_b, new_score_a, new_score_b, changed_by, changed_at, reason, referee_id, referee_name, ip_address, pool_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4gen(),
        entry.matchId,
        entry.arenaId ?? null,
        entry.previousScoreA != null ? JSON.stringify(entry.previousScoreA) : null,
        entry.previousScoreB != null ? JSON.stringify(entry.previousScoreB) : null,
        JSON.stringify(entry.newScoreA),
        JSON.stringify(entry.newScoreB),
        entry.changedBy,
        new Date().toISOString(),
        entry.reason ?? null,
        entry.refereeId ?? null,
        entry.refereeName ?? null,
        entry.ipAddress ?? null,
        entry.poolId ?? null,
      ]
    );
  }

  public getScoreAuditLog(matchId: string): any[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>(
        `SELECT sal.*, m.number as match_number, p.number as pool_number FROM score_audit_log sal LEFT JOIN matches m ON sal.match_id = m.id LEFT JOIN pools p ON m.pool_id = p.id WHERE sal.match_id=? ORDER BY sal.changed_at ASC`,
        [matchId]
      )
      .map(r => parseAuditRow(r));
  }

  public getScoreAuditLogByCompetition(competitionId: string): any[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>(
        `SELECT sal.*, m.number as match_number, p.number as pool_number, m.round as tableau_round, m.position as tableau_position
       FROM score_audit_log sal
       JOIN matches m ON sal.match_id = m.id
       LEFT JOIN pools p ON m.pool_id = p.id
       LEFT JOIN phases ph ON p.phase_id = ph.id
       WHERE ph.competition_id = ? OR (m.pool_id IS NULL AND m.table_id = ? AND m.round IS NOT NULL)
       ORDER BY sal.changed_at DESC`,
        [competitionId, competitionId]
      )
      .map(r => parseAuditRow(r));
  }

  private static readonly TIMELINE_UNION_MATCH = `
    SELECT sal.id, sal.match_id, 'score_change' AS event_type,
           sal.changed_at AS timestamp,
           NULL AS fencer_id, NULL AS fencer_last_name, NULL AS fencer_first_name, NULL AS fencer_side,
           sal.previous_score_a AS prev_a, sal.previous_score_b AS prev_b,
           sal.new_score_a AS new_a, sal.new_score_b AS new_b,
           sal.changed_by, sal.referee_name, sal.ip_address, sal.reason AS change_reason,
           NULL AS zone, NULL AS points,
           NULL AS card_type, NULL AS card_reason, NULL AS card_group, NULL AS resulting_exclusion,
           NULL AS exit_type
    FROM score_audit_log sal WHERE sal.match_id = ?
    UNION ALL
    SELECT mt.id, mt.match_id, 'touch', mt.timestamp,
           mt.fencer_id, f.last_name, f.first_name,
           CASE WHEN m.fencer_a_id = mt.fencer_id THEN 'A' ELSE 'B' END,
           NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
           mt.zone, mt.points,
           NULL, NULL, NULL, NULL, NULL
    FROM match_touches mt
    LEFT JOIN fencers f ON mt.fencer_id = f.id
    LEFT JOIN matches m ON mt.match_id = m.id
    WHERE mt.match_id = ?
    UNION ALL
    SELECT mc.id, mc.match_id, 'card', mc.timestamp,
           mc.fencer_id, f.last_name, f.first_name,
           CASE WHEN m.fencer_a_id = mc.fencer_id THEN 'A' ELSE 'B' END,
           NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
           NULL, mc.points_awarded,
           mc.card_type, mc.reason, mc.card_group, mc.resulting_exclusion,
           NULL
    FROM match_cards mc
    LEFT JOIN fencers f ON mc.fencer_id = f.id
    LEFT JOIN matches m ON mc.match_id = m.id
    WHERE mc.match_id = ?
    UNION ALL
    SELECT mae.id, mae.match_id, 'arena_exit', mae.timestamp,
           mae.fencer_id, f.last_name, f.first_name,
           CASE WHEN m.fencer_a_id = mae.fencer_id THEN 'A' ELSE 'B' END,
           NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
           NULL, mae.points_awarded,
           NULL, NULL, NULL, NULL,
           mae.exit_type
    FROM match_arena_exits mae
    LEFT JOIN fencers f ON mae.fencer_id = f.id
    LEFT JOIN matches m ON mae.match_id = m.id
    WHERE mae.match_id = ?
    ORDER BY timestamp ASC
  `;

  public getMatchTimeline(matchId: string): MatchEventEntry[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>(MatchRepo.TIMELINE_UNION_MATCH, [matchId, matchId, matchId, matchId])
      .map(r => parseTimelineRow(r));
  }

  public getCompetitionTimeline(competitionId: string): MatchEventEntry[] {
    if (!this.sql.db) throw new Error('Database not open');
    const matchSubquery = `
      SELECT m.id FROM matches m
        LEFT JOIN pools p ON m.pool_id = p.id
        LEFT JOIN phases ph ON p.phase_id = ph.id
        WHERE ph.competition_id = ?
      UNION
      SELECT m.id FROM matches m
        JOIN bracket_nodes bn ON m.id = bn.match_id
        WHERE bn.competition_id = ?
      UNION
      SELECT m.id FROM matches m
        WHERE m.pool_id IS NULL AND m.table_id = ? AND m.round IS NOT NULL
    `;
    const sql = `
      SELECT sal.id, sal.match_id, 'score_change' AS event_type,
             sal.changed_at AS timestamp,
             NULL AS fencer_id, NULL AS fencer_last_name, NULL AS fencer_first_name, NULL AS fencer_side,
             sal.previous_score_a AS prev_a, sal.previous_score_b AS prev_b,
             sal.new_score_a AS new_a, sal.new_score_b AS new_b,
             sal.changed_by, sal.referee_name, sal.ip_address, sal.reason AS change_reason,
             NULL AS zone, NULL AS points,
             NULL AS card_type, NULL AS card_reason, NULL AS card_group, NULL AS resulting_exclusion,
             NULL AS exit_type
      FROM score_audit_log sal
      WHERE sal.match_id IN (${matchSubquery})
      UNION ALL
      SELECT mt.id, mt.match_id, 'touch', mt.timestamp,
             mt.fencer_id, f.last_name, f.first_name,
             CASE WHEN m.fencer_a_id = mt.fencer_id THEN 'A' ELSE 'B' END,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             mt.zone, mt.points,
             NULL, NULL, NULL, NULL, NULL
      FROM match_touches mt
      LEFT JOIN fencers f ON mt.fencer_id = f.id
      LEFT JOIN matches m ON mt.match_id = m.id
      WHERE mt.match_id IN (${matchSubquery})
      UNION ALL
      SELECT mc.id, mc.match_id, 'card', mc.timestamp,
             mc.fencer_id, f.last_name, f.first_name,
             CASE WHEN m.fencer_a_id = mc.fencer_id THEN 'A' ELSE 'B' END,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             NULL, mc.points_awarded,
             mc.card_type, mc.reason, mc.card_group, mc.resulting_exclusion,
             NULL
      FROM match_cards mc
      LEFT JOIN fencers f ON mc.fencer_id = f.id
      LEFT JOIN matches m ON mc.match_id = m.id
      WHERE mc.match_id IN (${matchSubquery})
      UNION ALL
      SELECT mae.id, mae.match_id, 'arena_exit', mae.timestamp,
             mae.fencer_id, f.last_name, f.first_name,
             CASE WHEN m.fencer_a_id = mae.fencer_id THEN 'A' ELSE 'B' END,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             NULL, mae.points_awarded,
             NULL, NULL, NULL, NULL,
             mae.exit_type
      FROM match_arena_exits mae
      LEFT JOIN fencers f ON mae.fencer_id = f.id
      LEFT JOIN matches m ON mae.match_id = m.id
      WHERE mae.match_id IN (${matchSubquery})
      ORDER BY timestamp ASC
    `;
    // 3 params per matchSubquery × 4 UNION branches = 12 bindings (matchs de tableau inclus, #1031)
    const params = Array<string>(12).fill(competitionId);
    return this.sql.queryAll<any>(sql, params).map(r => parseTimelineRow(r));
  }
}
