import { v4 as uuidv4 } from 'uuid';
import { Competition, Phase, PhaseType } from '../../shared/types';
import { validateCompetitionData } from '../validation';
import type { SqlExecutor } from './sqlExecutor';
import { parseCompetitionRow } from './rowMappers';

/** Compétitions, phases et classement saisonnier Quest (#1242) */
export class CompetitionRepo {
  constructor(private readonly sql: SqlExecutor) {}

  // Competition CRUD
  public createCompetition(comp: Partial<Competition>): Competition {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = comp.id || uuidv4();
    const normalized: Partial<Competition> = {
      ...comp,
      title: comp.title || 'Nouvelle compétition',
      date: comp.date || new Date(now),
      weapon: comp.weapon || ('E' as any),
      gender: comp.gender || ('M' as any),
      category: comp.category || ('SEN' as any),
    };
    validateCompetitionData(normalized);
    this.sql.run(
      `INSERT INTO competitions (id, title, date, weapon, gender, category, location, color, settings, is_team_event, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        comp.title || 'Nouvelle compétition',
        comp.date?.toISOString() || now,
        comp.weapon || 'E',
        comp.gender || 'M',
        comp.category || 'SEN',
        comp.location || '',
        comp.color || '#3B82F6',
        JSON.stringify(comp.settings || {}),
        comp.isTeamEvent ? 1 : 0,
        now,
        now,
      ]
    );
    return this.getCompetition(id)!;
  }

  public getCompetition(id: string): Competition | null {
    if (!this.sql.db) throw new Error('Database not open');
    const row = this.sql.queryOne<any>('SELECT * FROM competitions WHERE id = ?', [id]);
    if (!row) return null;
    return parseCompetitionRow(row);
  }

  public getAllCompetitions(): Competition[] {
    if (!this.sql.db) throw new Error('Database not open');
    const rows = this.sql.queryAll<any>('SELECT * FROM competitions ORDER BY date DESC');
    return rows.map(r => parseCompetitionRow(r));
  }

  public deleteCompetition(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      this.sql.run(
        `DELETE FROM pool_signatures WHERE pool_id IN (
           SELECT p.id FROM pools p JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id = ?
         )`,
        [id]
      );
      this.sql.run('DELETE FROM fencers WHERE competition_id = ?', [id]);
      this.sql.run('DELETE FROM competitions WHERE id = ?', [id]);
    });
  }

  public updateCompetition(id: string, updates: Partial<Competition>): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    this.sql.transaction(() => {
      if (updates.title !== undefined)
        this.sql.run('UPDATE competitions SET title = ?, updated_at = ? WHERE id = ?', [
          updates.title,
          now,
          id,
        ]);
      if (updates.date !== undefined)
        this.sql.run('UPDATE competitions SET date = ?, updated_at = ? WHERE id = ?', [
          updates.date.toISOString(),
          now,
          id,
        ]);
      if (updates.location !== undefined)
        this.sql.run('UPDATE competitions SET location = ?, updated_at = ? WHERE id = ?', [
          updates.location,
          now,
          id,
        ]);
      if (updates.organizer !== undefined)
        this.sql.run('UPDATE competitions SET organizer = ?, updated_at = ? WHERE id = ?', [
          updates.organizer,
          now,
          id,
        ]);
      if (updates.weapon !== undefined)
        this.sql.run('UPDATE competitions SET weapon = ?, updated_at = ? WHERE id = ?', [
          updates.weapon,
          now,
          id,
        ]);
      if (updates.gender !== undefined)
        this.sql.run('UPDATE competitions SET gender = ?, updated_at = ? WHERE id = ?', [
          updates.gender,
          now,
          id,
        ]);
      if (updates.category !== undefined)
        this.sql.run('UPDATE competitions SET category = ?, updated_at = ? WHERE id = ?', [
          updates.category,
          now,
          id,
        ]);
      if (updates.isTeamEvent !== undefined)
        this.sql.run('UPDATE competitions SET is_team_event = ?, updated_at = ? WHERE id = ?', [
          updates.isTeamEvent ? 1 : 0,
          now,
          id,
        ]);
      if (updates.status !== undefined)
        this.sql.run('UPDATE competitions SET status = ?, updated_at = ? WHERE id = ?', [
          updates.status,
          now,
          id,
        ]);
      if (updates.settings !== undefined)
        this.sql.run('UPDATE competitions SET settings = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify(updates.settings),
          now,
          id,
        ]);
    });
  }

  // ─── Phase CRUD ─────────────────────────────────────────────────────────────

  public createPhase(competitionId: string, type: string, order: number, name: string): Phase {
    if (!this.sql.db) throw new Error('Database not open');
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO phases (id, competition_id, name, type, order_index, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, competitionId, name, type, order, now, now]
    );
    return {
      id,
      competitionId,
      type: type as PhaseType,
      order,
      name,
      isComplete: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    } as Phase;
  }

  public getPhase(id: string): Phase | null {
    if (!this.sql.db) return null;
    const row = this.sql.queryOne<any>('SELECT * FROM phases WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id as string,
      competitionId: row.competition_id as string,
      type: row.type as PhaseType,
      order: row.order_index as number,
      name: row.name as string,
      isComplete: row.status === 'complete',
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    } as Phase;
  }

  public getPhasesByCompetition(competitionId: string): Phase[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<any>('SELECT * FROM phases WHERE competition_id = ? ORDER BY order_index ASC', [
        competitionId,
      ])
      .map(
        row =>
          ({
            id: row.id as string,
            competitionId: row.competition_id as string,
            type: row.type as PhaseType,
            order: row.order_index as number,
            name: row.name as string,
            isComplete: row.status === 'complete',
            createdAt: new Date(row.created_at as string),
            updatedAt: new Date(row.updated_at as string),
          }) as Phase
      );
  }

  public updatePhase(id: string, updates: { name?: string; isComplete?: boolean }): void {
    if (!this.sql.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.isComplete !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.isComplete ? 'complete' : 'pending');
    }
    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      values.push(now, id);
      this.sql.run(`UPDATE phases SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
  }

  public deletePhase(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      this.sql.run(
        'DELETE FROM pool_signatures WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)',
        [id]
      );
      this.sql.run(
        'DELETE FROM matches WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)',
        [id]
      );
      this.sql.run(
        'DELETE FROM pool_fencers WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)',
        [id]
      );
      this.sql.run('DELETE FROM pools WHERE phase_id = ?', [id]);
      this.sql.run('DELETE FROM phases WHERE id = ?', [id]);
    });
  }

  // ─── Classement saisonnier Quest ────────────────────────────────────────────

  public addCompetitionToSeason(payload: {
    competitionId: string;
    competitionTitle: string;
    competitionDate: string;
    entries: Array<{
      fencerId: string;
      fencerLastName: string;
      fencerFirstName: string;
      fencerClub?: string;
      victories: number;
      matchesPlayed: number;
      questPoints: number;
      questV4: number;
      questV3: number;
      questV2: number;
      questV1: number;
      touchesScored: number;
      touchesReceived: number;
      redCards: number;
      compRank: number;
    }>;
  }): void {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: uuidv4gen } = require('uuid');
    const now = new Date().toISOString();
    this.sql.run('DELETE FROM season_results WHERE competition_id = ?', [payload.competitionId]);
    for (const e of payload.entries) {
      this.sql.run(
        `INSERT INTO season_results
           (id, competition_id, competition_title, competition_date,
            fencer_id, fencer_last_name, fencer_first_name, fencer_club,
            victories, matches_played, quest_points,
            quest_v4, quest_v3, quest_v2, quest_v1,
            touches_scored, touches_received, red_cards, comp_rank, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4gen(),
          payload.competitionId,
          payload.competitionTitle,
          payload.competitionDate,
          e.fencerId,
          e.fencerLastName,
          e.fencerFirstName,
          e.fencerClub ?? null,
          e.victories,
          e.matchesPlayed,
          e.questPoints,
          e.questV4,
          e.questV3,
          e.questV2,
          e.questV1,
          e.touchesScored,
          e.touchesReceived,
          e.redCards,
          e.compRank,
          now,
        ]
      );
    }
  }

  public getSeasonRanking(): Array<{
    fencerId: string;
    fencerLastName: string;
    fencerFirstName: string;
    fencerClub: string | null;
    totalVictories: number;
    totalMatchesPlayed: number;
    totalQuestPoints: number;
    totalQuestV4: number;
    totalQuestV3: number;
    totalQuestV2: number;
    totalQuestV1: number;
    totalTouchesScored: number;
    totalTouchesReceived: number;
    totalRedCards: number;
    competitionCount: number;
    ratio: number;
  }> {
    if (!this.sql.db) return [];
    const rows = this.sql.queryAll<any>(
      `SELECT
         fencer_id, fencer_last_name, fencer_first_name, fencer_club,
         SUM(victories)        AS total_victories,
         SUM(matches_played)   AS total_matches_played,
         SUM(quest_points)     AS total_quest_points,
         SUM(quest_v4)         AS total_quest_v4,
         SUM(quest_v3)         AS total_quest_v3,
         SUM(quest_v2)         AS total_quest_v2,
         SUM(quest_v1)         AS total_quest_v1,
         SUM(touches_scored)   AS total_touches_scored,
         SUM(touches_received) AS total_touches_received,
         SUM(red_cards)        AS total_red_cards,
         COUNT(DISTINCT competition_id) AS competition_count
       FROM season_results
       GROUP BY fencer_id
       ORDER BY
         CAST(SUM(victories) AS REAL) / MAX(SUM(matches_played), 1) DESC,
         SUM(quest_points) DESC,
         SUM(quest_v4) DESC,
         SUM(quest_v3) DESC,
         SUM(quest_v2) DESC,
         SUM(quest_v1) DESC,
         (SUM(touches_scored) - SUM(touches_received)) DESC`,
      []
    );
    return rows.map(r => ({
      fencerId: r.fencer_id as string,
      fencerLastName: r.fencer_last_name as string,
      fencerFirstName: r.fencer_first_name as string,
      fencerClub: (r.fencer_club as string) ?? null,
      totalVictories: Number(r.total_victories),
      totalMatchesPlayed: Number(r.total_matches_played),
      totalQuestPoints: Number(r.total_quest_points),
      totalQuestV4: Number(r.total_quest_v4),
      totalQuestV3: Number(r.total_quest_v3),
      totalQuestV2: Number(r.total_quest_v2),
      totalQuestV1: Number(r.total_quest_v1),
      totalTouchesScored: Number(r.total_touches_scored),
      totalTouchesReceived: Number(r.total_touches_received),
      totalRedCards: Number(r.total_red_cards),
      competitionCount: Number(r.competition_count),
      ratio:
        Number(r.total_matches_played) > 0
          ? Number(r.total_victories) / Number(r.total_matches_played)
          : 0,
    }));
  }

  public getSeasonCompetitions(): Array<{
    competitionId: string;
    competitionTitle: string;
    competitionDate: string;
    fencerCount: number;
    addedAt: string;
  }> {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<any>(
        `SELECT competition_id, competition_title, competition_date,
              COUNT(fencer_id) AS fencer_count, MAX(added_at) AS added_at
       FROM season_results
       GROUP BY competition_id
       ORDER BY competition_date DESC`,
        []
      )
      .map(r => ({
        competitionId: r.competition_id as string,
        competitionTitle: r.competition_title as string,
        competitionDate: r.competition_date as string,
        fencerCount: Number(r.fencer_count),
        addedAt: r.added_at as string,
      }));
  }

  public removeCompetitionFromSeason(competitionId: string): void {
    if (!this.sql.db) return;
    this.sql.run('DELETE FROM season_results WHERE competition_id = ?', [competitionId]);
  }

  public resetSeason(): void {
    if (!this.sql.db) return;
    this.sql.run('DELETE FROM season_results', []);
  }
}
