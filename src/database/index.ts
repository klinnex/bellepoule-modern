/**
 * BellePoule Modern - Database Layer (better-sqlite3)
 * Native SQLite binding — synchronous, 10-50× faster than sql.js at startup.
 * Licensed under GPL-3.0
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  Competition,
  CompetitionSettings,
  Fencer,
  FencerStatus,
  Gender,
  Weapon,
  Category,
  Pool,
  Match,
  MatchStatus,
  Phase,
  PhaseType,
  Referee,
  MatchEventEntry,
  MatchEventType,
} from '../shared/types';
import { validateId, validateSessionState, sanitizeId, validateCompetitionData } from './validation';
import { logger, LogCategory } from '../shared/services/logger';
import { MigrationManager } from './migrations';
import { ALL_MIGRATIONS } from './migrations/migrations';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  // Cache des prepared statements : évite de re-parser le SQL à chaque appel.
  // SQLite re-prépare automatiquement un statement si le schéma change.
  private stmtCache = new Map<string, Database.Statement>();

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'bellepoule.db');
  }

  public setPath(dbPath: string): void {
    this.dbPath = dbPath;
  }

  public async open(dbPath?: string): Promise<void> {
    if (dbPath) this.dbPath = dbPath;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.stmtCache.clear();
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  public close(): void {
    if (this.db) {
      this.saveSync();
      this.db.close();
      this.db = null;
      this.stmtCache.clear();
    }
  }

  private prepare(sql: string): Database.Statement {
    let stmt = this.stmtCache.get(sql);
    if (!stmt) {
      stmt = this.db!.prepare(sql);
      this.stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  private run(sql: string, params: unknown[] = []): Database.RunResult {
    return this.prepare(sql).run(...params);
  }

  private queryOne<T>(sql: string, params: unknown[] = []): T | null {
    return (this.prepare(sql).get(...params) as T) ?? null;
  }

  private queryAll<T>(sql: string, params: unknown[] = []): T[] {
    return this.prepare(sql).all(...params) as T[];
  }

  // Toute mutation multi-statements doit passer ici : rollback automatique si une étape échoue.
  private inTransaction<T>(fn: () => T): T {
    return this.db!.transaction(fn)();
  }

  // Writes go directly to WAL on every statement — no manual export needed.
  public saveSync(): void {
    if (!this.db) return;
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /* ignore checkpoint errors at shutdown */
    }
  }

  public async saveAsync(): Promise<void> {
    if (!this.db) return;
    try {
      this.db.pragma('wal_checkpoint(PASSIVE)');
    } catch {
      /* ignore */
    }
  }

  public forceSave(): void {
    this.saveSync();
  }

  public getPath(): string {
    return this.dbPath;
  }

  public isOpen(): boolean {
    return this.db !== null;
  }

  private runMigrations(): number {
    if (!this.db) throw new Error('Database not open');
    return new MigrationManager(this.db).run(ALL_MIGRATIONS);
  }

  // Session State Management
  public saveSessionState(competitionId: string, state: any): void {
    if (!this.db) throw new Error('Database not open');
    validateId(competitionId, 'competitionId');
    validateSessionState(state);
    const now = new Date().toISOString();
    this.run(
      `INSERT OR REPLACE INTO session_state (competition_id, state_json, updated_at) VALUES (?, ?, ?)`,
      [sanitizeId(competitionId), JSON.stringify(state), now]
    );
  }

  public getSessionState(competitionId: string): any | null {
    if (!this.db) throw new Error('Database not open');
    validateId(competitionId, 'competitionId');
    const row = this.queryOne<{ state_json: string }>(
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
    if (!this.db) throw new Error('Database not open');
    validateId(competitionId, 'competitionId');
    this.run('DELETE FROM session_state WHERE competition_id = ?', [sanitizeId(competitionId)]);
  }

  // Competition CRUD
  public createCompetition(comp: Partial<Competition>): Competition {
    if (!this.db) throw new Error('Database not open');
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
    this.run(
      `INSERT INTO competitions (id, title, date, weapon, gender, category, location, color, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        now,
        now,
      ]
    );
    return this.getCompetition(id)!;
  }

  public getCompetition(id: string): Competition | null {
    if (!this.db) throw new Error('Database not open');
    const row = this.queryOne<any>('SELECT * FROM competitions WHERE id = ?', [id]);
    if (!row) return null;
    return this.parseCompetitionRow(row);
  }

  private parseCompetitionRow(row: any): Competition {
    try {
      let settings: CompetitionSettings = {
        defaultPoolMaxScore: 5,
        defaultTableMaxScore: 21,
        defaultPoolTimerSeconds: 180,
        defaultTableTimerSeconds: 180,
        poolRounds: 1,
        hasDirectElimination: true,
        thirdPlaceMatch: true,
        signTableauMatches: false,
        manualRanking: false,
        defaultRanking: 0,
        randomScore: false,
        minTeamSize: 3,
      };
      if (row.settings) {
        try {
          settings = JSON.parse(row.settings as string);
        } catch (e) {
          console.error('DB: Failed to parse settings JSON:', e);
        }
      }
      return {
        id: row.id as string,
        title: row.title as string,
        shortTitle: row.short_title as string,
        date: row.date ? new Date(row.date as string) : new Date(),
        location: row.location as string,
        organizer: row.organizer as string,
        weapon: row.weapon as Weapon,
        gender: row.gender as Gender,
        category: row.category as Category,
        championship: row.championship as string,
        color: row.color as string,
        currentPhaseIndex: row.current_phase_index as number,
        isTeamEvent: row.is_team_event === 1,
        status: row.status as any,
        settings,
        fencers: [],
        referees: [],
        phases: [],
        createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
      };
    } catch (error) {
      console.error('DB: Error parsing competition data:', error);
      throw error;
    }
  }

  public getAllCompetitions(): Competition[] {
    if (!this.db) throw new Error('Database not open');
    const rows = this.queryAll<any>('SELECT * FROM competitions ORDER BY date DESC');
    return rows.map(r => this.parseCompetitionRow(r));
  }

  public deleteCompetition(id: string): void {
    if (!this.db) throw new Error('Database not open');
    this.inTransaction(() => {
      this.run(
        `DELETE FROM pool_signatures WHERE pool_id IN (
           SELECT p.id FROM pools p JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id = ?
         )`,
        [id]
      );
      this.run('DELETE FROM fencers WHERE competition_id = ?', [id]);
      this.run('DELETE FROM competitions WHERE id = ?', [id]);
    });
  }

  public updateCompetition(id: string, updates: Partial<Competition>): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    this.inTransaction(() => {
      if (updates.title !== undefined)
        this.run('UPDATE competitions SET title = ?, updated_at = ? WHERE id = ?', [updates.title, now, id]);
      if (updates.date !== undefined)
        this.run('UPDATE competitions SET date = ?, updated_at = ? WHERE id = ?', [updates.date.toISOString(), now, id]);
      if (updates.location !== undefined)
        this.run('UPDATE competitions SET location = ?, updated_at = ? WHERE id = ?', [updates.location, now, id]);
      if (updates.organizer !== undefined)
        this.run('UPDATE competitions SET organizer = ?, updated_at = ? WHERE id = ?', [updates.organizer, now, id]);
      if (updates.weapon !== undefined)
        this.run('UPDATE competitions SET weapon = ?, updated_at = ? WHERE id = ?', [updates.weapon, now, id]);
      if (updates.gender !== undefined)
        this.run('UPDATE competitions SET gender = ?, updated_at = ? WHERE id = ?', [updates.gender, now, id]);
      if (updates.category !== undefined)
        this.run('UPDATE competitions SET category = ?, updated_at = ? WHERE id = ?', [updates.category, now, id]);
      if (updates.status !== undefined)
        this.run('UPDATE competitions SET status = ?, updated_at = ? WHERE id = ?', [updates.status, now, id]);
      if (updates.settings !== undefined)
        this.run('UPDATE competitions SET settings = ?, updated_at = ? WHERE id = ?', [JSON.stringify(updates.settings), now, id]);
    });
  }

  // Fencer CRUD
  public addFencer(competitionId: string, fencer: Partial<Fencer>): Fencer {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = fencer.id || uuidv4();
    const maxRow = this.queryOne<{ m: number | null }>(
      'SELECT MAX(ref) as m FROM fencers WHERE competition_id = ?',
      [competitionId]
    );
    const maxRef = maxRow?.m ?? 0;
    const ref = fencer.ref || maxRef + 1;
    try {
      this.run(
        `INSERT INTO fencers (id, competition_id, ref, last_name, first_name, birth_date, gender, nationality, club, region, license, ranking, status, photo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, competitionId, ref,
          fencer.lastName || '', fencer.firstName || '',
          fencer.birthDate ? fencer.birthDate.toISOString() : null,
          fencer.gender || 'M', fencer.nationality || 'FRA',
          fencer.club || null, fencer.region || null, fencer.license || null,
          fencer.ranking || null, fencer.status || 'N', fencer.photo || null,
          now, now,
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

  private parseFencerRow(row: any): Fencer {
    let poolStats = undefined;
    if (row.pool_stats) {
      try {
        poolStats = JSON.parse(row.pool_stats as string);
      } catch {
        console.error('DB: Failed to parse pool_stats JSON for fencer', row.id);
      }
    }
    return {
      id: row.id as string,
      ref: row.ref as number,
      lastName: row.last_name as string,
      firstName: row.first_name as string,
      birthDate: row.birth_date ? new Date(row.birth_date as string) : undefined,
      gender: row.gender as Gender,
      nationality: row.nationality as string,
      region: row.region as string,
      club: row.club as string,
      license: row.license as string,
      ranking: row.ranking as number,
      status: row.status as FencerStatus,
      seedNumber: row.seed_number as number,
      finalRanking: row.final_ranking as number,
      poolStats,
      photo: (row.photo as string) || undefined,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    };
  }

  public getFencer(id: string): Fencer | null {
    if (!this.db) throw new Error('Database not open');
    const row = this.queryOne<any>('SELECT * FROM fencers WHERE id = ?', [id]);
    if (!row) return null;
    try {
      return this.parseFencerRow(row);
    } catch (error) {
      console.error('DB: Error parsing fencer data:', error);
      throw error;
    }
  }

  public getFencersByCompetition(competitionId: string): Fencer[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>('SELECT * FROM fencers WHERE competition_id = ? ORDER BY ref', [competitionId])
      .map(row => this.parseFencerRow(row));
  }

  public getFencerPhotos(
    competitionId: string
  ): { id: string; license: string | null; lastName: string; firstName: string; photo: string }[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>(
      'SELECT id, license, last_name, first_name, photo FROM fencers WHERE competition_id = ? AND photo IS NOT NULL',
      [competitionId]
    ).map(row => ({
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
    if (!this.db) throw new Error('Database not open');
    let matched = 0;
    const now = new Date().toISOString();
    const selectStmt = this.db.prepare(
      'SELECT id FROM fencers WHERE competition_id = ? AND license = ? LIMIT 1'
    );
    const updateStmt = this.db.prepare(
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
    if (!this.db) throw new Error('Database not open');
    let added = 0;
    let updated = 0;
    for (const fencer of fencers) {
      let existing: Fencer | null = null;
      const key = fencer.license?.trim();
      if (key) {
        const row = this.queryOne<{ id: string }>(
          'SELECT id FROM fencers WHERE competition_id = ? AND license = ? LIMIT 1',
          [competitionId, key]
        );
        if (row) existing = this.getFencer(row.id);
      }
      if (!existing && fencer.lastName && fencer.firstName) {
        const row = this.queryOne<{ id: string }>(
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
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = {
      lastName: 'last_name', firstName: 'first_name', gender: 'gender',
      nationality: 'nationality', club: 'club', region: 'region',
      license: 'license', ranking: 'ranking', status: 'status',
      photo: 'photo', seedNumber: 'seed_number', finalRanking: 'final_ranking',
    };
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${col} = ?`);
        values.push((updates as Record<string, unknown>)[key] ?? null);
      }
    }
    if (updates.poolStats !== undefined) {
      setClauses.push('pool_stats = ?');
      values.push(updates.poolStats ? JSON.stringify(updates.poolStats) : null);
    }
    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      values.push(now, id);
      this.run(`UPDATE fencers SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
  }

  public deleteFencer(id: string): void {
    if (!this.db) throw new Error('Database not open');
    const exists = this.queryOne<{ id: string }>('SELECT id, last_name FROM fencers WHERE id = ?', [id]);
    if (!exists) throw new Error(`Tireur avec l'ID ${id} non trouvé`);
    try {
      this.inTransaction(() => {
        this.run('DELETE FROM pool_fencers WHERE fencer_id = ?', [id]);
        this.run('DELETE FROM matches WHERE fencer_a_id = ? OR fencer_b_id = ?', [id, id]);
        const result = this.run('DELETE FROM fencers WHERE id = ?', [id]);
        if (result.changes === 0) throw new Error(`Échec de la suppression du tireur ${id}`);
      });
    } catch (error) {
      console.error('Erreur lors de la suppression du tireur:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur de base de données lors de la suppression du tireur: ${errorMessage}`);
    }
  }

  public deleteAllFencers(competitionId?: string): void {
    if (!this.db) throw new Error('Database not open');
    try {
      this.inTransaction(() => {
        if (competitionId) {
          this.run(
            `DELETE FROM pool_fencers WHERE fencer_id IN (SELECT id FROM fencers WHERE competition_id = ?)`,
            [competitionId]
          );
          this.run(
            `DELETE FROM matches WHERE fencer_a_id IN (SELECT id FROM fencers WHERE competition_id = ?) OR fencer_b_id IN (SELECT id FROM fencers WHERE competition_id = ?)`,
            [competitionId, competitionId]
          );
          this.run('DELETE FROM fencers WHERE competition_id = ?', [competitionId]);
        } else {
          this.run('DELETE FROM pool_fencers');
          this.run('DELETE FROM matches');
          this.run('DELETE FROM fencers');
        }
      });
    } catch (error) {
      console.error('Erreur lors de la suppression des tireurs:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur de base de données lors de la suppression des tireurs: ${errorMessage}`);
    }
  }

  // Match CRUD
  public createMatch(match: Partial<Match>, poolId?: string): Match {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = match.id || uuidv4();
    this.run(
      `INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, match.number || 1, poolId || null,
        match.fencerA?.id || (match as any).fencerAId || null,
        match.fencerB?.id || (match as any).fencerBId || null,
        match.maxScore || 5, 'not_started', now, now,
      ]
    );
    return this.getMatch(id)!;
  }

  public upsertMultipleTableauMatches(
    competitionId: string,
    matches: Array<{
      matchId: string; round: number; position: number;
      fencerAId?: string | null; fencerBId?: string | null;
      scoreA?: any | null; scoreB?: any | null;
      status?: string; maxScore?: number; isBye?: boolean;
    }>
  ): void {
    if (!this.db) throw new Error('Database not open');
    if (matches.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
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
    const insertMany = this.db.transaction((rows: typeof matches) => {
      for (const m of rows) {
        const dbId = `${competitionId}-${m.matchId}`;
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
    competitionId: string; matchId: string;
    round: number; position: number;
    fencerAId?: string | null; fencerBId?: string | null;
    scoreA?: any | null; scoreB?: any | null;
    status?: string; maxScore?: number; isBye?: boolean;
  }): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const dbId = `${params.competitionId}-${params.matchId}`;
    const status = params.status ?? 'not_started';
    if (!this.getMatch(dbId)) {
      this.run(
        `INSERT INTO matches (id, number, table_id, fencer_a_id, fencer_b_id, max_score, status, round, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dbId, parseInt(params.matchId.replace('-', '')) || 0, params.competitionId,
          params.fencerAId ?? null, params.fencerBId ?? null,
          params.maxScore ?? 15, status, params.round, params.position, now, now,
        ]
      );
    } else {
      this.run(
        `UPDATE matches SET fencer_a_id=?, fencer_b_id=?, score_a=?, score_b=?, status=?, round=?, position=?, updated_at=? WHERE id=?`,
        [
          params.fencerAId ?? null, params.fencerBId ?? null,
          params.scoreA != null ? JSON.stringify(params.scoreA) : null,
          params.scoreB != null ? JSON.stringify(params.scoreB) : null,
          status, params.round, params.position, now, dbId,
        ]
      );
    }
  }

  public getTableauMatchesForExport(competitionId: string): Array<{
    id: string; round: number; position: number; isBye: boolean;
    fencerA: { id: string; firstName?: string; lastName: string; club?: string } | null;
    fencerB: { id: string; firstName?: string; lastName: string; club?: string } | null;
    scoreA: number | null; scoreB: number | null;
    winner: { id: string } | null;
  }> {
    if (!this.db) throw new Error('Database not open');
    const rows = this.queryAll<any>(
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
      } catch { /* skip bad score JSON */ }
      return {
        id: row.id as string,
        round: row.round as number,
        position: row.position as number,
        isBye: (!!row.fencer_a_id) !== (!!row.fencer_b_id),
        fencerA: row.fencer_a_id ? { id: row.fencer_a_id as string, firstName: row.fa_first as string | undefined, lastName: (row.fa_last as string) || '', club: row.fa_club as string | undefined } : null,
        fencerB: row.fencer_b_id ? { id: row.fencer_b_id as string, firstName: row.fb_first as string | undefined, lastName: (row.fb_last as string) || '', club: row.fb_club as string | undefined } : null,
        scoreA: scoreAVal, scoreB: scoreBVal, winner,
      };
    });
  }

  // Corrige un statut de match incohérent au chargement.
  // - 2 scores présents → FINISHED (le match a été joué)
  // - in_progress sans aucun score → NOT_STARTED (tablette/strip fermé avant toute saisie ;
  //   évite que les premiers matchs réapparaissent « en cours » au redémarrage)
  private healMatchStatus(rawStatus: MatchStatus, scoreA: unknown, scoreB: unknown): MatchStatus {
    if (scoreA !== null && scoreB !== null && rawStatus !== MatchStatus.FINISHED) {
      return MatchStatus.FINISHED;
    }
    if (rawStatus === MatchStatus.IN_PROGRESS && scoreA === null && scoreB === null) {
      return MatchStatus.NOT_STARTED;
    }
    return rawStatus;
  }

  public getMatch(id: string): Match | null {
    if (!this.db) throw new Error('Database not open');
    const row = this.queryOne<any>('SELECT * FROM matches WHERE id = ?', [id]);
    if (!row) return null;
    const scoreA = row.score_a ? JSON.parse(row.score_a as string) : null;
    const scoreB = row.score_b ? JSON.parse(row.score_b as string) : null;
    const status = this.healMatchStatus(row.status as MatchStatus, scoreA, scoreB);
    return {
      id: row.id as string,
      number: row.number as number,
      fencerA: row.fencer_a_id ? this.getFencer(row.fencer_a_id as string) : null,
      fencerB: row.fencer_b_id ? this.getFencer(row.fencer_b_id as string) : null,
      scoreA,
      scoreB,
      maxScore: row.max_score as number,
      status,
      poolId: row.pool_id as string,
      tableId: row.table_id as string,
      round: row.round as number,
      referee: row.referee_id ? (this.getReferee(row.referee_id as string) ?? undefined) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  public getPoolFencers(poolId: string): Fencer[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>(
      'SELECT f.* FROM fencers f INNER JOIN pool_fencers pf ON f.id = pf.fencer_id WHERE pf.pool_id = ? ORDER BY pf.position',
      [poolId]
    ).map(row => this.parseFencerRow(row));
  }

  public getMatchesByPool(poolId: string): Match[] {
    if (!this.db) throw new Error('Database not open');
    const matchRows = this.queryAll<any>('SELECT * FROM matches WHERE pool_id = ? ORDER BY number', [poolId]);
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
      this.queryAll<any>(`SELECT * FROM fencers WHERE id IN (${placeholders})`, Array.from(fencerIds))
        .forEach(fRow => fencersById.set(fRow.id as string, this.parseFencerRow(fRow)));
    }

    const refereeIds = new Set<string>();
    for (const row of matchRows) {
      if (row.referee_id) refereeIds.add(row.referee_id as string);
    }
    const refereesById = new Map<string, Referee>();
    if (refereeIds.size > 0) {
      const placeholders = Array.from({ length: refereeIds.size }, () => '?').join(',');
      this.queryAll<any>(`SELECT * FROM referees WHERE id IN (${placeholders})`, Array.from(refereeIds))
        .forEach(rRow => refereesById.set(rRow.id as string, this.rowToReferee(rRow)));
    }

    return matchRows.map(row => {
      const scoreA = row.score_a ? JSON.parse(row.score_a as string) : null;
      const scoreB = row.score_b ? JSON.parse(row.score_b as string) : null;
      const status = this.healMatchStatus(row.status as MatchStatus, scoreA, scoreB);
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
      referee: row.referee_id ? (refereesById.get(row.referee_id as string) ?? undefined) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      };
    });
  }

  public getCompetitionPools(competitionId: string): { id: string; name: string }[] {
    if (!this.db) throw new Error('Database not open');
    try {
      const pools = this.queryAll<{ id: string; number: number }>(
        'SELECT DISTINCT p.id, p.number FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ? ORDER BY p.number',
        [competitionId]
      );
      if (pools.length > 0) return pools.map(p => ({ id: p.id, name: 'Poule ' + p.number }));
    } catch (e) {
      console.warn('[Database] Error getting pools:', e);
    }
    try {
      return this.queryAll<{ id: string; number: number }>(
        'SELECT p.id, p.number FROM pools p INNER JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id = ? ORDER BY p.number',
        [competitionId]
      ).map(p => ({ id: p.id, name: 'Poule ' + p.number }));
    } catch (e) {
      console.warn('[Database] Error getting pools via phases:', e);
    }
    return [];
  }

  public getPendingMatches(competitionId: string): Match[] {
    if (!this.db) throw new Error('Database not open');
    let poolIds: string[] = [];
    try {
      poolIds = this.queryAll<{ id: string }>(
        'SELECT id FROM pools WHERE phase_id IN (SELECT id FROM phases WHERE competition_id = ?) ORDER BY number',
        [competitionId]
      ).map(r => r.id);
    } catch (e) {
      console.warn('[Database] Falling back to pool_fencers approach for getPendingMatches:', e);
    }
    if (poolIds.length === 0) {
      try {
        poolIds = this.queryAll<{ id: string }>(
          `SELECT DISTINCT p.id FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ?`,
          [competitionId]
        ).map(r => r.id);
      } catch (e) {
        console.warn('[Database] Alternative approach also failed:', e);
      }
    }
    if (poolIds.length === 0) return [];
    const placeholders = poolIds.map(() => '?').join(',');
    const matchRows = this.queryAll<any>(
      `SELECT m.* FROM matches m JOIN pools p ON m.pool_id = p.id WHERE m.pool_id IN (${placeholders}) AND m.status IN ('not_started', 'in_progress') ORDER BY p.number, m.number`,
      poolIds
    );
    return this.hydrateMatchRows(matchRows);
  }

  public getAllPendingMatchesFromPools(competitionId: string): Match[] {
    if (!this.db) throw new Error('Database not open');
    let poolIds: string[] = [];
    try {
      poolIds = this.queryAll<{ id: string }>(
        `SELECT DISTINCT p.id FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ? ORDER BY p.number`,
        [competitionId]
      ).map(r => r.id);
    } catch (e) {
      console.warn('[Database] Error getting pools via pool_fencers:', e);
      return [];
    }
    if (poolIds.length === 0) return [];
    const placeholders = poolIds.map(() => '?').join(',');
    const matchRows = this.queryAll<any>(
      `SELECT m.* FROM matches m JOIN pools p ON m.pool_id = p.id WHERE m.pool_id IN (${placeholders}) AND m.status IN ('not_started', 'in_progress') ORDER BY p.number, m.number`,
      poolIds
    );
    return this.hydrateMatchRows(matchRows);
  }

  public getPendingMatchesDirectly(competitionId: string): Match[] {
    if (!this.db) throw new Error('Database not open');
    try {
      const matchRows = this.queryAll<any>(
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
        this.queryAll<{ id: string }>('SELECT id FROM fencers WHERE competition_id = ?', [competitionId]).map(
          r => r.id
        )
      );
      const matchRows = this.queryAll<any>(
        'SELECT * FROM matches WHERE status IN (?, ?)',
        ['not_started', 'in_progress']
      );
      return this.hydrateMatchRows(matchRows).filter(m => {
        if (!m.fencerA || !m.fencerB) return false;
        return compFencers.has(m.fencerA.id) || compFencers.has(m.fencerB.id);
      });
    } catch (e) {
      console.error('[Database] getPendingMatchesDirectly: Fallback error:', e);
    }
    return [];
  }

  public getPoolCount(competitionId: string): number {
    if (!this.db) throw new Error('Database not open');
    try {
      const row = this.queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT p.id) as count FROM pools p INNER JOIN pool_fencers pf ON p.id = pf.pool_id INNER JOIN fencers f ON pf.fencer_id = f.id WHERE f.competition_id = ?`,
        [competitionId]
      );
      if (row && row.count > 0) return row.count;
    } catch (e) {
      console.warn('[Database] Error getting pool count:', e);
    }
    try {
      const row = this.queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT p.id) as count FROM pools p INNER JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id = ?`,
        [competitionId]
      );
      return row?.count ?? 0;
    } catch (e) {
      console.warn('[Database] Error getting pool count via phases:', e);
    }
    return 0;
  }

  public updateMatch(id: string, updates: Partial<Match> & { refereeId?: string }): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const params: unknown[] = [];
    if (updates.scoreA !== undefined) { setClauses.push('score_a = ?'); params.push(JSON.stringify(updates.scoreA)); }
    if (updates.scoreB !== undefined) { setClauses.push('score_b = ?'); params.push(JSON.stringify(updates.scoreB)); }
    if (updates.status !== undefined) { setClauses.push('status = ?'); params.push(updates.status); }
    if (updates.refereeId !== undefined) { setClauses.push('referee_id = ?'); params.push(updates.refereeId); }
    if (setClauses.length === 0) return;
    setClauses.push('updated_at = ?');
    params.push(now, id);
    this.run(`UPDATE matches SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }

  public updatePool(pool: Pool): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    this.run('UPDATE pools SET updated_at = ?, is_complete = ?, strip = ? WHERE id = ?', [now, pool.isComplete ? 1 : 0, pool.strip ?? null, pool.id]);
    for (const match of pool.matches || []) {
      if (match.scoreA !== undefined || match.scoreB !== undefined || match.status !== undefined) {
        this.updateMatch(match.id, { scoreA: match.scoreA, scoreB: match.scoreB, status: match.status });
      }
    }
  }

  public updatePoolReferee(poolId: string, refereeId: string | null): void {
    if (!this.db) throw new Error('Database not open');
    this.run('UPDATE pools SET referee_id = ?, updated_at = ? WHERE id = ?', [refereeId, new Date().toISOString(), poolId]);
  }

  // ─── Pool CRUD ──────────────────────────────────────────────────────────────

  public clearPoolsForPhase(phaseId: string): void {
    if (!this.db) throw new Error('Database not open');
    this.inTransaction(() => {
      this.run('DELETE FROM pool_signatures WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)', [phaseId]);
      this.run('DELETE FROM matches WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)', [phaseId]);
      this.run('DELETE FROM pool_fencers WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)', [phaseId]);
      this.run('DELETE FROM pools WHERE phase_id = ?', [phaseId]);
    });
  }

  public createPool(phaseId: string, number: number, poolId?: string): Pool {
    if (!this.db) throw new Error('Database not open');
    const id = poolId || uuidv4();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO pools (id, phase_id, number, is_complete, has_error, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)`,
      [id, phaseId, number, now, now]
    );
    return { id, phaseId, number, fencers: [], matches: [], isComplete: false, hasError: false, createdAt: new Date(now), updatedAt: new Date(now) } as unknown as Pool;
  }

  public addFencerToPool(poolId: string, fencerId: string, position: number): void {
    if (!this.db) throw new Error('Database not open');
    this.run(`INSERT OR REPLACE INTO pool_fencers (pool_id, fencer_id, position) VALUES (?, ?, ?)`, [poolId, fencerId, position]);
  }

  public addFencerToPoolMidCompetition(poolId: string, fencerId: string, maxScore: number): Pool {
    if (!this.db) throw new Error('Database not open');
    const existingFencers = this.getPoolFencers(poolId);
    if (existingFencers.some(f => f.id === fencerId)) throw new Error('Fencer already in this pool');

    const doInsert = this.db.transaction(() => {
      const nextPosition = existingFencers.length;
      this.run(`INSERT OR REPLACE INTO pool_fencers (pool_id, fencer_id, position) VALUES (?, ?, ?)`, [poolId, fencerId, nextPosition]);
      const maxNumRow = this.queryOne<{ max_num: number | null }>(
        'SELECT COALESCE(MAX(number), 0) AS max_num FROM matches WHERE pool_id = ?',
        [poolId]
      );
      let nextMatchNumber = maxNumRow?.max_num ?? 0;
      const now = new Date().toISOString();
      for (const existing of existingFencers) {
        nextMatchNumber += 1;
        this.run(
          `INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), nextMatchNumber, poolId, fencerId, existing.id, maxScore, 'not_started', now, now]
        );
      }
    });
    doInsert();

    const phaseRow = this.queryOne<{ phase_id: string }>('SELECT phase_id FROM pools WHERE id = ?', [poolId]);
    if (!phaseRow) throw new Error(`Pool ${poolId} introuvable après ajout`);
    const updated = this.getPoolsByPhase(phaseRow.phase_id).find(p => p.id === poolId);
    if (!updated) throw new Error(`Poule mise à jour introuvable`);
    return updated;
  }

  public getPoolsByPhase(phaseId: string): Pool[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>(
      'SELECT id, phase_id, number, is_complete, has_error, referee_id, created_at, updated_at FROM pools WHERE phase_id = ? ORDER BY number',
      [phaseId]
    ).map(row => {
      const poolId = row.id as string;
      const fencers = this.getPoolFencers(poolId);
      const matches = this.getMatchesByPool(poolId);
      let referees: Referee[] = [];
      if (row.referee_id) {
        const ref = this.getReferee(row.referee_id as string);
        if (ref) referees = [ref];
      }
      return {
        id: poolId,
        phaseId: row.phase_id as string,
        number: row.number as number,
        fencers, matches, referees,
        isComplete: row.is_complete === 1,
        hasError: row.has_error === 1,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      } as unknown as Pool;
    });
  }

  // ─── Phase CRUD ─────────────────────────────────────────────────────────────

  public createPhase(competitionId: string, type: string, order: number, name: string): Phase {
    if (!this.db) throw new Error('Database not open');
    const id = uuidv4();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO phases (id, competition_id, name, type, order_index, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, competitionId, name, type, order, now, now]
    );
    return { id, competitionId, type: type as PhaseType, order, name, isComplete: false, createdAt: new Date(now), updatedAt: new Date(now) } as Phase;
  }

  public getPhase(id: string): Phase | null {
    if (!this.db) return null;
    const row = this.queryOne<any>('SELECT * FROM phases WHERE id = ?', [id]);
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
    if (!this.db) return [];
    return this.queryAll<any>('SELECT * FROM phases WHERE competition_id = ? ORDER BY order_index ASC', [competitionId])
      .map(row => ({
        id: row.id as string,
        competitionId: row.competition_id as string,
        type: row.type as PhaseType,
        order: row.order_index as number,
        name: row.name as string,
        isComplete: row.status === 'complete',
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      } as Phase));
  }

  public updatePhase(id: string, updates: { name?: string; isComplete?: boolean }): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
    if (updates.isComplete !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.isComplete ? 'complete' : 'pending');
    }
    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      values.push(now, id);
      this.run(`UPDATE phases SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
  }

  public deletePhase(id: string): void {
    if (!this.db) throw new Error('Database not open');
    this.inTransaction(() => {
      this.run('DELETE FROM pool_signatures WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)', [id]);
      this.run('DELETE FROM matches WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)', [id]);
      this.run('DELETE FROM pool_fencers WHERE pool_id IN (SELECT id FROM pools WHERE phase_id = ?)', [id]);
      this.run('DELETE FROM pools WHERE phase_id = ?', [id]);
      this.run('DELETE FROM phases WHERE id = ?', [id]);
    });
  }

  // ─── Referee CRUD ────────────────────────────────────────────────────────────

  public createReferee(
    competitionId: string,
    data: { name: string; gender?: string; nationality?: string; club?: string; license?: string; category?: string }
  ): Referee {
    if (!this.db) throw new Error('Database not open');
    const id = uuidv4();
    const now = new Date().toISOString();
    const refRow = this.queryOne<{ next_ref: number }>(
      'SELECT COALESCE(MAX(ref), 0) + 1 AS next_ref FROM referees WHERE competition_id = ?',
      [competitionId]
    );
    const nextRef = refRow?.next_ref ?? 1;
    this.run(
      `INSERT INTO referees (id, competition_id, ref, name, gender, nationality, club, license, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [id, competitionId, nextRef, data.name, data.gender ?? null, data.nationality ?? 'FRA',
       data.club ?? null, data.license ?? null, data.category ?? null, now, now]
    );
    return {
      id, ref: nextRef,
      lastName: data.name?.split(' ').slice(-1)[0] ?? '',
      firstName: data.name?.split(' ').slice(0, -1).join(' ') ?? '',
      gender: data.gender ?? 'M',
      nationality: data.nationality ?? 'FRA',
      club: data.club, license: data.license, category: data.category,
      status: 'available', createdAt: new Date(now), updatedAt: new Date(now),
    } as Referee;
  }

  public getReferee(id: string): Referee | null {
    if (!this.db) return null;
    const row = this.queryOne<any>('SELECT * FROM referees WHERE id = ?', [id]);
    return row ? this.rowToReferee(row) : null;
  }

  public getRefereesByCompetition(competitionId: string): Referee[] {
    if (!this.db) return [];
    return this.queryAll<any>('SELECT * FROM referees WHERE competition_id = ? ORDER BY ref ASC', [competitionId])
      .map(row => this.rowToReferee(row));
  }

  public updateReferee(id: string, updates: { name?: string; gender?: string; nationality?: string; club?: string; license?: string; category?: string; status?: string }): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = { name: 'name', gender: 'gender', nationality: 'nationality', club: 'club', license: 'license', category: 'category', status: 'status' };
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) { setClauses.push(`${col} = ?`); values.push((updates as any)[key]); }
    }
    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      values.push(now, id);
      this.run(`UPDATE referees SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }
  }

  public deleteReferee(id: string): void {
    if (!this.db) throw new Error('Database not open');
    this.run('DELETE FROM referees WHERE id = ?', [id]);
  }

  private rowToReferee(row: any): Referee {
    return {
      id: row.id as string,
      ref: row.ref as number,
      lastName: (row.name as string)?.split(' ').slice(-1)[0] ?? '',
      firstName: (row.name as string)?.split(' ').slice(0, -1).join(' ') ?? '',
      gender: (row.gender as Gender) ?? 'M',
      nationality: row.nationality as string,
      club: row.club as string | undefined,
      license: row.license as string | undefined,
      category: row.category as string | undefined,
      status: (row.status as 'available' | 'assigned' | 'unavailable') ?? 'available',
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    } as Referee;
  }

  public getMatchesWithReferees(competitionId: string): Array<{
    matchId: string; matchNumber: number; poolName: string | null;
    fencerAName: string; fencerBName: string;
    scoreA: number | null; scoreB: number | null; status: string;
    refereeId: string | null; refereeName: string | null;
  }> {
    if (!this.db) return [];
    return this.queryAll<any>(
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
    ).map(row => {
      const scoreARaw = row.score_a ? JSON.parse(row.score_a as string) : null;
      const scoreBRaw = row.score_b ? JSON.parse(row.score_b as string) : null;
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
    if (!this.db) return [];
    const rows = this.queryAll<any>(
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

  // ─── Touch / Card read methods ───────────────────────────────────────────────

  public getTouches(matchId: string): Array<{
    id: string; fencerId: string; zone: string; points: number;
    timestamp: string; isValidInSuddenDeath: boolean; isReversed: boolean;
  }> {
    if (!this.db) return [];
    return this.queryAll<any>(
      'SELECT id, fencer_id, zone, points, timestamp, is_valid_in_sudden_death, is_reversed FROM match_touches WHERE match_id = ? ORDER BY timestamp ASC',
      [matchId]
    ).map(r => ({
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
    id: string; fencerId: string; cardType: string; reason: string;
    cardGroup: number; timestamp: string; pointsAwarded: number; resultingExclusion: boolean;
  }> {
    if (!this.db) return [];
    return this.queryAll<any>(
      'SELECT id, fencer_id, card_type, reason, card_group, timestamp, points_awarded, resulting_exclusion FROM match_cards WHERE match_id = ? ORDER BY timestamp ASC',
      [matchId]
    ).map(r => ({
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
    id: string; matchId: string; fencerId: string; zone: string; points: number;
    timestamp: string; isValidInSuddenDeath?: boolean; isReversed?: boolean;
  }): void {
    if (!this.db) throw new Error('Database not open');
    this.run(
      `INSERT OR REPLACE INTO match_touches (id, match_id, fencer_id, zone, points, timestamp, is_valid_in_sudden_death, is_reversed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [touch.id, touch.matchId, touch.fencerId, touch.zone, touch.points, touch.timestamp, touch.isValidInSuddenDeath ? 1 : 0, touch.isReversed ? 1 : 0]
    );
  }

  public saveCard(card: {
    id: string; matchId: string; fencerId: string; cardType: string; reason: string;
    cardGroup: number; timestamp: string; pointsAwarded: number; resultingExclusion?: boolean;
  }): void {
    if (!this.db) throw new Error('Database not open');
    this.run(
      `INSERT OR REPLACE INTO match_cards (id, match_id, fencer_id, card_type, reason, card_group, timestamp, points_awarded, resulting_exclusion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [card.id, card.matchId, card.fencerId, card.cardType, card.reason, card.cardGroup, card.timestamp, card.pointsAwarded, card.resultingExclusion ? 1 : 0]
    );
  }

  public updateMatchTiming(matchId: string, startTime: string | null, endTime: string | null, duration: number | null): void {
    if (!this.db) throw new Error('Database not open');
    this.run(
      `UPDATE matches SET start_time = ?, end_time = ?, duration = ?, updated_at = ? WHERE id = ?`,
      [startTime, endTime, duration, new Date().toISOString(), matchId]
    );
  }

  public getFencerHistory(fencerId: string): {
    matches: Array<{
      matchId: string; number: number; opponentId: string | null;
      opponentLastName: string | null; opponentFirstName: string | null;
      scoreA: string | null; scoreB: string | null; side: 'A' | 'B'; status: string;
      startTime: string | null; endTime: string | null; duration: number | null;
      poolId: string | null; tableId: string | null; round: number | null;
      touches: Array<{ id: string; zone: string; points: number; timestamp: string; isValidInSuddenDeath: boolean; isReversed: boolean }>;
      cards: Array<{ id: string; cardType: string; reason: string; cardGroup: number; timestamp: string; pointsAwarded: number; resultingExclusion: boolean }>;
    }>;
  } {
    if (!this.db) throw new Error('Database not open');
    const matchRows = this.queryAll<any>(
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
      const opponentId = side === 'A' ? (row.fencer_b_id as string | null) : (row.fencer_a_id as string | null);
      const opponentLastName = side === 'A' ? (row.opp_b_last as string | null) : (row.opp_a_last as string | null);
      const opponentFirstName = side === 'A' ? (row.opp_b_first as string | null) : (row.opp_a_first as string | null);
      const touches = this.queryAll<any>(
        `SELECT id, zone, points, timestamp, is_valid_in_sudden_death, is_reversed FROM match_touches WHERE match_id = ? AND fencer_id = ? ORDER BY timestamp ASC`,
        [row.id as string, fencerId]
      ).map(t => ({
        id: t.id as string, zone: t.zone as string, points: t.points as number,
        timestamp: t.timestamp as string, isValidInSuddenDeath: t.is_valid_in_sudden_death === 1, isReversed: t.is_reversed === 1,
      }));
      const cards = this.queryAll<any>(
        `SELECT id, card_type, reason, card_group, timestamp, points_awarded, resulting_exclusion FROM match_cards WHERE match_id = ? AND fencer_id = ? ORDER BY timestamp ASC`,
        [row.id as string, fencerId]
      ).map(c => ({
        id: c.id as string, cardType: c.card_type as string, reason: c.reason as string,
        cardGroup: c.card_group as number, timestamp: c.timestamp as string,
        pointsAwarded: c.points_awarded as number, resultingExclusion: c.resulting_exclusion === 1,
      }));
      return {
        matchId: row.id as string, number: row.number as number,
        opponentId, opponentLastName, opponentFirstName,
        scoreA: row.score_a as string | null, scoreB: row.score_b as string | null,
        side, status: row.status as string,
        startTime: row.start_time as string | null, endTime: row.end_time as string | null,
        duration: row.duration as number | null,
        poolId: row.pool_id as string | null, tableId: row.table_id as string | null,
        round: row.round as number | null,
        touches, cards,
      };
    });
    return { matches };
  }

  public saveArenaExit(exit: {
    id: string; matchId: string; fencerId: string; exitType: string;
    timestamp: string; pointsAwarded: number;
  }): void {
    if (!this.db) throw new Error('Database not open');
    this.run(
      `INSERT OR REPLACE INTO match_arena_exits (id, match_id, fencer_id, exit_type, timestamp, points_awarded) VALUES (?, ?, ?, ?, ?, ?)`,
      [exit.id, exit.matchId, exit.fencerId, exit.exitType, exit.timestamp, exit.pointsAwarded]
    );
  }

  public getFencerCompetitionStats(fencerId: string): {
    fencerId: string; fencerLastName: string; fencerFirstName: string; fencerClub?: string; competitionId: string;
    touchesZoneA: number; touchesZoneB: number; touchesZoneC: number; totalTouchPoints: number;
    whiteCards: number; yellowCards: number; redCards: number; cardsByReason: Record<string, number>;
    arenaExits: number; matchesPlayed: number; totalDurationSeconds: number;
    averageDurationSeconds: number; matchesFinishedEarly: number;
  } {
    if (!this.db) throw new Error('Database not open');
    const fencerRow = this.queryOne<any>('SELECT last_name, first_name, club, competition_id FROM fencers WHERE id = ?', [fencerId]);
    const empty = {
      fencerId,
      fencerLastName: (fencerRow?.last_name as string) ?? '',
      fencerFirstName: (fencerRow?.first_name as string) ?? '',
      fencerClub: (fencerRow?.club as string) || undefined,
      competitionId: (fencerRow?.competition_id as string) ?? '',
      touchesZoneA: 0, touchesZoneB: 0, touchesZoneC: 0, totalTouchPoints: 0,
      whiteCards: 0, yellowCards: 0, redCards: 0, cardsByReason: {} as Record<string, number>,
      arenaExits: 0, matchesPlayed: 0, totalDurationSeconds: 0, averageDurationSeconds: 0, matchesFinishedEarly: 0,
    };
    this.queryAll<any>(
      `SELECT zone, SUM(points) AS pts, COUNT(*) AS cnt FROM match_touches WHERE fencer_id = ? AND is_reversed = 0 GROUP BY zone`,
      [fencerId]
    ).forEach(r => {
      if (r.zone === 'A') { empty.touchesZoneA = r.cnt as number; empty.totalTouchPoints += r.pts as number; }
      else if (r.zone === 'B') { empty.touchesZoneB = r.cnt as number; empty.totalTouchPoints += r.pts as number; }
      else if (r.zone === 'C') { empty.touchesZoneC = r.cnt as number; empty.totalTouchPoints += r.pts as number; }
    });
    this.queryAll<any>(
      `SELECT card_type, reason, COUNT(*) AS cnt FROM match_cards WHERE fencer_id = ? GROUP BY card_type, reason`,
      [fencerId]
    ).forEach(r => {
      const type = (r.card_type as string).toLowerCase();
      const cnt = r.cnt as number;
      if (type === 'white') empty.whiteCards += cnt;
      else if (type === 'yellow') empty.yellowCards += cnt;
      else if (type === 'red') empty.redCards += cnt;
      const reason = r.reason as string;
      if (reason && reason !== 'unknown') empty.cardsByReason[reason] = (empty.cardsByReason[reason] ?? 0) + cnt;
    });
    const exitRow = this.queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM match_arena_exits WHERE fencer_id = ?', [fencerId]);
    empty.arenaExits = exitRow?.cnt ?? 0;
    const durRow = this.queryOne<any>(
      `SELECT COUNT(*) AS total, SUM(COALESCE(duration, 0)) AS total_dur, SUM(CASE WHEN duration IS NOT NULL AND duration < 180 THEN 1 ELSE 0 END) AS early FROM matches WHERE (fencer_a_id = ? OR fencer_b_id = ?) AND status = 'finished'`,
      [fencerId, fencerId]
    );
    if (durRow) {
      empty.matchesPlayed = (durRow.total as number) ?? 0;
      empty.totalDurationSeconds = (durRow.total_dur as number) ?? 0;
      empty.averageDurationSeconds = empty.matchesPlayed > 0 ? Math.round(empty.totalDurationSeconds / empty.matchesPlayed) : 0;
      empty.matchesFinishedEarly = (durRow.early as number) ?? 0;
    }
    return empty;
  }

  public getCompetitionFencerStats(competitionId: string): ReturnType<typeof this.getFencerCompetitionStats>[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<{ id: string }>('SELECT id FROM fencers WHERE competition_id = ? ORDER BY ref', [competitionId])
      .map(r => this.getFencerCompetitionStats(r.id));
  }

  // ─── Abandon snapshots ──────────────────────────────────────────────────────

  public saveAbandonSnapshot(
    fencerId: string, competitionId: string, previousStatus: string,
    abandonType: string, matchSnapshots: { matchId: string; status: string; scoreA: unknown; scoreB: unknown }[]
  ): void {
    if (!this.db) throw new Error('Database not open');
    this.run('DELETE FROM fencer_abandons WHERE fencer_id = ?', [fencerId]);
    this.run(
      `INSERT INTO fencer_abandons (id, fencer_id, competition_id, previous_status, abandon_type, match_snapshots, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`abandon-${fencerId}-${Date.now()}`, fencerId, competitionId, previousStatus, abandonType, JSON.stringify(matchSnapshots), new Date().toISOString()]
    );
  }

  public getAbandonSnapshot(fencerId: string): {
    id: string; fencerId: string; competitionId: string; previousStatus: string;
    abandonType: string; matchSnapshots: { matchId: string; status: string; scoreA: unknown; scoreB: unknown }[];
    createdAt: string;
  } | null {
    if (!this.db) return null;
    const row = this.queryOne<any>(
      'SELECT * FROM fencer_abandons WHERE fencer_id = ? ORDER BY created_at DESC LIMIT 1',
      [fencerId]
    );
    if (!row) return null;
    let matchSnapshots: { matchId: string; status: string; scoreA: unknown; scoreB: unknown }[] = [];
    try {
      matchSnapshots = JSON.parse((row.match_snapshots as string) || '[]');
    } catch (err) {
      console.error('[Database] match_snapshots JSON invalide, ignoré:', err);
    }
    return {
      id: row.id as string, fencerId: row.fencer_id as string,
      competitionId: row.competition_id as string, previousStatus: row.previous_status as string,
      abandonType: row.abandon_type as string, matchSnapshots, createdAt: row.created_at as string,
    };
  }

  public deleteAbandonSnapshot(fencerId: string): void {
    if (!this.db) return;
    this.run('DELETE FROM fencer_abandons WHERE fencer_id = ?', [fencerId]);
  }

  // Export/Import
  public async exportToFile(filepath: string): Promise<void> {
    if (!this.db) throw new Error('Database not open');
    await this.db.backup(filepath);
  }

  public async importFromFile(filepath: string): Promise<void> {
    this.close();
    this.dbPath = filepath;
    await this.open();
  }

  // ─── Bracket nodes (élimination directe) ────────────────────────────────────

  public upsertBracketNode(node: {
    id: string; competitionId: string; phaseId: string;
    round: number; position: number; fencerId?: string | null;
    matchId?: string | null; isBye?: boolean; isThirdPlace?: boolean; parentNodeId?: string | null;
  }): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    this.run(
      `INSERT OR REPLACE INTO bracket_nodes
        (id, competition_id, phase_id, round, position, fencer_id, match_id, is_bye, is_third_place, parent_node_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM bracket_nodes WHERE id=?), ?), ?)`,
      [
        node.id, node.competitionId, node.phaseId, node.round, node.position,
        node.fencerId ?? null, node.matchId ?? null,
        node.isBye ? 1 : 0, node.isThirdPlace ? 1 : 0, node.parentNodeId ?? null,
        node.id, now, now,
      ]
    );
  }

  public getBracketNodes(competitionId: string, phaseId: string): any[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>(
      `SELECT * FROM bracket_nodes WHERE competition_id=? AND phase_id=? ORDER BY round, position`,
      [competitionId, phaseId]
    ).map(r => ({ ...r, isBye: r.is_bye === 1, isThirdPlace: r.is_third_place === 1 }));
  }

  public clearBracket(competitionId: string, phaseId: string): void {
    if (!this.db) throw new Error('Database not open');
    this.run(`DELETE FROM bracket_nodes WHERE competition_id=? AND phase_id=?`, [competitionId, phaseId]);
  }

  // ─── Score audit log ─────────────────────────────────────────────────────────

  public logScoreChange(entry: {
    matchId: string; arenaId?: string;
    previousScoreA?: any; previousScoreB?: any;
    newScoreA: any; newScoreB: any;
    changedBy: string; reason?: string;
    refereeId?: string; refereeName?: string;
    ipAddress?: string; poolId?: string;
  }): void {
    if (!this.db) throw new Error('Database not open');
    const { v4: uuidv4gen } = require('uuid');
    this.run(
      `INSERT INTO score_audit_log (id, match_id, arena_id, previous_score_a, previous_score_b, new_score_a, new_score_b, changed_by, changed_at, reason, referee_id, referee_name, ip_address, pool_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4gen(), entry.matchId, entry.arenaId ?? null,
        entry.previousScoreA != null ? JSON.stringify(entry.previousScoreA) : null,
        entry.previousScoreB != null ? JSON.stringify(entry.previousScoreB) : null,
        JSON.stringify(entry.newScoreA), JSON.stringify(entry.newScoreB),
        entry.changedBy, new Date().toISOString(),
        entry.reason ?? null, entry.refereeId ?? null, entry.refereeName ?? null,
        entry.ipAddress ?? null, entry.poolId ?? null,
      ]
    );
  }

  private parseAuditRow(r: any) {
    return {
      id: r.id as string, matchId: r.match_id as string,
      arenaId: r.arena_id as string | null, poolId: r.pool_id as string | null,
      matchNumber: r.match_number != null ? Number(r.match_number) : null,
      poolNumber: r.pool_number != null ? Number(r.pool_number) : null,
      previousScoreA: r.previous_score_a ? JSON.parse(r.previous_score_a as string) : null,
      previousScoreB: r.previous_score_b ? JSON.parse(r.previous_score_b as string) : null,
      newScoreA: JSON.parse(r.new_score_a as string), newScoreB: JSON.parse(r.new_score_b as string),
      changedBy: r.changed_by as string, changedAt: r.changed_at as string,
      reason: r.reason as string | null, refereeId: r.referee_id as string | null,
      refereeName: r.referee_name as string | null, ipAddress: r.ip_address as string | null,
    };
  }

  public getScoreAuditLog(matchId: string): any[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>(
      `SELECT sal.*, m.number as match_number, p.number as pool_number FROM score_audit_log sal LEFT JOIN matches m ON sal.match_id = m.id LEFT JOIN pools p ON m.pool_id = p.id WHERE sal.match_id=? ORDER BY sal.changed_at ASC`,
      [matchId]
    ).map(r => this.parseAuditRow(r));
  }

  public getScoreAuditLogByCompetition(competitionId: string): any[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>(
      `SELECT sal.*, m.number as match_number, p.number as pool_number FROM score_audit_log sal JOIN matches m ON sal.match_id = m.id JOIN pools p ON m.pool_id = p.id JOIN phases ph ON p.phase_id = ph.id WHERE ph.competition_id = ? ORDER BY sal.changed_at DESC`,
      [competitionId]
    ).map(r => this.parseAuditRow(r));
  }

  // ─── Match timeline (audit log) ──────────────────────────────────────────────

  private parseTimelineRow(r: any): MatchEventEntry {
    return {
      id: r.id as string, matchId: r.match_id as string,
      eventType: r.event_type as MatchEventType, timestamp: r.timestamp as string,
      fencerId: (r.fencer_id as string) ?? null,
      fencerLastName: (r.fencer_last_name as string) ?? null,
      fencerFirstName: (r.fencer_first_name as string) ?? null,
      fencerSide: (r.fencer_side as 'A' | 'B') ?? null,
      previousScoreA: r.prev_a ? JSON.parse(r.prev_a as string) : null,
      previousScoreB: r.prev_b ? JSON.parse(r.prev_b as string) : null,
      newScoreA: r.new_a ? JSON.parse(r.new_a as string) : null,
      newScoreB: r.new_b ? JSON.parse(r.new_b as string) : null,
      changedBy: (r.changed_by as string) ?? null,
      refereeName: (r.referee_name as string) ?? null,
      ipAddress: (r.ip_address as string) ?? null,
      changeReason: (r.change_reason as string) ?? null,
      zone: (r.zone as string) ?? null,
      points: r.points != null ? Number(r.points) : null,
      cardType: (r.card_type as string) ?? null,
      cardReason: (r.card_reason as string) ?? null,
      cardGroup: r.card_group != null ? Number(r.card_group) : null,
      resultingExclusion: r.resulting_exclusion != null ? r.resulting_exclusion === 1 : null,
      exitType: (r.exit_type as string) ?? null,
    };
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
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<any>(DatabaseManager.TIMELINE_UNION_MATCH, [matchId, matchId, matchId, matchId])
      .map(r => this.parseTimelineRow(r));
  }

  public getCompetitionTimeline(competitionId: string): MatchEventEntry[] {
    if (!this.db) throw new Error('Database not open');
    const matchSubquery = `
      SELECT m.id FROM matches m
        LEFT JOIN pools p ON m.pool_id = p.id
        LEFT JOIN phases ph ON p.phase_id = ph.id
        WHERE ph.competition_id = ?
      UNION
      SELECT m.id FROM matches m
        JOIN bracket_nodes bn ON m.id = bn.match_id
        WHERE bn.competition_id = ?
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
    // 2 params per matchSubquery × 4 UNION branches = 8 bindings
    const p = competitionId;
    return this.queryAll<any>(sql, [p, p, p, p, p, p, p, p]).map(r => this.parseTimelineRow(r));
  }

  // ─── Arena state persistence ─────────────────────────────────────────────────

  public saveArenaState(arenaId: string, state: {
    competitionId: string; currentMatch: any | null;
    matchQueue: any[]; settings: any; status: string;
  }): void {
    if (!this.db) throw new Error('Database not open');
    this.run(
      `INSERT OR REPLACE INTO arena_state (arena_id, competition_id, current_match, match_queue, settings, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        arenaId, state.competitionId,
        state.currentMatch != null ? JSON.stringify(state.currentMatch) : null,
        JSON.stringify(state.matchQueue),
        state.settings != null ? JSON.stringify(state.settings) : null,
        state.status, new Date().toISOString(),
      ]
    );
  }

  public getArenaState(arenaId: string): {
    arenaId: string; competitionId: string; currentMatch: any | null;
    matchQueue: any[]; settings: any | null; status: string; updatedAt: string;
  } | null {
    if (!this.db) throw new Error('Database not open');
    const r = this.queryOne<any>(`SELECT * FROM arena_state WHERE arena_id=?`, [arenaId]);
    if (!r) return null;
    return {
      arenaId: r.arena_id as string, competitionId: r.competition_id as string,
      currentMatch: r.current_match ? JSON.parse(r.current_match as string) : null,
      matchQueue: r.match_queue ? JSON.parse(r.match_queue as string) : [],
      settings: r.settings ? JSON.parse(r.settings as string) : null,
      status: r.status as string, updatedAt: r.updated_at as string,
    };
  }

  public getArenaStatesByCompetition(competitionId: string): ReturnType<DatabaseManager['getArenaState']>[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<{ arena_id: string }>(`SELECT arena_id FROM arena_state WHERE competition_id=?`, [competitionId])
      .map(r => this.getArenaState(r.arena_id)).filter(Boolean) as any;
  }

  public clearArenaStates(competitionId: string): void {
    if (!this.db) throw new Error('Database not open');
    this.run(`DELETE FROM arena_state WHERE competition_id=?`, [competitionId]);
  }

  public savePoolSignature(poolId: string, fencerId: string, signatureData: string): void {
    if (!this.db) throw new Error('Database not open');
    this.run(
      `INSERT INTO pool_signatures (id, pool_id, fencer_id, signature_data, signed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(pool_id, fencer_id) DO UPDATE SET signature_data = excluded.signature_data, signed_at = excluded.signed_at`,
      [uuidv4(), poolId, fencerId, signatureData, new Date().toISOString()]
    );
  }

  public getPoolSignatures(poolId: string): { fencerId: string; signatureData: string }[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<{ fencer_id: string; signature_data: string }>(
      `SELECT fencer_id, signature_data FROM pool_signatures WHERE pool_id = ?`,
      [poolId]
    ).map(row => ({ fencerId: row.fencer_id, signatureData: row.signature_data }));
  }

  // ── Signatures des matchs de tableau (élimination directe) ──
  public saveDEMatchSignature(matchId: string, fencerId: string, signatureData: string): void {
    if (!this.db) throw new Error('Database not open');
    this.run(
      `INSERT INTO de_match_signatures (id, match_id, fencer_id, signature_data, signed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(match_id, fencer_id) DO UPDATE SET signature_data = excluded.signature_data, signed_at = excluded.signed_at`,
      [uuidv4(), matchId, fencerId, signatureData, new Date().toISOString()]
    );
  }

  public getDEMatchSignatures(matchId: string): { fencerId: string; signatureData: string }[] {
    if (!this.db) throw new Error('Database not open');
    return this.queryAll<{ fencer_id: string; signature_data: string }>(
      `SELECT fencer_id, signature_data FROM de_match_signatures WHERE match_id = ?`,
      [matchId]
    ).map(row => ({ fencerId: row.fencer_id, signatureData: row.signature_data }));
  }

  /** Signatures de tableau pour un ensemble de matchs (pour export PDF). */
  public getDEMatchSignaturesByMatchIds(
    matchIds: string[]
  ): { matchId: string; fencerId: string; signatureData: string }[] {
    if (!this.db) throw new Error('Database not open');
    if (matchIds.length === 0) return [];
    const placeholders = matchIds.map(() => '?').join(',');
    return this.queryAll<{ match_id: string; fencer_id: string; signature_data: string }>(
      `SELECT match_id, fencer_id, signature_data FROM de_match_signatures WHERE match_id IN (${placeholders})`,
      matchIds
    ).map(row => ({ matchId: row.match_id, fencerId: row.fencer_id, signatureData: row.signature_data }));
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
    if (!this.db) throw new Error('Database not open');
    const { v4: uuidv4gen } = require('uuid');
    const now = new Date().toISOString();
    this.run('DELETE FROM season_results WHERE competition_id = ?', [payload.competitionId]);
    for (const e of payload.entries) {
      this.run(
        `INSERT INTO season_results
           (id, competition_id, competition_title, competition_date,
            fencer_id, fencer_last_name, fencer_first_name, fencer_club,
            victories, matches_played, quest_points,
            quest_v4, quest_v3, quest_v2, quest_v1,
            touches_scored, touches_received, red_cards, comp_rank, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4gen(), payload.competitionId, payload.competitionTitle, payload.competitionDate,
          e.fencerId, e.fencerLastName, e.fencerFirstName, e.fencerClub ?? null,
          e.victories, e.matchesPlayed, e.questPoints,
          e.questV4, e.questV3, e.questV2, e.questV1,
          e.touchesScored, e.touchesReceived, e.redCards, e.compRank, now,
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
    if (!this.db) return [];
    const rows = this.queryAll<any>(
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
      ratio: Number(r.total_matches_played) > 0
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
    if (!this.db) return [];
    return this.queryAll<any>(
      `SELECT competition_id, competition_title, competition_date,
              COUNT(fencer_id) AS fencer_count, MAX(added_at) AS added_at
       FROM season_results
       GROUP BY competition_id
       ORDER BY competition_date DESC`,
      []
    ).map(r => ({
      competitionId: r.competition_id as string,
      competitionTitle: r.competition_title as string,
      competitionDate: r.competition_date as string,
      fencerCount: Number(r.fencer_count),
      addedAt: r.added_at as string,
    }));
  }

  public removeCompetitionFromSeason(competitionId: string): void {
    if (!this.db) return;
    this.run('DELETE FROM season_results WHERE competition_id = ?', [competitionId]);
  }

  public resetSeason(): void {
    if (!this.db) return;
    this.run('DELETE FROM season_results', []);
  }

  // ─── Équipes (compétitions par équipes) ─────────────────────────────────────

  public createTeam(competitionId: string, name: string, club: string): { id: string } {
    if (!this.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const id = gen();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO teams (id, competition_id, name, club, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, competitionId, name, club, now, now]
    );
    return { id };
  }

  public getTeamsByCompetition(competitionId: string): Array<{
    id: string; name: string; club: string;
    fencers: Array<{ fencerId: string; fencerLastName: string; fencerFirstName: string; teamOrder: number; isReserve: boolean }>;
  }> {
    if (!this.db) return [];
    const teams = this.queryAll<any>('SELECT * FROM teams WHERE competition_id = ? ORDER BY name', [competitionId]);
    return teams.map(t => {
      const fencers = this.queryAll<any>(
        `SELECT tf.fencer_id, tf.team_order, tf.is_reserve, f.last_name, f.first_name
         FROM team_fencers tf JOIN fencers f ON tf.fencer_id = f.id
         WHERE tf.team_id = ? ORDER BY tf.team_order`,
        [t.id]
      );
      return {
        id: t.id as string,
        name: t.name as string,
        club: t.club as string,
        fencers: fencers.map(f => ({
          fencerId: f.fencer_id as string,
          fencerLastName: f.last_name as string,
          fencerFirstName: f.first_name as string,
          teamOrder: Number(f.team_order),
          isReserve: f.is_reserve === 1,
        })),
      };
    });
  }

  public deleteTeam(teamId: string): void {
    if (!this.db) return;
    this.run('DELETE FROM teams WHERE id = ?', [teamId]);
  }

  public upsertTeamFencer(teamId: string, fencerId: string, teamOrder: number, isReserve: boolean): void {
    if (!this.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    this.run(
      `INSERT INTO team_fencers (id, team_id, fencer_id, team_order, is_reserve)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(team_id, fencer_id) DO UPDATE SET team_order = excluded.team_order, is_reserve = excluded.is_reserve`,
      [gen(), teamId, fencerId, teamOrder, isReserve ? 1 : 0]
    );
  }

  public removeTeamFencer(teamId: string, fencerId: string): void {
    if (!this.db) return;
    this.run('DELETE FROM team_fencers WHERE team_id = ? AND fencer_id = ?', [teamId, fencerId]);
  }

  // `round` : calendrier de poule figé (format arène Sabre Laser, 8/12 équipes)
  // — optionnel, reste `NULL` pour la génération round-robin générique existante.
  public createTeamMatch(
    competitionId: string,
    poolNumber: number,
    teamAId: string,
    teamBId: string,
    round?: number
  ): { id: string } {
    if (!this.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const matchId = gen();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO team_matches (id, competition_id, pool_number, round, team_a_id, team_b_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, ?)`,
      [matchId, competitionId, poolNumber, round ?? null, teamAId, teamBId, now, now]
    );
    return { id: matchId };
  }

  public createTeamTableauMatch(
    competitionId: string,
    tableId: string,
    round: number,
    position: number,
    teamAId: string,
    teamBId: string
  ): { id: string } {
    if (!this.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const matchId = gen();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO team_matches (id, competition_id, pool_number, team_a_id, team_b_id, status, table_id, round, position, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, 'not_started', ?, ?, ?, ?, ?)`,
      [matchId, competitionId, teamAId, teamBId, tableId, round, position, now, now]
    );
    return { id: matchId };
  }

  public getTeamTableauMatches(competitionId: string, tableId: string): Array<{
    id: string; round: number; position: number; teamAId: string; teamBId: string;
    scoreBoutsA: number; scoreBoutsB: number; status: string; winnerId: string | null;
    currentBoutIndex: number;
    bouts: Array<{ id: string; boutOrder: number; fencerAId: string; fencerBId: string; scoreA: number; scoreB: number; maxScore: number; status: string; winnerId: string | null }>;
  }> {
    if (!this.db) return [];
    const matches = this.queryAll<any>(
      'SELECT * FROM team_matches WHERE competition_id = ? AND table_id = ? ORDER BY round DESC, position',
      [competitionId, tableId]
    );
    return matches.map(m => {
      const bouts = this.queryAll<any>(
        'SELECT * FROM team_bouts WHERE match_id = ? ORDER BY bout_order',
        [m.id]
      );
      return {
        id: m.id as string, round: Number(m.round), position: Number(m.position),
        teamAId: m.team_a_id as string, teamBId: m.team_b_id as string,
        scoreBoutsA: Number(m.score_bouts_a), scoreBoutsB: Number(m.score_bouts_b),
        status: m.status as string, winnerId: (m.winner_id as string) ?? null,
        currentBoutIndex: Number(m.current_bout_index),
        bouts: bouts.map(b => ({
          id: b.id as string, boutOrder: Number(b.bout_order),
          fencerAId: b.fencer_a_id as string, fencerBId: b.fencer_b_id as string,
          scoreA: Number(b.score_a), scoreB: Number(b.score_b), maxScore: Number(b.max_score),
          status: b.status as string, winnerId: (b.winner_id as string) ?? null,
        })),
      };
    });
  }

  public getTeamMatchesByCompetition(competitionId: string): Array<{
    id: string; poolNumber: number; round: number | null;
    teamAId: string; teamBId: string;
    scoreBoutsA: number; scoreBoutsB: number; status: string; winnerId: string | null;
    currentBoutIndex: number;
    bouts: Array<{ id: string; boutOrder: number; fencerAId: string; fencerBId: string; scoreA: number; scoreB: number; maxScore: number; status: string; winnerId: string | null }>;
  }> {
    if (!this.db) return [];
    const matches = this.queryAll<any>(
      'SELECT * FROM team_matches WHERE competition_id = ? AND table_id IS NULL ORDER BY pool_number, created_at',
      [competitionId]
    );
    return matches.map(m => {
      const bouts = this.queryAll<any>(
        'SELECT * FROM team_bouts WHERE match_id = ? ORDER BY bout_order',
        [m.id]
      );
      return {
        id: m.id as string, poolNumber: Number(m.pool_number),
        round: m.round != null ? Number(m.round) : null,
        teamAId: m.team_a_id as string, teamBId: m.team_b_id as string,
        scoreBoutsA: Number(m.score_bouts_a), scoreBoutsB: Number(m.score_bouts_b),
        status: m.status as string, winnerId: (m.winner_id as string) ?? null,
        currentBoutIndex: Number(m.current_bout_index),
        bouts: bouts.map(b => ({
          id: b.id as string, boutOrder: Number(b.bout_order),
          fencerAId: b.fencer_a_id as string, fencerBId: b.fencer_b_id as string,
          scoreA: Number(b.score_a), scoreB: Number(b.score_b), maxScore: Number(b.max_score),
          status: b.status as string, winnerId: (b.winner_id as string) ?? null,
        })),
      };
    });
  }

  public createTeamBout(matchId: string, boutOrder: number, fencerAId: string, fencerBId: string, maxScore: number): { id: string } {
    if (!this.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const id = gen();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO team_bouts (id, match_id, bout_order, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, ?)`,
      [id, matchId, boutOrder, fencerAId, fencerBId, maxScore, now, now]
    );
    return { id };
  }

  public updateTeamBout(boutId: string, scoreA: number, scoreB: number, status: string, winnerId: string | null): void {
    if (!this.db) return;
    const now = new Date().toISOString();
    this.run(
      `UPDATE team_bouts SET score_a = ?, score_b = ?, status = ?, winner_id = ?, updated_at = ? WHERE id = ?`,
      [scoreA, scoreB, status, winnerId, now, boutId]
    );
    // Recompute match bouts score if bout finished
    if (status === 'finished') {
      const bout = this.queryOne<any>('SELECT match_id FROM team_bouts WHERE id = ?', [boutId]);
      if (bout) this.recomputeTeamMatchScore(bout.match_id as string);
    }
  }

  private recomputeTeamMatchScore(matchId: string): void {
    const match = this.queryOne<any>('SELECT team_a_id, team_b_id FROM team_matches WHERE id = ?', [matchId]);
    if (!match) return;

    const allBouts = this.queryAll<any>(
      'SELECT status, score_a, score_b FROM team_bouts WHERE match_id = ? ORDER BY bout_order',
      [matchId]
    );
    // Score équipe = total des touches cumulées sur tous les relais (règle FIE),
    // pas le nombre d'assauts individuellement gagnés.
    const scoreA = allBouts.reduce((sum, b) => sum + Number(b.score_a), 0);
    const scoreB = allBouts.reduce((sum, b) => sum + Number(b.score_b), 0);
    const finishedCount = allBouts.filter(b => b.status === 'finished').length;
    const allFinished = allBouts.length > 0 && finishedCount === allBouts.length;
    const newStatus = allFinished ? 'finished' : finishedCount > 0 ? 'in_progress' : 'not_started';
    const winnerId = allFinished ? (scoreA > scoreB ? match.team_a_id : scoreB > scoreA ? match.team_b_id : null) : null;
    const now = new Date().toISOString();
    this.run(
      `UPDATE team_matches SET score_bouts_a = ?, score_bouts_b = ?, status = ?, winner_id = ?, current_bout_index = ?, updated_at = ? WHERE id = ?`,
      [scoreA, scoreB, newStatus, winnerId, finishedCount, now, matchId]
    );
  }

  // ── Cartons d'équipe "E" (format arène Sabre Laser) ─────────────────────────
  // Traçabilité uniquement : ces cartons n'affectent pas encore le score
  // (impact en points pas encore tranché par le règlement).

  public createTeamMatchCard(
    matchId: string,
    teamId: string,
    type: 'white' | 'yellow' | 'red' | 'black',
    reason: string
  ): { id: string } {
    if (!this.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const id = gen();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO team_match_cards (id, match_id, team_id, type, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, matchId, teamId, type, reason, now]
    );
    return { id };
  }

  public getTeamMatchCards(matchId: string): Array<{
    id: string; matchId: string; teamId: string; type: string; reason: string; createdAt: string;
  }> {
    if (!this.db) return [];
    const rows = this.queryAll<any>(
      'SELECT * FROM team_match_cards WHERE match_id = ? ORDER BY created_at',
      [matchId]
    );
    return rows.map(r => ({
      id: r.id as string,
      matchId: r.match_id as string,
      teamId: r.team_id as string,
      type: r.type as string,
      reason: r.reason as string,
      createdAt: r.created_at as string,
    }));
  }

  // ── Format arène Sabre Laser : saisie temps réel (tablette arbitre) ─────────
  // Résout un match d'équipe avec noms d'équipes/tireurs pour la diffusion en
  // direct, sans que le renderer ait à repousser ces données via IPC : le
  // serveur de score distant lit directement la DB (il en a déjà l'accès).

  public getTeamMatchDetail(matchId: string): {
    id: string;
    competitionId: string;
    teamAId: string;
    teamAName: string;
    teamBId: string;
    teamBName: string;
    status: string;
    currentBoutIndex: number;
    bouts: Array<{
      id: string;
      boutOrder: number;
      fencerAId: string;
      fencerAName: string;
      fencerBId: string;
      fencerBName: string;
      scoreA: number;
      scoreB: number;
      maxScore: number;
      status: string;
      winnerId: string | null;
    }>;
  } | null {
    if (!this.db) return null;
    const m = this.queryOne<any>('SELECT * FROM team_matches WHERE id = ?', [matchId]);
    if (!m) return null;
    const teamA = this.queryOne<any>('SELECT name FROM teams WHERE id = ?', [m.team_a_id]);
    const teamB = this.queryOne<any>('SELECT name FROM teams WHERE id = ?', [m.team_b_id]);
    const bouts = this.queryAll<any>(
      `SELECT b.*, fa.last_name AS fa_last, fa.first_name AS fa_first, fb.last_name AS fb_last, fb.first_name AS fb_first
       FROM team_bouts b
       JOIN fencers fa ON b.fencer_a_id = fa.id
       JOIN fencers fb ON b.fencer_b_id = fb.id
       WHERE b.match_id = ? ORDER BY b.bout_order`,
      [matchId]
    );
    return {
      id: m.id as string,
      competitionId: m.competition_id as string,
      teamAId: m.team_a_id as string,
      teamAName: (teamA?.name as string) ?? '—',
      teamBId: m.team_b_id as string,
      teamBName: (teamB?.name as string) ?? '—',
      status: m.status as string,
      currentBoutIndex: Number(m.current_bout_index),
      bouts: bouts.map(b => ({
        id: b.id as string,
        boutOrder: Number(b.bout_order),
        fencerAId: b.fencer_a_id as string,
        fencerAName: `${b.fa_last} ${b.fa_first ?? ''}`.trim(),
        fencerBId: b.fencer_b_id as string,
        fencerBName: `${b.fb_last} ${b.fb_first ?? ''}`.trim(),
        scoreA: Number(b.score_a),
        scoreB: Number(b.score_b),
        maxScore: Number(b.max_score),
        status: b.status as string,
        winnerId: (b.winner_id as string) ?? null,
      })),
    };
  }
}

export const db = new DatabaseManager();
