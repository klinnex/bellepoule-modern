import { v4 as uuidv4 } from 'uuid';
import { Referee, RefereeComment } from '../../shared/types';
import { safeJsonParse } from './dbUtils';
import type { SqlExecutor } from './sqlExecutor';
import { rowToReferee } from './rowMappers';

/** Arbitres, statistiques d'arbitrage et commentaires des formateurs (#1242) */
export class RefereeRepo {
  constructor(private readonly sql: SqlExecutor) {}

  // ─── Referee CRUD ────────────────────────────────────────────────────────────

  public createReferee(
    competitionId: string,
    data: {
      name: string;
      gender?: string;
      nationality?: string;
      club?: string;
      license?: string;
      category?: string;
    }
  ): Referee {
    if (!this.sql.db) throw new Error('Database not open');
    const id = uuidv4();
    const now = new Date().toISOString();
    const refRow = this.sql.queryOne<{ next_ref: number }>(
      'SELECT COALESCE(MAX(ref), 0) + 1 AS next_ref FROM referees WHERE competition_id = ?',
      [competitionId]
    );
    const nextRef = refRow?.next_ref ?? 1;
    this.sql.run(
      `INSERT INTO referees (id, competition_id, ref, name, gender, nationality, club, license, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unavailable', ?, ?)`,
      [
        id,
        competitionId,
        nextRef,
        data.name,
        data.gender ?? null,
        data.nationality ?? 'FRA',
        data.club ?? null,
        data.license ?? null,
        data.category ?? null,
        now,
        now,
      ]
    );
    return {
      id,
      ref: nextRef,
      lastName: data.name?.split(' ').slice(-1)[0] ?? '',
      firstName: data.name?.split(' ').slice(0, -1).join(' ') ?? '',
      gender: data.gender ?? 'M',
      nationality: data.nationality ?? 'FRA',
      club: data.club,
      license: data.license,
      category: data.category,
      status: 'unavailable', // Non pointé par défaut : pointage via l'appel (#1016)
      createdAt: new Date(now),
      updatedAt: new Date(now),
    } as Referee;
  }

  public getReferee(id: string): Referee | null {
    if (!this.sql.db) return null;
    const row = this.sql.queryOne<any>('SELECT * FROM referees WHERE id = ?', [id]);
    return row ? rowToReferee(row) : null;
  }

  public getRefereesByCompetition(competitionId: string): Referee[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<any>('SELECT * FROM referees WHERE competition_id = ? ORDER BY ref ASC', [
        competitionId,
      ])
      .map(row => rowToReferee(row));
  }

  public updateReferee(
    id: string,
    updates: {
      name?: string;
      gender?: string;
      nationality?: string;
      club?: string;
      license?: string;
      category?: string;
      status?: string;
    }
  ): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = {
      name: 'name',
      gender: 'gender',
      nationality: 'nationality',
      club: 'club',
      license: 'license',
      category: 'category',
      status: 'status',
    };
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${col} = ?`);
        values.push((updates as any)[key]);
      }
    }
    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      values.push(now, id);
      this.sql.run(`UPDATE referees SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
  }

  public deleteReferee(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run('DELETE FROM referees WHERE id = ?', [id]);
  }

  public getMatchesWithReferees(competitionId: string): Array<{
    matchId: string;
    matchNumber: number;
    poolName: string | null;
    fencerAName: string;
    fencerBName: string;
    scoreA: number | null;
    scoreB: number | null;
    status: string;
    refereeId: string | null;
    refereeName: string | null;
  }> {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<any>(
        `SELECT m.id AS match_id, m.number AS match_number,
              p.name AS pool_name,
              fa.last_name || ' ' || fa.first_name AS fencer_a_name,
              fb.last_name || ' ' || fb.first_name AS fencer_b_name,
              m.score_a, m.score_b, m.status,
              r.id AS referee_id, r.name AS referee_name
       FROM matches m
       LEFT JOIN pools p ON m.pool_id = p.id
       LEFT JOIN phases ph ON p.phase_id = ph.id
       LEFT JOIN fencers fa ON m.fencer_a_id = fa.id
       LEFT JOIN fencers fb ON m.fencer_b_id = fb.id
       LEFT JOIN referees r ON m.referee_id = r.id
       WHERE ph.competition_id = ? AND m.referee_id IS NOT NULL
       ORDER BY p.name, m.number`,
        [competitionId]
      )
      .map(row => {
        const scoreARaw = safeJsonParse<any>(row.score_a, null, `match ${row.match_id} score_a`);
        const scoreBRaw = safeJsonParse<any>(row.score_b, null, `match ${row.match_id} score_b`);
        return {
          matchId: row.match_id as string,
          matchNumber: row.match_number as number,
          poolName: (row.pool_name as string) ?? null,
          fencerAName: (row.fencer_a_name as string) ?? '?',
          fencerBName: (row.fencer_b_name as string) ?? '?',
          scoreA: scoreARaw?.value ?? null,
          scoreB: scoreBRaw?.value ?? null,
          status: row.status as string,
          refereeId: (row.referee_id as string) ?? null,
          refereeName: (row.referee_name as string) ?? null,
        };
      });
  }

  public getRefereeStats(competitionId: string): Array<{
    refereeId: string;
    refereeName: string;
    matchesCount: number;
    averageDuration: number;
    cardsYellow: number;
    cardsRed: number;
    cardsBlack: number;
  }> {
    if (!this.sql.db) return [];
    const rows = this.sql.queryAll<any>(
      `SELECT r.id AS referee_id, r.name AS referee_name,
              COUNT(*) AS matches_count,
              AVG(CASE WHEN m.status = 'finished' AND m.duration IS NOT NULL THEN m.duration END) AS avg_duration,
              (SELECT COUNT(*) FROM match_cards mc JOIN matches mm ON mc.match_id = mm.id
                WHERE mm.referee_id = r.id AND mc.card_type = 'yellow') AS cards_yellow,
              (SELECT COUNT(*) FROM match_cards mc JOIN matches mm ON mc.match_id = mm.id
                WHERE mm.referee_id = r.id AND mc.card_type = 'red') AS cards_red,
              (SELECT COUNT(*) FROM match_cards mc JOIN matches mm ON mc.match_id = mm.id
                WHERE mm.referee_id = r.id AND mc.card_type = 'black') AS cards_black
       FROM referees r
       JOIN matches m ON m.referee_id = r.id
       JOIN pools p ON m.pool_id = p.id
       JOIN phases ph ON p.phase_id = ph.id
       WHERE ph.competition_id = ? AND r.competition_id = ?
       GROUP BY r.id, r.name
       ORDER BY matches_count DESC`,
      [competitionId, competitionId]
    );
    return rows.map(row => ({
      refereeId: row.referee_id as string,
      refereeName: row.referee_name as string,
      matchesCount: row.matches_count as number,
      averageDuration: (row.avg_duration as number) ?? 0,
      cardsYellow: (row.cards_yellow as number) ?? 0,
      cardsRed: (row.cards_red as number) ?? 0,
      cardsBlack: (row.cards_black as number) ?? 0,
    }));
  }

  // ── Commentaires de formation des arbitres (#989) ──────────────────────────

  public addRefereeComment(
    competitionId: string,
    refereeId: string,
    comment: string,
    author?: string | null,
    matchLabel?: string | null
  ): RefereeComment {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const row: RefereeComment = {
      id: gen(),
      competitionId,
      refereeId,
      author: author || null,
      comment,
      matchLabel: matchLabel || null,
      createdAt: new Date().toISOString(),
    };
    this.sql.run(
      `INSERT INTO referee_comments (id, competition_id, referee_id, author, comment, match_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, competitionId, refereeId, row.author, comment, row.matchLabel, row.createdAt]
    );
    return row;
  }

  /** Commentaires d'une compétition (ou d'un seul arbitre), du plus ancien au plus récent. */
  public getRefereeComments(competitionId: string, refereeId?: string): RefereeComment[] {
    if (!this.sql.db) return [];
    const rows = this.sql.queryAll<any>(
      `SELECT * FROM referee_comments WHERE competition_id = ?${refereeId ? ' AND referee_id = ?' : ''}
       ORDER BY created_at ASC`,
      refereeId ? [competitionId, refereeId] : [competitionId]
    );
    return rows.map(r => ({
      id: r.id,
      competitionId: r.competition_id,
      refereeId: r.referee_id,
      author: r.author ?? null,
      comment: r.comment,
      matchLabel: r.match_label ?? null,
      createdAt: r.created_at,
    }));
  }
}
