"use strict";
/**
 * BellePoule Modern - Database Layer (sql.js version)
 * Portable SQLite database using sql.js (pure JavaScript)
 * Licensed under GPL-3.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.DatabaseManager = void 0;
// @ts-ignore
const sql_js_1 = __importDefault(require("sql.js"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const uuid_1 = require("uuid");
const validation_1 = require("./validation");
let SQL = null;
class DatabaseManager {
    constructor(dbPath) {
        this.db = null;
        this.dbPath = dbPath || path.join(process.cwd(), 'bellepoule.db');
    }
    async open(dbPath) {
        if (dbPath)
            this.dbPath = dbPath;
        if (!SQL) {
            SQL = await (0, sql_js_1.default)();
        }
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        if (fs.existsSync(this.dbPath)) {
            const fileBuffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(fileBuffer);
        }
        else {
            this.db = new SQL.Database();
        }
        this.initializeTables();
        this.save();
    }
    close() {
        if (this.db) {
            this.save();
            this.db.close();
            this.db = null;
        }
    }
    save() {
        if (this.db) {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        }
    }
    forceSave() {
        this.save();
    }
    getPath() { return this.dbPath; }
    isOpen() { return this.db !== null; }
    initializeTables() {
        if (!this.db)
            throw new Error('Database not open');
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
        // Index pour les requêtes fréquentes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_fencers_competition ON fencers(competition_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_matches_pool ON matches(pool_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_pool_fencers_fencer ON pool_fencers(fencer_id)');
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
    saveSessionState(competitionId, state) {
        if (!this.db)
            throw new Error('Database not open');
        // Input validation
        (0, validation_1.validateId)(competitionId, 'competitionId');
        (0, validation_1.validateSessionState)(state);
        const now = new Date().toISOString();
        const stateJson = JSON.stringify(state);
        this.db.run(`
      INSERT OR REPLACE INTO session_state (competition_id, state_json, updated_at)
      VALUES (?, ?, ?)
    `, [(0, validation_1.sanitizeId)(competitionId), stateJson, now]);
        this.save();
    }
    getSessionState(competitionId) {
        if (!this.db)
            throw new Error('Database not open');
        // Input validation
        (0, validation_1.validateId)(competitionId, 'competitionId');
        const stmt = this.db.prepare('SELECT state_json FROM session_state WHERE competition_id = ?');
        stmt.bind([(0, validation_1.sanitizeId)(competitionId)]);
        if (!stmt.step()) {
            stmt.free();
            return null;
        }
        const row = stmt.getAsObject();
        stmt.free();
        try {
            return JSON.parse(row.state_json);
        }
        catch (e) {
            return null;
        }
    }
    clearSessionState(competitionId) {
        if (!this.db)
            throw new Error('Database not open');
        // Input validation
        (0, validation_1.validateId)(competitionId, 'competitionId');
        this.db.run('DELETE FROM session_state WHERE competition_id = ?', [(0, validation_1.sanitizeId)(competitionId)]);
        this.save();
    }
    // Competition CRUD
    createCompetition(comp) {
        if (!this.db)
            throw new Error('Database not open');
        const now = new Date().toISOString();
        const id = comp.id || (0, uuid_1.v4)();
        this.db.run(`
      INSERT INTO competitions (id, title, date, weapon, gender, category, color, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, comp.title || 'Nouvelle compétition', comp.date?.toISOString() || now,
            comp.weapon || 'E', comp.gender || 'M', comp.category || 'SEN',
            comp.color || '#3B82F6', JSON.stringify(comp.settings || {}), now, now]);
        this.save();
        return this.getCompetition(id);
    }
    getCompetition(id) {
        if (!this.db)
            throw new Error('Database not open');
        const stmt = this.db.prepare('SELECT * FROM competitions WHERE id = ?');
        stmt.bind([id]);
        if (!stmt.step()) {
            stmt.free();
            return null;
        }
        const row = stmt.getAsObject();
        stmt.free();
        return {
            id: row.id, title: row.title, shortTitle: row.short_title,
            date: new Date(row.date), location: row.location, organizer: row.organizer,
            weapon: row.weapon, gender: row.gender, category: row.category,
            championship: row.championship, color: row.color,
            currentPhaseIndex: row.current_phase_index, isTeamEvent: row.is_team_event === 1,
            status: row.status, settings: row.settings ? JSON.parse(row.settings) : {},
            fencers: [], referees: [], phases: [],
            createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
        };
    }
    getAllCompetitions() {
        if (!this.db)
            throw new Error('Database not open');
        const results = [];
        const stmt = this.db.prepare('SELECT id FROM competitions ORDER BY date DESC');
        while (stmt.step()) {
            const comp = this.getCompetition(stmt.getAsObject().id);
            if (comp)
                results.push(comp);
        }
        stmt.free();
        return results;
    }
    deleteCompetition(id) {
        if (!this.db)
            throw new Error('Database not open');
        // Supprimer les associations pool_fencers pour éviter les enregistrements orphelins
        this.db.run('DELETE FROM pool_fencers WHERE fencer_id IN (SELECT id FROM fencers WHERE competition_id = ?)', [id]);
        this.db.run('DELETE FROM matches WHERE pool_id IN (SELECT id FROM pools WHERE phase_id LIKE ?)', [`%${id}%`]);
        this.db.run('DELETE FROM pools WHERE phase_id LIKE ?', [`%${id}%`]);
        this.db.run('DELETE FROM session_state WHERE competition_id = ?', [id]);
        this.db.run('DELETE FROM fencers WHERE competition_id = ?', [id]);
        this.db.run('DELETE FROM competitions WHERE id = ?', [id]);
        this.save();
    }
    updateCompetition(id, updates) {
        if (!this.db)
            throw new Error('Database not open');
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
        this.save();
    }
    // Fencer CRUD
    addFencer(competitionId, fencer) {
        if (!this.db)
            throw new Error('Database not open');
        const now = new Date().toISOString();
        const id = fencer.id || (0, uuid_1.v4)();
        const maxRefStmt = this.db.prepare('SELECT MAX(ref) as m FROM fencers WHERE competition_id = ?');
        maxRefStmt.bind([competitionId]);
        maxRefStmt.step();
        const maxRef = maxRefStmt.getAsObject().m || 0;
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
        return this.getFencer(id);
    }
    getFencer(id) {
        if (!this.db)
            throw new Error('Database not open');
        const stmt = this.db.prepare('SELECT * FROM fencers WHERE id = ?');
        stmt.bind([id]);
        if (!stmt.step()) {
            stmt.free();
            return null;
        }
        const row = stmt.getAsObject();
        stmt.free();
        return {
            id: row.id, ref: row.ref,
            lastName: row.last_name, firstName: row.first_name,
            birthDate: row.birth_date ? new Date(row.birth_date) : undefined,
            gender: row.gender, nationality: row.nationality,
            league: row.league, club: row.club, license: row.license,
            ranking: row.ranking, status: row.status,
            seedNumber: row.seed_number, finalRanking: row.final_ranking,
            poolStats: row.pool_stats ? JSON.parse(row.pool_stats) : undefined,
            createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
        };
    }
    getFencersByCompetition(competitionId) {
        if (!this.db)
            throw new Error('Database not open');
        const results = [];
        const stmt = this.db.prepare('SELECT id FROM fencers WHERE competition_id = ? ORDER BY ref');
        stmt.bind([competitionId]);
        while (stmt.step()) {
            const fencer = this.getFencer(stmt.getAsObject().id);
            if (fencer)
                results.push(fencer);
        }
        stmt.free();
        return results;
    }
    updateFencer(id, updates) {
        if (!this.db)
            throw new Error('Database not open');
        const now = new Date().toISOString();
        if (updates.status !== undefined)
            this.db.run('UPDATE fencers SET status = ?, updated_at = ? WHERE id = ?', [updates.status, now, id]);
        if (updates.ranking !== undefined)
            this.db.run('UPDATE fencers SET ranking = ?, updated_at = ? WHERE id = ?', [updates.ranking, now, id]);
        this.save();
    }
    deleteFencer(id) {
        if (!this.db)
            throw new Error('Database not open');
        console.log('Tentative de suppression du tireur:', id);
        // Vérifier que le tireur existe
        const stmt = this.db.prepare('SELECT id, last_name FROM fencers WHERE id = ?');
        stmt.bind([id]);
        const exists = stmt.step();
        const row = exists ? stmt.getAsObject() : null;
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
        }
        catch (error) {
            console.error('Erreur lors de la suppression du tireur:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Erreur de base de données lors de la suppression du tireur: ${errorMessage}`);
        }
    }
    // Match CRUD
    createMatch(match, poolId) {
        if (!this.db)
            throw new Error('Database not open');
        const now = new Date().toISOString();
        const id = match.id || (0, uuid_1.v4)();
        this.db.run(`INSERT INTO matches (id, number, pool_id, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, match.number || 1, poolId || null, match.fencerA?.id || null, match.fencerB?.id || null, match.maxScore || 5, 'not_started', now, now]);
        this.save();
        return this.getMatch(id);
    }
    getMatch(id) {
        if (!this.db)
            throw new Error('Database not open');
        const stmt = this.db.prepare('SELECT * FROM matches WHERE id = ?');
        stmt.bind([id]);
        if (!stmt.step()) {
            stmt.free();
            return null;
        }
        const row = stmt.getAsObject();
        stmt.free();
        return {
            id: row.id, number: row.number,
            fencerA: row.fencer_a_id ? this.getFencer(row.fencer_a_id) : null,
            fencerB: row.fencer_b_id ? this.getFencer(row.fencer_b_id) : null,
            scoreA: row.score_a ? (() => { try {
                return JSON.parse(row.score_a);
            }
            catch {
                return null;
            } })() : null,
            scoreB: row.score_b ? (() => { try {
                return JSON.parse(row.score_b);
            }
            catch {
                return null;
            } })() : null,
            maxScore: row.max_score, status: row.status,
            poolId: row.pool_id, tableId: row.table_id, round: row.round,
            createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
        };
    }
    getMatchesByPool(poolId) {
        if (!this.db)
            throw new Error('Database not open');
        const results = [];
        const stmt = this.db.prepare('SELECT id FROM matches WHERE pool_id = ? ORDER BY number');
        stmt.bind([poolId]);
        while (stmt.step()) {
            const match = this.getMatch(stmt.getAsObject().id);
            if (match)
                results.push(match);
        }
        stmt.free();
        return results;
    }
    updateMatch(id, updates) {
        if (!this.db)
            throw new Error('Database not open');
        const now = new Date().toISOString();
        if (updates.scoreA !== undefined)
            this.db.run('UPDATE matches SET score_a = ?, updated_at = ? WHERE id = ?', [JSON.stringify(updates.scoreA), now, id]);
        if (updates.scoreB !== undefined)
            this.db.run('UPDATE matches SET score_b = ?, updated_at = ? WHERE id = ?', [JSON.stringify(updates.scoreB), now, id]);
        if (updates.status !== undefined)
            this.db.run('UPDATE matches SET status = ?, updated_at = ? WHERE id = ?', [updates.status, now, id]);
        this.save();
    }
    updatePool(pool) {
        if (!this.db)
            throw new Error('Database not open');
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
    exportToFile(filepath) {
        if (!this.db)
            throw new Error('Database not open');
        const data = this.db.export();
        fs.writeFileSync(filepath, Buffer.from(data));
    }
    async importFromFile(filepath) {
        this.close();
        this.dbPath = filepath;
        await this.open();
    }
}
exports.DatabaseManager = DatabaseManager;
exports.db = new DatabaseManager();
//# sourceMappingURL=index.js.map