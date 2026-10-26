import { v4 as uuidv4 } from 'uuid';
import { Fencer } from '../../shared/types';
import { sanitizeText } from '../validation';
import { FENCER_TEXT_FIELDS } from './dbUtils';
import type { SqlExecutor } from './sqlExecutor';
import { parseFencerRow } from './rowMappers';

/** Tireurs : CRUD, photos, historique, statistiques, instantanés d'abandon (#1242) */
export class FencerRepo {
  constructor(private readonly sql: SqlExecutor) {}

  // Fencer CRUD
  public addFencer(competitionId: string, fencer: Partial<Fencer>): Fencer {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = fencer.id || uuidv4();
    const maxRow = this.sql.queryOne<{ m: number | null }>(
      'SELECT MAX(ref) as m FROM fencers WHERE competition_id = ?',
      [competitionId]
    );
    const maxRef = maxRow?.m ?? 0;
    const ref = fencer.ref || maxRef + 1;
    try {
      this.sql.run(
        `INSERT INTO fencers (id, competition_id, ref, last_name, first_name, birth_date, gender, nationality, club, region, license, ranking, status, photo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          competitionId,
          ref,
          sanitizeText(fencer.lastName),
          sanitizeText(fencer.firstName),
          fencer.birthDate ? fencer.birthDate.toISOString() : null,
          fencer.gender || 'M',
          sanitizeText(fencer.nationality) || 'FRA',
          sanitizeText(fencer.club) || null,
          sanitizeText(fencer.region) || null,
          sanitizeText(fencer.license) || null,
          fencer.ranking || null,
          fencer.status || 'N',
          fencer.photo || null,
          now,
          now,
        ]
      );
      const created = this.getFencer(id);
      if (!created) throw new Error('Failed to retrieve created fencer');
      return created;
    } catch (error) {
      console.error('Database error in addFencer:', error);
      throw error;
    }
  }

  public getFencer(id: string): Fencer | null {
    if (!this.sql.db) throw new Error('Database not open');
    const row = this.sql.queryOne<any>('SELECT * FROM fencers WHERE id = ?', [id]);
    if (!row) return null;
    try {
      return parseFencerRow(row);
    } catch (error) {
      console.error('DB: Error parsing fencer data:', error);
      throw error;
    }
  }

  public getFencersByCompetition(competitionId: string): Fencer[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>('SELECT * FROM fencers WHERE competition_id = ? ORDER BY ref', [competitionId])
      .map(row => parseFencerRow(row));
  }

  public getFencerPhotos(
    competitionId: string
  ): { id: string; license: string | null; lastName: string; firstName: string; photo: string }[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<any>(
        'SELECT id, license, last_name, first_name, photo FROM fencers WHERE competition_id = ? AND photo IS NOT NULL',
        [competitionId]
      )
      .map(row => ({
        id: row.id as string,
        license: (row.license as string | null) || null,
        lastName: row.last_name as string,
        firstName: row.first_name as string,
        photo: row.photo as string,
      }));
  }

  public updateFencerPhotosByLicense(
    competitionId: string,
    photos: { license: string; photo: string }[]
  ): { matched: number; total: number } {
    if (!this.sql.db) throw new Error('Database not open');
    let matched = 0;
    const now = new Date().toISOString();
    const selectStmt = this.sql.db.prepare(
      'SELECT id FROM fencers WHERE competition_id = ? AND license = ? LIMIT 1'
    );
    const updateStmt = this.sql.db.prepare(
      'UPDATE fencers SET photo = ?, updated_at = ? WHERE competition_id = ? AND license = ?'
    );
    for (const { license, photo } of photos) {
      const exists = selectStmt.get(competitionId, license);
      if (exists) {
        updateStmt.run(photo, now, competitionId, license);
        matched++;
      }
    }
    return { matched, total: photos.length };
  }

  public upsertFencersByLicense(
    competitionId: string,
    fencers: Partial<Fencer>[]
  ): { added: number; updated: number } {
    if (!this.sql.db) throw new Error('Database not open');
    let added = 0;
    let updated = 0;
    for (const fencer of fencers) {
      let existing: Fencer | null = null;
      const key = fencer.license?.trim();
      if (key) {
        const row = this.sql.queryOne<{ id: string }>(
          'SELECT id FROM fencers WHERE competition_id = ? AND license = ? LIMIT 1',
          [competitionId, key]
        );
        if (row) existing = this.getFencer(row.id);
      }
      if (!existing && fencer.lastName && fencer.firstName) {
        const row = this.sql.queryOne<{ id: string }>(
          'SELECT id FROM fencers WHERE competition_id = ? AND LOWER(last_name) = LOWER(?) AND LOWER(first_name) = LOWER(?) LIMIT 1',
          [competitionId, fencer.lastName, fencer.firstName]
        );
        if (row) existing = this.getFencer(row.id);
      }
      if (existing) {
        const updates = { ...fencer };
        if (existing.photo && !updates.photo) delete updates.photo;
        this.updateFencer(existing.id, updates);
        updated++;
      } else {
        this.addFencer(competitionId, fencer);
        added++;
      }
    }
    return { added, updated };
  }

  public updateFencer(id: string, updates: Partial<Fencer>): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = {
      lastName: 'last_name',
      firstName: 'first_name',
      gender: 'gender',
      nationality: 'nationality',
      club: 'club',
      region: 'region',
      license: 'license',
      ranking: 'ranking',
      status: 'status',
      photo: 'photo',
      seedNumber: 'seed_number',
      finalRanking: 'final_ranking',
      exclusionReason: 'exclusion_reason',
    };
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${col} = ?`);
        const value = (updates as Record<string, unknown>)[key] ?? null;
        values.push(
          typeof value === 'string' && FENCER_TEXT_FIELDS.has(key) ? sanitizeText(value) : value
        );
      }
    }
    if (updates.poolStats !== undefined) {
      setClauses.push('pool_stats = ?');
      values.push(updates.poolStats ? JSON.stringify(updates.poolStats) : null);
    }
    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      values.push(now, id);
      this.sql.run(`UPDATE fencers SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
  }

  public deleteFencer(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    const exists = this.sql.queryOne<{ id: string }>(
      'SELECT id, last_name FROM fencers WHERE id = ?',
      [id]
    );
    if (!exists) throw new Error(`Tireur avec l'ID ${id} non trouvé`);
    try {
      this.sql.transaction(() => {
        this.sql.run('DELETE FROM pool_fencers WHERE fencer_id = ?', [id]);
        this.sql.run('DELETE FROM matches WHERE fencer_a_id = ? OR fencer_b_id = ?', [id, id]);
        const result = this.sql.run('DELETE FROM fencers WHERE id = ?', [id]);
        if (result.changes === 0) throw new Error(`Échec de la suppression du tireur ${id}`);
      });
    } catch (error) {
      console.error('Erreur lors de la suppression du tireur:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Erreur de base de données lors de la suppression du tireur: ${errorMessage}`
      );
    }
  }

  public deleteAllFencers(competitionId?: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    try {
      this.sql.transaction(() => {
        if (competitionId) {
          this.sql.run(
            `DELETE FROM pool_fencers WHERE fencer_id IN (SELECT id FROM fencers WHERE competition_id = ?)`,
            [competitionId]
          );
          this.sql.run(
            `DELETE FROM matches WHERE fencer_a_id IN (SELECT id FROM fencers WHERE competition_id = ?) OR fencer_b_id IN (SELECT id FROM fencers WHERE competition_id = ?)`,
            [competitionId, competitionId]
          );
          this.sql.run('DELETE FROM fencers WHERE competition_id = ?', [competitionId]);
        } else {
          this.sql.run('DELETE FROM pool_fencers');
          this.sql.run('DELETE FROM matches');
          this.sql.run('DELETE FROM fencers');
        }
      });
    } catch (error) {
      console.error('Erreur lors de la suppression des tireurs:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Erreur de base de données lors de la suppression des tireurs: ${errorMessage}`
      );
    }
  }

  public getFencerHistory(fencerId: string): {
    matches: Array<{
      matchId: string;
      number: number;
      opponentId: string | null;
      opponentLastName: string | null;
      opponentFirstName: string | null;
      scoreA: string | null;
      scoreB: string | null;
      side: 'A' | 'B';
      status: string;
      startTime: string | null;
      endTime: string | null;
      duration: number | null;
      poolId: string | null;
      tableId: string | null;
      round: number | null;
      touches: Array<{
        id: string;
        zone: string;
        points: number;
        timestamp: string;
        isValidInSuddenDeath: boolean;
        isReversed: boolean;
      }>;
      cards: Array<{
        id: string;
        cardType: string;
        reason: string;
        cardGroup: number;
        timestamp: string;
        pointsAwarded: number;
        resultingExclusion: boolean;
      }>;
    }>;
  } {
    if (!this.sql.db) throw new Error('Database not open');
    const matchRows = this.sql.queryAll<any>(
      `SELECT m.id, m.number, m.fencer_a_id, m.fencer_b_id,
              m.score_a, m.score_b, m.status, m.start_time, m.end_time, m.duration,
              m.pool_id, m.table_id, m.round,
              fa.last_name AS opp_a_last, fa.first_name AS opp_a_first,
              fb.last_name AS opp_b_last, fb.first_name AS opp_b_first
       FROM matches m
       LEFT JOIN fencers fa ON m.fencer_a_id = fa.id
       LEFT JOIN fencers fb ON m.fencer_b_id = fb.id
       WHERE (m.fencer_a_id = ? OR m.fencer_b_id = ?) AND m.status = 'finished'
       ORDER BY m.updated_at ASC`,
      [fencerId, fencerId]
    );
    const matches = matchRows.map(row => {
      const side: 'A' | 'B' = row.fencer_a_id === fencerId ? 'A' : 'B';
      const opponentId =
        side === 'A' ? (row.fencer_b_id as string | null) : (row.fencer_a_id as string | null);
      const opponentLastName =
        side === 'A' ? (row.opp_b_last as string | null) : (row.opp_a_last as string | null);
      const opponentFirstName =
        side === 'A' ? (row.opp_b_first as string | null) : (row.opp_a_first as string | null);
      const touches = this.sql
        .queryAll<any>(
          `SELECT id, zone, points, timestamp, is_valid_in_sudden_death, is_reversed FROM match_touches WHERE match_id = ? AND fencer_id = ? ORDER BY timestamp ASC`,
          [row.id as string, fencerId]
        )
        .map(t => ({
          id: t.id as string,
          zone: t.zone as string,
          points: t.points as number,
          timestamp: t.timestamp as string,
          isValidInSuddenDeath: t.is_valid_in_sudden_death === 1,
          isReversed: t.is_reversed === 1,
        }));
      const cards = this.sql
        .queryAll<any>(
          `SELECT id, card_type, reason, card_group, timestamp, points_awarded, resulting_exclusion FROM match_cards WHERE match_id = ? AND fencer_id = ? ORDER BY timestamp ASC`,
          [row.id as string, fencerId]
        )
        .map(c => ({
          id: c.id as string,
          cardType: c.card_type as string,
          reason: c.reason as string,
          cardGroup: c.card_group as number,
          timestamp: c.timestamp as string,
          pointsAwarded: c.points_awarded as number,
          resultingExclusion: c.resulting_exclusion === 1,
        }));
      return {
        matchId: row.id as string,
        number: row.number as number,
        opponentId,
        opponentLastName,
        opponentFirstName,
        scoreA: row.score_a as string | null,
        scoreB: row.score_b as string | null,
        side,
        status: row.status as string,
        startTime: row.start_time as string | null,
        endTime: row.end_time as string | null,
        duration: row.duration as number | null,
        poolId: row.pool_id as string | null,
        tableId: row.table_id as string | null,
        round: row.round as number | null,
        touches,
        cards,
      };
    });
    return { matches };
  }

  public getFencerCompetitionStats(fencerId: string): {
    fencerId: string;
    fencerLastName: string;
    fencerFirstName: string;
    fencerClub?: string;
    competitionId: string;
    touchesZoneA: number;
    touchesZoneB: number;
    touchesZoneC: number;
    totalTouchPoints: number;
    whiteCards: number;
    yellowCards: number;
    redCards: number;
    cardsByReason: Record<string, number>;
    arenaExits: number;
    matchesPlayed: number;
    totalDurationSeconds: number;
    averageDurationSeconds: number;
    matchesFinishedEarly: number;
  } {
    if (!this.sql.db) throw new Error('Database not open');
    const fencerRow = this.sql.queryOne<any>(
      'SELECT last_name, first_name, club, competition_id FROM fencers WHERE id = ?',
      [fencerId]
    );
    const empty = {
      fencerId,
      fencerLastName: (fencerRow?.last_name as string) ?? '',
      fencerFirstName: (fencerRow?.first_name as string) ?? '',
      fencerClub: (fencerRow?.club as string) || undefined,
      competitionId: (fencerRow?.competition_id as string) ?? '',
      touchesZoneA: 0,
      touchesZoneB: 0,
      touchesZoneC: 0,
      totalTouchPoints: 0,
      whiteCards: 0,
      yellowCards: 0,
      redCards: 0,
      cardsByReason: {} as Record<string, number>,
      arenaExits: 0,
      matchesPlayed: 0,
      totalDurationSeconds: 0,
      averageDurationSeconds: 0,
      matchesFinishedEarly: 0,
    };
    this.sql
      .queryAll<any>(
        `SELECT zone, SUM(points) AS pts, COUNT(*) AS cnt FROM match_touches WHERE fencer_id = ? AND is_reversed = 0 GROUP BY zone`,
        [fencerId]
      )
      .forEach(r => {
        if (r.zone === 'A') {
          empty.touchesZoneA = r.cnt as number;
          empty.totalTouchPoints += r.pts as number;
        } else if (r.zone === 'B') {
          empty.touchesZoneB = r.cnt as number;
          empty.totalTouchPoints += r.pts as number;
        } else if (r.zone === 'C') {
          empty.touchesZoneC = r.cnt as number;
          empty.totalTouchPoints += r.pts as number;
        }
      });
    this.sql
      .queryAll<any>(
        `SELECT card_type, reason, COUNT(*) AS cnt FROM match_cards WHERE fencer_id = ? GROUP BY card_type, reason`,
        [fencerId]
      )
      .forEach(r => {
        const type = (r.card_type as string).toLowerCase();
        const cnt = r.cnt as number;
        if (type === 'white') empty.whiteCards += cnt;
        else if (type === 'yellow') empty.yellowCards += cnt;
        else if (type === 'red') empty.redCards += cnt;
        const reason = r.reason as string;
        if (reason && reason !== 'unknown')
          empty.cardsByReason[reason] = (empty.cardsByReason[reason] ?? 0) + cnt;
      });
    const exitRow = this.sql.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM match_arena_exits WHERE fencer_id = ?',
      [fencerId]
    );
    empty.arenaExits = exitRow?.cnt ?? 0;
    const durRow = this.sql.queryOne<any>(
      `SELECT COUNT(*) AS total, SUM(COALESCE(duration, 0)) AS total_dur, SUM(CASE WHEN duration IS NOT NULL AND duration < 180 THEN 1 ELSE 0 END) AS early FROM matches WHERE (fencer_a_id = ? OR fencer_b_id = ?) AND status = 'finished'`,
      [fencerId, fencerId]
    );
    if (durRow) {
      empty.matchesPlayed = (durRow.total as number) ?? 0;
      empty.totalDurationSeconds = (durRow.total_dur as number) ?? 0;
      empty.averageDurationSeconds =
        empty.matchesPlayed > 0 ? Math.round(empty.totalDurationSeconds / empty.matchesPlayed) : 0;
      empty.matchesFinishedEarly = (durRow.early as number) ?? 0;
    }
    return empty;
  }

  public getCompetitionFencerStats(
    competitionId: string
  ): ReturnType<typeof this.getFencerCompetitionStats>[] {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql
      .queryAll<{ id: string }>('SELECT id FROM fencers WHERE competition_id = ? ORDER BY ref', [
        competitionId,
      ])
      .map(r => this.getFencerCompetitionStats(r.id));
  }

  // ─── Abandon snapshots ──────────────────────────────────────────────────────

  public saveAbandonSnapshot(
    fencerId: string,
    competitionId: string,
    previousStatus: string,
    abandonType: string,
    matchSnapshots: { matchId: string; status: string; scoreA: unknown; scoreB: unknown }[]
  ): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run('DELETE FROM fencer_abandons WHERE fencer_id = ?', [fencerId]);
    this.sql.run(
      `INSERT INTO fencer_abandons (id, fencer_id, competition_id, previous_status, abandon_type, match_snapshots, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `abandon-${fencerId}-${Date.now()}`,
        fencerId,
        competitionId,
        previousStatus,
        abandonType,
        JSON.stringify(matchSnapshots),
        new Date().toISOString(),
      ]
    );
  }

  public getAbandonSnapshot(fencerId: string): {
    id: string;
    fencerId: string;
    competitionId: string;
    previousStatus: string;
    abandonType: string;
    matchSnapshots: { matchId: string; status: string; scoreA: unknown; scoreB: unknown }[];
    createdAt: string;
  } | null {
    if (!this.sql.db) return null;
    const row = this.sql.queryOne<any>(
      'SELECT * FROM fencer_abandons WHERE fencer_id = ? ORDER BY created_at DESC LIMIT 1',
      [fencerId]
    );
    if (!row) return null;
    let matchSnapshots: { matchId: string; status: string; scoreA: unknown; scoreB: unknown }[] =
      [];
    try {
      matchSnapshots = JSON.parse((row.match_snapshots as string) || '[]');
    } catch (err) {
      console.error('[Database] match_snapshots JSON invalide, ignoré:', err);
    }
    return {
      id: row.id as string,
      fencerId: row.fencer_id as string,
      competitionId: row.competition_id as string,
      previousStatus: row.previous_status as string,
      abandonType: row.abandon_type as string,
      matchSnapshots,
      createdAt: row.created_at as string,
    };
  }

  public deleteAbandonSnapshot(fencerId: string): void {
    if (!this.sql.db) return;
    this.sql.run('DELETE FROM fencer_abandons WHERE fencer_id = ?', [fencerId]);
  }
}
