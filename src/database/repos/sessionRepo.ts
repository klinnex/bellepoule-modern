import { validateId, validateSessionState, sanitizeId } from '../validation';
import { safeJsonParse } from './dbUtils';
import type { SqlExecutor } from './sqlExecutor';

/** État de session (session_state) et état des arènes (arena_state) (#1242) */
export class SessionRepo {
  constructor(private readonly sql: SqlExecutor) {}

  // Session State Management
  public saveSessionState(competitionId: string, state: any): void {
    if (!this.sql.db) throw new Error('Database not open');
    validateId(competitionId, 'competitionId');
    validateSessionState(state);
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT OR REPLACE INTO session_state (competition_id, state_json, updated_at) VALUES (?, ?, ?)`,
      [sanitizeId(competitionId), JSON.stringify(state), now]
    );
  }

  public getSessionState(competitionId: string): any | null {
    if (!this.sql.db) throw new Error('Database not open');
    validateId(competitionId, 'competitionId');
    const row = this.sql.queryOne<{ state_json: string }>(
      'SELECT state_json FROM session_state WHERE competition_id = ?',
      [sanitizeId(competitionId)]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.state_json);
    } catch {
      return null;
    }
  }

  public clearSessionState(competitionId: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    validateId(competitionId, 'competitionId');
    this.sql.run('DELETE FROM session_state WHERE competition_id = ?', [sanitizeId(competitionId)]);
  }

  // ─── Arena state persistence ─────────────────────────────────────────────────

  public saveArenaState(
    arenaId: string,
    state: {
      competitionId: string;
      currentMatch: any | null;
      matchQueue: any[];
      settings: any;
      status: string;
    }
  ): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(
      `INSERT OR REPLACE INTO arena_state (arena_id, competition_id, current_match, match_queue, settings, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        arenaId,
        state.competitionId,
        state.currentMatch != null ? JSON.stringify(state.currentMatch) : null,
        JSON.stringify(state.matchQueue),
        state.settings != null ? JSON.stringify(state.settings) : null,
        state.status,
        new Date().toISOString(),
      ]
    );
  }

  public getArenaState(arenaId: string): {
    arenaId: string;
    competitionId: string;
    currentMatch: any | null;
    matchQueue: any[];
    settings: any | null;
    status: string;
    updatedAt: string;
  } | null {
    if (!this.sql.db) throw new Error('Database not open');
    const r = this.sql.queryOne<any>(`SELECT * FROM arena_state WHERE arena_id=?`, [arenaId]);
    if (!r) return null;
    return {
      arenaId: r.arena_id as string,
      competitionId: r.competition_id as string,
      currentMatch: safeJsonParse<any>(r.current_match, null, `arena ${arenaId}`),
      matchQueue: safeJsonParse<any[]>(r.match_queue, [], `arena ${arenaId}`),
      settings: safeJsonParse<any>(r.settings, null, `arena ${arenaId}`),
      status: r.status as string,
      updatedAt: r.updated_at as string,
    };
  }

  public getArenaStatesByCompetition(
    competitionId: string
  ): ReturnType<SessionRepo['getArenaState']>[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<{ arena_id: string }>(`SELECT arena_id FROM arena_state WHERE competition_id=?`, [
        competitionId,
      ])
      .map(r => this.getArenaState(r.arena_id))
      .filter(Boolean) as any;
  }

  public clearArenaStates(competitionId: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(`DELETE FROM arena_state WHERE competition_id=?`, [competitionId]);
  }
}
