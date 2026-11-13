import type { SqlExecutor } from './sqlExecutor';
import type { SqlRow } from './rowMappers';
import type { MatchTiming, RemoteEvent, RemoteEventType } from '../../shared/types';

const TYPES: readonly RemoteEventType[] = ['dt_call', 'disconnect', 'offline_sync', 'sync_error'];

/**
 * Données de l'onglet Organisation (#1817) : journal des événements des saisies
 * distantes (appels DT, pertes de connexion, resynchros) et horodatage des matchs.
 */
export class OrganisationRepo {
  constructor(private readonly sql: SqlExecutor) {}

  public logRemoteEvent(
    evt: Pick<RemoteEvent, 'competitionId' | 'type'> &
      Partial<Pick<RemoteEvent, 'arenaId' | 'matchId' | 'refereeId' | 'detail'>>
  ): void {
    if (!this.sql.db || !evt.competitionId || !TYPES.includes(evt.type)) return;
    const { v4: gen } = require('uuid');
    this.sql.run(
      `INSERT INTO remote_events (id, competition_id, type, arena_id, match_id, referee_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gen(),
        evt.competitionId,
        evt.type,
        evt.arenaId ?? null,
        evt.matchId ?? null,
        evt.refereeId ?? null,
        evt.detail ?? null,
        new Date().toISOString(),
      ]
    );
  }

  public getRemoteEvents(competitionId: string): RemoteEvent[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<SqlRow>(
        'SELECT * FROM remote_events WHERE competition_id = ? ORDER BY created_at ASC, rowid ASC',
        [competitionId]
      )
      .map(r => ({
        id: r.id as string,
        competitionId: r.competition_id as string,
        type: r.type as RemoteEventType,
        arenaId: (r.arena_id as string | null) ?? null,
        matchId: (r.match_id as string | null) ?? null,
        refereeId: (r.referee_id as string | null) ?? null,
        detail: (r.detail as string | null) ?? null,
        createdAt: r.created_at as string,
      }));
  }

  /** Horodatage de tous les matchs de la compétition (poules + tableau), via le tireur A. */
  public getMatchTimings(competitionId: string): MatchTiming[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<SqlRow>(
        `SELECT m.id, m.pool_id, m.table_id, m.fencer_a_id, m.fencer_b_id, m.status, m.strip,
                m.referee_id, m.start_time, m.end_time, m.duration
         FROM matches m JOIN fencers f ON f.id = m.fencer_a_id
         WHERE f.competition_id = ?`,
        [competitionId]
      )
      .map(r => ({
        matchId: r.id as string,
        poolId: (r.pool_id as string | null) ?? null,
        tableId: (r.table_id as string | null) ?? null,
        fencerAId: (r.fencer_a_id as string | null) ?? null,
        fencerBId: (r.fencer_b_id as string | null) ?? null,
        status: r.status as string,
        strip: (r.strip as number | null) ?? null,
        refereeId: (r.referee_id as string | null) ?? null,
        startTime: (r.start_time as string | null) ?? null,
        endTime: (r.end_time as string | null) ?? null,
        duration: (r.duration as number | null) ?? null,
      }));
  }
}
