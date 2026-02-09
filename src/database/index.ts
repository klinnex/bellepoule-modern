/**
 * BellePoule Modern - Database Layer (sql.js version)
 * Portable SQLite database using sql.js (pure JavaScript)
 * Licensed under GPL-3.0
 */

// @ts-ignore
import initSqlJs from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  Competition,
  Fencer,
  FencerStatus,
  Gender,
  Weapon,
  Category,
  Pool,
  Match,
  MatchStatus,
} from '../shared/types';
import {
  validateId,
  validateCompetitionData,
  validateFencerData,
  validateMatchData,
  validatePoolData,
  validateSessionState,
  ValidationError,
  sanitizeString,
  sanitizeId
} from './validation';

let SQL: any = null;

export class DatabaseManager {
  private db: any = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'bellepoule.db');
  }

  public setPath(dbPath: string): void {
    this.dbPath = dbPath;
  }

  public async open(dbPath?: string): Promise<void> {
    if (dbPath) this.dbPath = dbPath;
    
    if (!SQL) {
      SQL = await initSqlJs();
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initializeTables();
    this.save();
  }

  public close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }

  private save(): void {
    if (!this.db) return;

    const data = this.db.export();
    const buffer = Buffer.from(data);
    const tmpPath = this.dbPath + '.tmp';
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Écriture atomique : fichier temporaire puis renommage
        fs.writeFileSync(tmpPath, buffer);
        try {
          fs.renameSync(tmpPath, this.dbPath);
        } catch {
          // Sur Windows, renameSync peut échouer si le fichier cible est verrouillé
          // Fallback: écriture directe
          fs.writeFileSync(this.dbPath, buffer);
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
        return;
      } catch (error: any) {
        // EBUSY / EPERM / EACCES : fichier verrouillé (antivirus Windows)
        const isRetryable = error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES';
        if (isRetryable && attempt < maxRetries - 1) {
          // Attente courte avant retry (100ms, 200ms)
          const waitMs = 100 * (attempt + 1);
          const start = Date.now();
          while (Date.now() - start < waitMs) { /* attente active */ }
          continue;
        }
        console.error(`Échec sauvegarde BDD (tentative ${attempt + 1}/${maxRetries}):`, error.message || error);
        throw error;
      }
    }
  }

  public forceSave(): void {
    this.save();
  }

  public getPath(): string { return this.dbPath; }
  public isOpen(): boolean { return this.db !== null; }

  private initializeTables(): void {
    if (!this.db) throw new Error('Database not open');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS competitions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, short_title TEXT,
        date TEXT NOT NULL, location TEXT, organizer TEXT,
        weapon TEXT NOT NULL, gender TEXT NOT NULL, category TEXT NOT NULL,
        championship TEXT, color TEXT DEFAULT '#3B82F6',
        current_phase_index INTEGER DEFAULT 0, is_team_event INTEGER DEFAULT 0,
        status TEXT DEFAULT 'draft', settings TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS fencers (
        id TEXT PRIMARY KEY, competition_id TEXT NOT NULL,
        ref INTEGER NOT NULL, last_name TEXT NOT NULL, first_name TEXT NOT NULL,
        birth_date TEXT, gender TEXT NOT NULL, nationality TEXT DEFAULT 'FRA',
        league TEXT, club TEXT, license TEXT, ranking INTEGER,
        status TEXT DEFAULT 'N', seed_number INTEGER, final_ranking INTEGER,
        pool_stats TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY, number INTEGER NOT NULL,
        pool_id TEXT, table_id TEXT,
        fencer_a_id TEXT, fencer_b_id TEXT,
        score_a TEXT, score_b TEXT, max_score INTEGER NOT NULL,
        status TEXT DEFAULT 'not_started', referee_id TEXT,
        strip INTEGER, round INTEGER, position INTEGER,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS pools (
        id TEXT PRIMARY KEY, phase_id TEXT NOT NULL,
        number INTEGER NOT NULL, strip INTEGER, start_time TEXT,
        is_complete INTEGER DEFAULT 0, has_error INTEGER DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS pool_fencers (
        pool_id TEXT NOT NULL, fencer_id TEXT NOT NULL, position INTEGER NOT NULL,
        PRIMARY KEY (pool_id, fencer_id)
      )
    `);

    // Table pour stocker l'état de session (persistance au refresh)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS session_state (
        competition_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  // Session State Management
  public saveSessionState(competitionId: string, state: any): void {
    if (!this.db) throw new Error('Database not open');
    
    // Input validation
    validateId(competitionId, 'competitionId');
    validateSessionState(state);
    
    const now = new Date().toISOString();
    const stateJson = JSON.stringify(state);
    
    this.db.run(`
      INSERT OR REPLACE INTO session_state (competition_id, state_json, updated_at)
      VALUES (?, ?, ?)
    `, [sanitizeId(competitionId), stateJson, now]);
    
    this.save();
  }

  public getSessionState(competitionId: string): any | null {
    if (!this.db) throw new Error('Database not open');
    
    // Input validation
    validateId(competitionId, 'competitionId');
    
    const stmt = this.db.prepare('SELECT state_json FROM session_state WHERE competition_id = ?');
    stmt.bind([sanitizeId(competitionId)]);
    
    if (!stmt.step()) { 
      stmt.free(); 
      return null; 
    }
    
    const row = stmt.getAsObject();
    stmt.free();
    
    try {
      return JSON.parse(row.state_json as string);
    } catch (e) {
      return null;
    }
  }

  public clearSessionState(competitionId: string): void {
    if (!this.db) throw new Error('Database not open');
    
    // Input validation
    validateId(competitionId, 'competitionId');
    
    this.db.run('DELETE FROM session_state WHERE competition_id = ?', [sanitizeId(competitionId)]);
    this.save();
  }

  // Competition CRUD
  public createCompetition(comp: Partial<Competition>): Competition {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = comp.id || uuidv4();

    this.db.run(`
      INSERT INTO competitions (id, title, date, weapon, gender, category, color, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, comp.title || 'Nouvelle compétition', comp.date?.toISOString() || now,
        comp.weapon || 'E', comp.gender || 'M', comp.category || 'SEN',
        comp.color || '#3B82F6', JSON.stringify(comp.settings || {}), now, now]);

    this.save();
    return this.getCompetition(id)!;
  }

  public getCompetition(id: string): Competition | null {
    if (!this.db) throw new Error('Database not open');
    const stmt = this.db.prepare('SELECT * FROM competitions WHERE id = ?');
    stmt.bind([id]);
    
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();

    return {
      id: row.id as string, title: row.title as string, shortTitle: row.short_title as string,
      date: new Date(row.date as string), location: row.location as string, organizer: row.organizer as string,
      weapon: row.weapon as Weapon, gender: row.gender as Gender, category: row.category as Category,
      championship: row.championship as string, color: row.color as string,
      currentPhaseIndex: row.current_phase_index as number, isTeamEvent: row.is_team_event === 1,
      status: row.status as any, settings: row.settings ? JSON.parse(row.settings as string) : {},
      fencers: [], referees: [], phases: [],
      createdAt: new Date(row.created_at as string), updatedAt: new Date(row.updated_at as string),
    };
  }

  public getAllCompetitions(): Competition[] {
    if (!this.db) throw new Error('Database not open');
    const results: Competition[] = [];
    const stmt = this.db.prepare('SELECT id FROM competitions ORDER BY date DESC');
    while (stmt.step()) {
      const comp = this.getCompetition(stmt.getAsObject().id as string);
      if (comp) results.push(comp);
    }
    stmt.free();
    return results;
  }

  public deleteCompetition(id: string): void {
    if (!this.db) throw new Error('Database not open');
    this.db.run('DELETE FROM fencers WHERE competition_id = ?', [id]);
    this.db.run('DELETE FROM competitions WHERE id = ?', [id]);
    this.save();
  }

  public updateCompetition(id: string, updates: Partial<Competition>): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    
    if (updates.title !== undefined)
      this.db.run('UPDATE competitions SET title = ?, updated_at = ? WHERE id = ?', [updates.title, now, id]);
    if (updates.date !== undefined)
      this.db.run('UPDATE competitions SET date = ?, updated_at = ? WHERE id = ?', [updates.date.toISOString(), now, id]);
    if (updates.location !== undefined)
      this.db.run('UPDATE competitions SET location = ?, updated_at = ? WHERE id = ?', [updates.location, now, id]);
    if (updates.organizer !== undefined)
      this.db.run('UPDATE competitions SET organizer = ?, updated_at = ? WHERE id = ?', [updates.organizer, now, id]);
    if (updates.weapon !== undefined)
      this.db.run('UPDATE competitions SET weapon = ?, updated_at = ? WHERE id = ?', [updates.weapon, now, id]);
    if (updates.gender !== undefined)
      this.db.run('UPDATE competitions SET gender = ?, updated_at = ? WHERE id = ?', [updates.gender, now, id]);
    if (updates.category !== undefined)
      this.db.run('UPDATE competitions SET category = ?, updated_at = ? WHERE id = ?', [updates.category, now, id]);
    if (updates.status !== undefined)
      this.db.run('UPDATE competitions SET status = ?, updated_at = ? WHERE id = ?', [updates.status, now, id]);
    if (updates.settings !== undefined)
      this.db.run('UPDATE competitions SET settings = ?, updated_at = ? WHERE id = ?', [JSON.stringify(updates.settings), now, id]);

    this.save();
  }

  // Fencer CRUD
  public addFencer(competitionId: string, fencer: Partial<Fencer>): Fencer {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = fencer.id || uuidv4();
    
    const maxRefStmt = this.db.prepare('SELECT MAX(ref) as m FROM fencers WHERE competition_id = ?');
    maxRefStmt.bind([competitionId]); maxRefStmt.step();
    const maxRef = (maxRefStmt.getAsObject().m as number) || 0;
    maxRefStmt.free();
    const ref = fencer.ref || maxRef + 1;

    this.db.run(`
      INSERT INTO fencers (id, competition_id, ref, last_name, first_name, gender, nationality, club, league, license, ranking, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, competitionId, ref, fencer.lastName || '', fencer.firstName || '',
        fencer.gender || 'M', fencer.nationality || 'FRA', fencer.club || null,
        fencer.league || null, fencer.license || null, fencer.ranking || null,
        fencer.status || 'N', now, now]);

    this.save();
    return this.getFencer(id)!;
  }

  public getFencer(id: string): Fencer | null {
    if (!this.db) throw new Error('Database not open');
    const stmt = this.db.prepare('SELECT * FROM fencers WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();

    return {
      id: row.id as string, ref: row.ref as number,
      lastName: row.last_name as string, firstName: row.first_name as string,
      birthDate: row.birth_date ? new Date(row.birth_date as string) : undefined,
      gender: row.gender as Gender, nationality: row.nationality as string,
      league: row.league as string, club: row.club as string, license: row.license as string,
      ranking: row.ranking as number, status: row.status as FencerStatus,
      seedNumber: row.seed_number as number, finalRanking: row.final_ranking as number,
      poolStats: row.pool_stats ? JSON.parse(row.pool_stats as string) : undefined,
      createdAt: new Date(row.created_at as string), updatedAt: new Date(row.updated_at as string),
    };
  }

  public getFencersByCompetition(competitionId: string): Fencer[] {
    if (!this.db) throw new Error('Database not open');
    const results: Fencer[] = [];
    const stmt = this.db.prepare('SELECT id FROM fencers WHERE competition_id = ? ORDER BY ref');
    stmt.bind([competitionId]);
    while (stmt.step()) {
      const fencer = this.getFencer(stmt.getAsObject().id as string);
      if (fencer) results.push(fencer);
    }
    stmt.free();
    return results;
  }

  public updateFencer(id: string, updates: Partial<Fencer>): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    if (updates.status !== undefined) 
      this.db.run('UPDATE fencers SET status = ?, updated_at = ? WHERE id = ?', [updates.status, now, id]);
    if (updates.ranking !== undefined) 
      this.db.run('UPDATE fencers SET ranking = ?, updated_at = ? WHERE id = ?', [updates.ranking, now, id]);
    this.save();
  }

  public deleteFencer(id: string): void {
    if (!this.db) throw new Error('Database not open');
    
    console.log('Tentative de suppression du tireur:', id);
    
    // Vérifier que le tireur existe
    const stmt = this.db.prepare('SELECT id, last_name FROM fencers WHERE id = ?');
    stmt.bind([id]);
    const row = stmt.getAsObject();
    const exists = stmt.step();
    stmt.free();
    
    if (!exists || !row) {
      console.error('Tireur non trouvé:', id);
      throw new Error(`Tireur avec l'ID ${id} non trouvé`);
    }
    
    console.log('Tireur trouvé pour suppression:', row.last_name);
    
    try {
      // Supprimer d'abord les associations pool_fencers
      const poolFencerResult = this.db.run('DELETE FROM pool_fencers WHERE fencer_id = ?', [id]);
      console.log('Associations pool_fencers supprimées:', poolFencerResult.changes);
      
      // Supprimer les matchs où ce tireur participe
      const matchResult = this.db.run('DELETE FROM matches WHERE fencer_a_id = ? OR fencer_b_id = ?', [id, id]);
      console.log('Matchs supprimés:', matchResult.changes);
      
      // Supprimer le tireur
      const result = this.db.run('DELETE FROM fencers WHERE id = ?', [id]);
      console.log('Tireur supprimé:', result.changes);
      
      // Vérifier que la suppression a réussi
      if (result.changes === 0) {
        throw new Error(`Échec de la suppression du tireur ${id}`);
      }
      
      this.save();
      console.log('Suppression du tireur terminée avec succès');
    } catch (error) {
      console.error('Erreur lors de la suppression du tireur:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur de base de données lors de la suppression du tireur: ${errorMessage}`);
    }
  }

  // Match CRUD
  public createMatch(match: Partial<Match>, poolId?: string): Match {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    const id = match.id || uuidv4();
    this.db.run(`INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, match.number || 1, poolId || null, match.fencerA?.id || null, match.fencerB?.id || null, match.maxScore || 5, 'not_started', now, now]);
    this.save();
    return this.getMatch(id)!;
  }

  public getMatch(id: string): Match | null {
    if (!this.db) throw new Error('Database not open');
    const stmt = this.db.prepare('SELECT * FROM matches WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    return {
      id: row.id as string, number: row.number as number,
      fencerA: row.fencer_a_id ? this.getFencer(row.fencer_a_id as string) : null,
      fencerB: row.fencer_b_id ? this.getFencer(row.fencer_b_id as string) : null,
      scoreA: row.score_a ? JSON.parse(row.score_a as string) : null,
      scoreB: row.score_b ? JSON.parse(row.score_b as string) : null,
      maxScore: row.max_score as number, status: row.status as MatchStatus,
      poolId: row.pool_id as string, tableId: row.table_id as string, round: row.round as number,
      createdAt: new Date(row.created_at as string), updatedAt: new Date(row.updated_at as string),
    };
  }

  public getMatchesByPool(poolId: string): Match[] {
    if (!this.db) throw new Error('Database not open');
    const results: Match[] = [];
    const stmt = this.db.prepare('SELECT id FROM matches WHERE pool_id = ? ORDER BY number');
    stmt.bind([poolId]);
    while (stmt.step()) {
      const match = this.getMatch(stmt.getAsObject().id as string);
      if (match) results.push(match);
    }
    stmt.free();
    return results;
  }

  public updateMatch(id: string, updates: Partial<Match>): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    if (updates.scoreA !== undefined) this.db.run('UPDATE matches SET score_a = ?, updated_at = ? WHERE id = ?', [JSON.stringify(updates.scoreA), now, id]);
    if (updates.scoreB !== undefined) this.db.run('UPDATE matches SET score_b = ?, updated_at = ? WHERE id = ?', [JSON.stringify(updates.scoreB), now, id]);
    if (updates.status !== undefined) this.db.run('UPDATE matches SET status = ?, updated_at = ? WHERE id = ?', [updates.status, now, id]);
    this.save();
  }

  public updatePool(pool: Pool): void {
    if (!this.db) throw new Error('Database not open');
    const now = new Date().toISOString();
    
    // Mettre à jour les informations de la poule
    this.db.run('UPDATE pools SET updated_at = ?, is_complete = ? WHERE id = ?', [
      now, 
      pool.isComplete ? 1 : 0, 
      pool.id
    ]);
    
    // Mettre à jour les matchs de la poule
    for (const match of pool.matches || []) {
      if (match.scoreA !== undefined || match.scoreB !== undefined || match.status !== undefined) {
        this.updateMatch(match.id, {
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          status: match.status
        });
      }
    }
    
    this.save();
  }

  // Export/Import
  public exportToFile(filepath: string): void {
    if (!this.db) throw new Error('Database not open');
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const tmpPath = filepath + '.tmp';
    try {
      fs.writeFileSync(tmpPath, buffer);
      try {
        fs.renameSync(tmpPath, filepath);
      } catch {
        fs.writeFileSync(filepath, buffer);
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    } catch (error) {
      // Fallback: écriture directe
      fs.writeFileSync(filepath, buffer);
    }
  }

  public async importFromFile(filepath: string): Promise<void> {
    this.close();
    this.dbPath = filepath;
    await this.open();
  }
}

export const db = new DatabaseManager();
