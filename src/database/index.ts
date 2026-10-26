/**
 * BellePoule Modern - Database Layer (better-sqlite3)
 * Native SQLite binding — synchronous, 10-50× faster than sql.js at startup.
 * Licensed under GPL-3.0
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { keepOnlyCompetition, mergeAttachedDatabase } from './competitionArchive';
import { MigrationManager } from './migrations';
import { SignatureRepo } from './repos/signatureRepo';
import { SessionRepo } from './repos/sessionRepo';
import { CompetitionRepo } from './repos/competitionRepo';
import { FencerRepo } from './repos/fencerRepo';
import { MatchRepo } from './repos/matchRepo';
import { PoolRepo } from './repos/poolRepo';
import { RefereeRepo } from './repos/refereeRepo';
import { TeamRepo } from './repos/teamRepo';
import type { SqlExecutor } from './repos/sqlExecutor';
import { ALL_MIGRATIONS } from './migrations/migrations';

export { safeJsonParse } from './repos/dbUtils';

// Taille max du cache de statements : les requêtes `IN (?,?,…)` à arité variable
// créeraient sinon une entrée par taille, sans borne (#1007).
const STMT_CACHE_MAX = 500;

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  // Cache des prepared statements : évite de re-parser le SQL à chaque appel.
  // SQLite re-prépare automatiquement un statement si le schéma change.
  private stmtCache = new Map<string, Database.Statement>();
  // Accès SQL partagé par les dépôts par domaine (repos/, #1242) : le cycle de vie reste ici
  private readonly sql: SqlExecutor = ((m: DatabaseManager): SqlExecutor => ({
    get db() {
      return m.db;
    },
    run: (sql, params) => m.run(sql, params),
    queryOne: (sql, params) => m.queryOne(sql, params),
    queryAll: (sql, params) => m.queryAll(sql, params),
    transaction: fn => m.inTransaction(fn),
  }))(this);
  private readonly signatures = new SignatureRepo(this.sql);
  private readonly sessions = new SessionRepo(this.sql);
  private readonly competitions = new CompetitionRepo(this.sql);
  private readonly fencers = new FencerRepo(this.sql);
  private readonly matches = new MatchRepo(this.sql, this);
  private readonly pools = new PoolRepo(this.sql, this);
  private readonly referees = new RefereeRepo(this.sql);
  private readonly teams = new TeamRepo(this.sql);

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
    // WAL + NORMAL : durable au crash applicatif, nettement moins de fsync que FULL
    this.db.pragma('synchronous = NORMAL');
    // Attente plutôt qu'un SQLITE_BUSY immédiat en cas de contention (checkpoint, backup)
    this.db.pragma('busy_timeout = 5000');
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
    if (stmt) {
      // LRU : ré-insertion en fin de Map
      this.stmtCache.delete(sql);
    } else {
      stmt = this.db!.prepare(sql);
      if (this.stmtCache.size >= STMT_CACHE_MAX) {
        const oldest = this.stmtCache.keys().next().value;
        if (oldest !== undefined) this.stmtCache.delete(oldest);
      }
    }
    this.stmtCache.set(sql, stmt);
    return stmt;
  }

  // Abonnés aux écritures (le serveur distant pousse « données modifiées » aux kiosques, #1152)
  private changeListeners = new Set<() => void>();

  /** S'abonne aux écritures ; renvoie la fonction de désabonnement */
  public onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notifyChange(): void {
    for (const fn of this.changeListeners) {
      try {
        fn();
      } catch {
        /* un abonné défaillant ne doit pas bloquer l'écriture */
      }
    }
  }

  private run(sql: string, params: unknown[] = []): Database.RunResult {
    const result = this.prepare(sql).run(...params);
    this.notifyChange();
    return result;
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

  // ── État de session (session_state) et état des arènes (arena_state) : voir repos/sessionRepo.ts ──
  public saveSessionState(
    ...args: Parameters<SessionRepo['saveSessionState']>
  ): ReturnType<SessionRepo['saveSessionState']> {
    return this.sessions.saveSessionState(...args);
  }

  public getSessionState(
    ...args: Parameters<SessionRepo['getSessionState']>
  ): ReturnType<SessionRepo['getSessionState']> {
    return this.sessions.getSessionState(...args);
  }

  public clearSessionState(
    ...args: Parameters<SessionRepo['clearSessionState']>
  ): ReturnType<SessionRepo['clearSessionState']> {
    return this.sessions.clearSessionState(...args);
  }

  public saveArenaState(
    ...args: Parameters<SessionRepo['saveArenaState']>
  ): ReturnType<SessionRepo['saveArenaState']> {
    return this.sessions.saveArenaState(...args);
  }

  public getArenaState(
    ...args: Parameters<SessionRepo['getArenaState']>
  ): ReturnType<SessionRepo['getArenaState']> {
    return this.sessions.getArenaState(...args);
  }

  public getArenaStatesByCompetition(
    ...args: Parameters<SessionRepo['getArenaStatesByCompetition']>
  ): ReturnType<SessionRepo['getArenaStatesByCompetition']> {
    return this.sessions.getArenaStatesByCompetition(...args);
  }

  public clearArenaStates(
    ...args: Parameters<SessionRepo['clearArenaStates']>
  ): ReturnType<SessionRepo['clearArenaStates']> {
    return this.sessions.clearArenaStates(...args);
  }

  // ── Compétitions, phases et classement saisonnier Quest : voir repos/competitionRepo.ts ──
  public createCompetition(
    ...args: Parameters<CompetitionRepo['createCompetition']>
  ): ReturnType<CompetitionRepo['createCompetition']> {
    return this.competitions.createCompetition(...args);
  }

  public getCompetition(
    ...args: Parameters<CompetitionRepo['getCompetition']>
  ): ReturnType<CompetitionRepo['getCompetition']> {
    return this.competitions.getCompetition(...args);
  }

  public getAllCompetitions(
    ...args: Parameters<CompetitionRepo['getAllCompetitions']>
  ): ReturnType<CompetitionRepo['getAllCompetitions']> {
    return this.competitions.getAllCompetitions(...args);
  }

  public deleteCompetition(
    ...args: Parameters<CompetitionRepo['deleteCompetition']>
  ): ReturnType<CompetitionRepo['deleteCompetition']> {
    return this.competitions.deleteCompetition(...args);
  }

  public updateCompetition(
    ...args: Parameters<CompetitionRepo['updateCompetition']>
  ): ReturnType<CompetitionRepo['updateCompetition']> {
    return this.competitions.updateCompetition(...args);
  }

  public createPhase(
    ...args: Parameters<CompetitionRepo['createPhase']>
  ): ReturnType<CompetitionRepo['createPhase']> {
    return this.competitions.createPhase(...args);
  }

  public getPhase(
    ...args: Parameters<CompetitionRepo['getPhase']>
  ): ReturnType<CompetitionRepo['getPhase']> {
    return this.competitions.getPhase(...args);
  }

  public getPhasesByCompetition(
    ...args: Parameters<CompetitionRepo['getPhasesByCompetition']>
  ): ReturnType<CompetitionRepo['getPhasesByCompetition']> {
    return this.competitions.getPhasesByCompetition(...args);
  }

  public updatePhase(
    ...args: Parameters<CompetitionRepo['updatePhase']>
  ): ReturnType<CompetitionRepo['updatePhase']> {
    return this.competitions.updatePhase(...args);
  }

  public deletePhase(
    ...args: Parameters<CompetitionRepo['deletePhase']>
  ): ReturnType<CompetitionRepo['deletePhase']> {
    return this.competitions.deletePhase(...args);
  }

  public addCompetitionToSeason(
    ...args: Parameters<CompetitionRepo['addCompetitionToSeason']>
  ): ReturnType<CompetitionRepo['addCompetitionToSeason']> {
    return this.competitions.addCompetitionToSeason(...args);
  }

  public getSeasonRanking(
    ...args: Parameters<CompetitionRepo['getSeasonRanking']>
  ): ReturnType<CompetitionRepo['getSeasonRanking']> {
    return this.competitions.getSeasonRanking(...args);
  }

  public getSeasonCompetitions(
    ...args: Parameters<CompetitionRepo['getSeasonCompetitions']>
  ): ReturnType<CompetitionRepo['getSeasonCompetitions']> {
    return this.competitions.getSeasonCompetitions(...args);
  }

  public removeCompetitionFromSeason(
    ...args: Parameters<CompetitionRepo['removeCompetitionFromSeason']>
  ): ReturnType<CompetitionRepo['removeCompetitionFromSeason']> {
    return this.competitions.removeCompetitionFromSeason(...args);
  }

  public resetSeason(
    ...args: Parameters<CompetitionRepo['resetSeason']>
  ): ReturnType<CompetitionRepo['resetSeason']> {
    return this.competitions.resetSeason(...args);
  }

  // ── Tireurs : CRUD, photos, historique, statistiques, instantanés d'abandon : voir repos/fencerRepo.ts ──
  public addFencer(
    ...args: Parameters<FencerRepo['addFencer']>
  ): ReturnType<FencerRepo['addFencer']> {
    return this.fencers.addFencer(...args);
  }

  public getFencer(
    ...args: Parameters<FencerRepo['getFencer']>
  ): ReturnType<FencerRepo['getFencer']> {
    return this.fencers.getFencer(...args);
  }

  public getFencersByCompetition(
    ...args: Parameters<FencerRepo['getFencersByCompetition']>
  ): ReturnType<FencerRepo['getFencersByCompetition']> {
    return this.fencers.getFencersByCompetition(...args);
  }

  public getFencerPhotos(
    ...args: Parameters<FencerRepo['getFencerPhotos']>
  ): ReturnType<FencerRepo['getFencerPhotos']> {
    return this.fencers.getFencerPhotos(...args);
  }

  public updateFencerPhotosByLicense(
    ...args: Parameters<FencerRepo['updateFencerPhotosByLicense']>
  ): ReturnType<FencerRepo['updateFencerPhotosByLicense']> {
    return this.fencers.updateFencerPhotosByLicense(...args);
  }

  public upsertFencersByLicense(
    ...args: Parameters<FencerRepo['upsertFencersByLicense']>
  ): ReturnType<FencerRepo['upsertFencersByLicense']> {
    return this.fencers.upsertFencersByLicense(...args);
  }

  public updateFencer(
    ...args: Parameters<FencerRepo['updateFencer']>
  ): ReturnType<FencerRepo['updateFencer']> {
    return this.fencers.updateFencer(...args);
  }

  public deleteFencer(
    ...args: Parameters<FencerRepo['deleteFencer']>
  ): ReturnType<FencerRepo['deleteFencer']> {
    return this.fencers.deleteFencer(...args);
  }

  public deleteAllFencers(
    ...args: Parameters<FencerRepo['deleteAllFencers']>
  ): ReturnType<FencerRepo['deleteAllFencers']> {
    return this.fencers.deleteAllFencers(...args);
  }

  public getFencerHistory(
    ...args: Parameters<FencerRepo['getFencerHistory']>
  ): ReturnType<FencerRepo['getFencerHistory']> {
    return this.fencers.getFencerHistory(...args);
  }

  public getFencerCompetitionStats(
    ...args: Parameters<FencerRepo['getFencerCompetitionStats']>
  ): ReturnType<FencerRepo['getFencerCompetitionStats']> {
    return this.fencers.getFencerCompetitionStats(...args);
  }

  public getCompetitionFencerStats(
    ...args: Parameters<FencerRepo['getCompetitionFencerStats']>
  ): ReturnType<FencerRepo['getCompetitionFencerStats']> {
    return this.fencers.getCompetitionFencerStats(...args);
  }

  public saveAbandonSnapshot(
    ...args: Parameters<FencerRepo['saveAbandonSnapshot']>
  ): ReturnType<FencerRepo['saveAbandonSnapshot']> {
    return this.fencers.saveAbandonSnapshot(...args);
  }

  public getAbandonSnapshot(
    ...args: Parameters<FencerRepo['getAbandonSnapshot']>
  ): ReturnType<FencerRepo['getAbandonSnapshot']> {
    return this.fencers.getAbandonSnapshot(...args);
  }

  public deleteAbandonSnapshot(
    ...args: Parameters<FencerRepo['deleteAbandonSnapshot']>
  ): ReturnType<FencerRepo['deleteAbandonSnapshot']> {
    return this.fencers.deleteAbandonSnapshot(...args);
  }

  // ── Matchs (poules + tableau), touches, cartons, arbre, journal des scores et chronologie : voir repos/matchRepo.ts ──
  public createMatch(
    ...args: Parameters<MatchRepo['createMatch']>
  ): ReturnType<MatchRepo['createMatch']> {
    return this.matches.createMatch(...args);
  }

  public upsertMultipleTableauMatches(
    ...args: Parameters<MatchRepo['upsertMultipleTableauMatches']>
  ): ReturnType<MatchRepo['upsertMultipleTableauMatches']> {
    return this.matches.upsertMultipleTableauMatches(...args);
  }

  public upsertTableauMatch(
    ...args: Parameters<MatchRepo['upsertTableauMatch']>
  ): ReturnType<MatchRepo['upsertTableauMatch']> {
    return this.matches.upsertTableauMatch(...args);
  }

  public getTableauMatchesForExport(
    ...args: Parameters<MatchRepo['getTableauMatchesForExport']>
  ): ReturnType<MatchRepo['getTableauMatchesForExport']> {
    return this.matches.getTableauMatchesForExport(...args);
  }

  public getMatch(...args: Parameters<MatchRepo['getMatch']>): ReturnType<MatchRepo['getMatch']> {
    return this.matches.getMatch(...args);
  }

  public getMatchesByPool(
    ...args: Parameters<MatchRepo['getMatchesByPool']>
  ): ReturnType<MatchRepo['getMatchesByPool']> {
    return this.matches.getMatchesByPool(...args);
  }

  public getPendingMatches(
    ...args: Parameters<MatchRepo['getPendingMatches']>
  ): ReturnType<MatchRepo['getPendingMatches']> {
    return this.matches.getPendingMatches(...args);
  }

  public getAllPendingMatchesFromPools(
    ...args: Parameters<MatchRepo['getAllPendingMatchesFromPools']>
  ): ReturnType<MatchRepo['getAllPendingMatchesFromPools']> {
    return this.matches.getAllPendingMatchesFromPools(...args);
  }

  public getPendingMatchesDirectly(
    ...args: Parameters<MatchRepo['getPendingMatchesDirectly']>
  ): ReturnType<MatchRepo['getPendingMatchesDirectly']> {
    return this.matches.getPendingMatchesDirectly(...args);
  }

  public updateMatch(
    ...args: Parameters<MatchRepo['updateMatch']>
  ): ReturnType<MatchRepo['updateMatch']> {
    return this.matches.updateMatch(...args);
  }

  public getTouches(
    ...args: Parameters<MatchRepo['getTouches']>
  ): ReturnType<MatchRepo['getTouches']> {
    return this.matches.getTouches(...args);
  }

  public getCards(...args: Parameters<MatchRepo['getCards']>): ReturnType<MatchRepo['getCards']> {
    return this.matches.getCards(...args);
  }

  public saveTouch(
    ...args: Parameters<MatchRepo['saveTouch']>
  ): ReturnType<MatchRepo['saveTouch']> {
    return this.matches.saveTouch(...args);
  }

  public saveCard(...args: Parameters<MatchRepo['saveCard']>): ReturnType<MatchRepo['saveCard']> {
    return this.matches.saveCard(...args);
  }

  public updateMatchTiming(
    ...args: Parameters<MatchRepo['updateMatchTiming']>
  ): ReturnType<MatchRepo['updateMatchTiming']> {
    return this.matches.updateMatchTiming(...args);
  }

  public saveArenaExit(
    ...args: Parameters<MatchRepo['saveArenaExit']>
  ): ReturnType<MatchRepo['saveArenaExit']> {
    return this.matches.saveArenaExit(...args);
  }

  public upsertBracketNode(
    ...args: Parameters<MatchRepo['upsertBracketNode']>
  ): ReturnType<MatchRepo['upsertBracketNode']> {
    return this.matches.upsertBracketNode(...args);
  }

  public getBracketNodes(
    ...args: Parameters<MatchRepo['getBracketNodes']>
  ): ReturnType<MatchRepo['getBracketNodes']> {
    return this.matches.getBracketNodes(...args);
  }

  public clearBracket(
    ...args: Parameters<MatchRepo['clearBracket']>
  ): ReturnType<MatchRepo['clearBracket']> {
    return this.matches.clearBracket(...args);
  }

  public logScoreChange(
    ...args: Parameters<MatchRepo['logScoreChange']>
  ): ReturnType<MatchRepo['logScoreChange']> {
    return this.matches.logScoreChange(...args);
  }

  public getScoreAuditLog(
    ...args: Parameters<MatchRepo['getScoreAuditLog']>
  ): ReturnType<MatchRepo['getScoreAuditLog']> {
    return this.matches.getScoreAuditLog(...args);
  }

  public getScoreAuditLogByCompetition(
    ...args: Parameters<MatchRepo['getScoreAuditLogByCompetition']>
  ): ReturnType<MatchRepo['getScoreAuditLogByCompetition']> {
    return this.matches.getScoreAuditLogByCompetition(...args);
  }

  public getMatchTimeline(
    ...args: Parameters<MatchRepo['getMatchTimeline']>
  ): ReturnType<MatchRepo['getMatchTimeline']> {
    return this.matches.getMatchTimeline(...args);
  }

  public getCompetitionTimeline(
    ...args: Parameters<MatchRepo['getCompetitionTimeline']>
  ): ReturnType<MatchRepo['getCompetitionTimeline']> {
    return this.matches.getCompetitionTimeline(...args);
  }

  // ── Poules : composition, arbitres, instantanés : voir repos/poolRepo.ts ──
  public getPoolFencers(
    ...args: Parameters<PoolRepo['getPoolFencers']>
  ): ReturnType<PoolRepo['getPoolFencers']> {
    return this.pools.getPoolFencers(...args);
  }

  public getCompetitionPools(
    ...args: Parameters<PoolRepo['getCompetitionPools']>
  ): ReturnType<PoolRepo['getCompetitionPools']> {
    return this.pools.getCompetitionPools(...args);
  }

  public getPoolCount(
    ...args: Parameters<PoolRepo['getPoolCount']>
  ): ReturnType<PoolRepo['getPoolCount']> {
    return this.pools.getPoolCount(...args);
  }

  public updatePool(
    ...args: Parameters<PoolRepo['updatePool']>
  ): ReturnType<PoolRepo['updatePool']> {
    return this.pools.updatePool(...args);
  }

  public updatePoolReferee(
    ...args: Parameters<PoolRepo['updatePoolReferee']>
  ): ReturnType<PoolRepo['updatePoolReferee']> {
    return this.pools.updatePoolReferee(...args);
  }

  public updatePoolReferees(
    ...args: Parameters<PoolRepo['updatePoolReferees']>
  ): ReturnType<PoolRepo['updatePoolReferees']> {
    return this.pools.updatePoolReferees(...args);
  }

  public clearPoolsForPhase(
    ...args: Parameters<PoolRepo['clearPoolsForPhase']>
  ): ReturnType<PoolRepo['clearPoolsForPhase']> {
    return this.pools.clearPoolsForPhase(...args);
  }

  public createPool(
    ...args: Parameters<PoolRepo['createPool']>
  ): ReturnType<PoolRepo['createPool']> {
    return this.pools.createPool(...args);
  }

  public addFencerToPool(
    ...args: Parameters<PoolRepo['addFencerToPool']>
  ): ReturnType<PoolRepo['addFencerToPool']> {
    return this.pools.addFencerToPool(...args);
  }

  public syncPoolSnapshot(
    ...args: Parameters<PoolRepo['syncPoolSnapshot']>
  ): ReturnType<PoolRepo['syncPoolSnapshot']> {
    return this.pools.syncPoolSnapshot(...args);
  }

  public getPoolsByPhase(
    ...args: Parameters<PoolRepo['getPoolsByPhase']>
  ): ReturnType<PoolRepo['getPoolsByPhase']> {
    return this.pools.getPoolsByPhase(...args);
  }

  // ── Arbitres, statistiques d'arbitrage et commentaires des formateurs : voir repos/refereeRepo.ts ──
  public createReferee(
    ...args: Parameters<RefereeRepo['createReferee']>
  ): ReturnType<RefereeRepo['createReferee']> {
    return this.referees.createReferee(...args);
  }

  public getReferee(
    ...args: Parameters<RefereeRepo['getReferee']>
  ): ReturnType<RefereeRepo['getReferee']> {
    return this.referees.getReferee(...args);
  }

  public getRefereesByCompetition(
    ...args: Parameters<RefereeRepo['getRefereesByCompetition']>
  ): ReturnType<RefereeRepo['getRefereesByCompetition']> {
    return this.referees.getRefereesByCompetition(...args);
  }

  public updateReferee(
    ...args: Parameters<RefereeRepo['updateReferee']>
  ): ReturnType<RefereeRepo['updateReferee']> {
    return this.referees.updateReferee(...args);
  }

  public deleteReferee(
    ...args: Parameters<RefereeRepo['deleteReferee']>
  ): ReturnType<RefereeRepo['deleteReferee']> {
    return this.referees.deleteReferee(...args);
  }

  public getMatchesWithReferees(
    ...args: Parameters<RefereeRepo['getMatchesWithReferees']>
  ): ReturnType<RefereeRepo['getMatchesWithReferees']> {
    return this.referees.getMatchesWithReferees(...args);
  }

  public getRefereeStats(
    ...args: Parameters<RefereeRepo['getRefereeStats']>
  ): ReturnType<RefereeRepo['getRefereeStats']> {
    return this.referees.getRefereeStats(...args);
  }

  public addRefereeComment(
    ...args: Parameters<RefereeRepo['addRefereeComment']>
  ): ReturnType<RefereeRepo['addRefereeComment']> {
    return this.referees.addRefereeComment(...args);
  }

  public getRefereeComments(
    ...args: Parameters<RefereeRepo['getRefereeComments']>
  ): ReturnType<RefereeRepo['getRefereeComments']> {
    return this.referees.getRefereeComments(...args);
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

  /** Exporte une seule compétition (état d'avancement compris) dans un .bpm (#1117) */
  public async exportCompetitionToFile(competitionId: string, filepath: string): Promise<void> {
    if (!this.db) throw new Error('Database not open');
    await this.db.backup(filepath);
    const copy = new Database(filepath);
    try {
      // Fichier autonome (pas de -wal à côté)
      copy.pragma('journal_mode = DELETE');
      keepOnlyCompetition(copy, competitionId);
      copy.exec('VACUUM');
    } finally {
      copy.close();
    }
  }

  /**
   * Ouvre un .bpm : fusionne ses compétitions dans la base active (#1117).
   * Le fichier est copié puis migré à part : l'original n'est pas modifié.
   * Renvoie les identifiants des compétitions importées.
   */
  public async mergeFromFile(filepath: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not open');
    const tmp = path.join(
      path.dirname(this.dbPath),
      `.import-${Date.now()}-${Math.random().toString(36).slice(2)}.bpm`
    );
    await fs.promises.copyFile(filepath, tmp);
    try {
      const source = new DatabaseManager(tmp);
      await source.open();
      source.close();
      this.db.prepare('ATTACH DATABASE ? AS bpm_import').run(tmp);
      try {
        return mergeAttachedDatabase(this.db, 'bpm_import', id => this.deleteCompetition(id));
      } finally {
        this.db.exec('DETACH DATABASE bpm_import');
      }
    } finally {
      for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) {
        await fs.promises.unlink(f).catch(() => undefined);
      }
    }
  }

  // ── Signatures (poules + matchs de tableau) : voir repos/signatureRepo.ts ──
  public savePoolSignature(poolId: string, fencerId: string, signatureData: string): void {
    if (!this.db) throw new Error('Database not open');
    this.signatures.savePool(poolId, fencerId, signatureData);
  }

  public getPoolSignatures(poolId: string): { fencerId: string; signatureData: string }[] {
    if (!this.db) throw new Error('Database not open');
    return this.signatures.getPool(poolId);
  }

  public saveDEMatchSignature(matchId: string, fencerId: string, signatureData: string): void {
    if (!this.db) throw new Error('Database not open');
    this.signatures.saveDEMatch(matchId, fencerId, signatureData);
  }

  public getDEMatchSignatures(matchId: string): { fencerId: string; signatureData: string }[] {
    if (!this.db) throw new Error('Database not open');
    return this.signatures.getDEMatch(matchId);
  }

  /** Signatures de tableau pour un ensemble de matchs (pour export PDF). */
  public getDEMatchSignaturesByMatchIds(
    matchIds: string[]
  ): { matchId: string; fencerId: string; signatureData: string }[] {
    if (!this.db) throw new Error('Database not open');
    return this.signatures.getDEMatchesByIds(matchIds);
  }

  // ── Équipes, rencontres, assauts et cartons par équipe : voir repos/teamRepo.ts ──
  public createTeam(
    ...args: Parameters<TeamRepo['createTeam']>
  ): ReturnType<TeamRepo['createTeam']> {
    return this.teams.createTeam(...args);
  }

  public getTeamsByCompetition(
    ...args: Parameters<TeamRepo['getTeamsByCompetition']>
  ): ReturnType<TeamRepo['getTeamsByCompetition']> {
    return this.teams.getTeamsByCompetition(...args);
  }

  public deleteTeam(
    ...args: Parameters<TeamRepo['deleteTeam']>
  ): ReturnType<TeamRepo['deleteTeam']> {
    return this.teams.deleteTeam(...args);
  }

  public upsertTeamFencer(
    ...args: Parameters<TeamRepo['upsertTeamFencer']>
  ): ReturnType<TeamRepo['upsertTeamFencer']> {
    return this.teams.upsertTeamFencer(...args);
  }

  public removeTeamFencer(
    ...args: Parameters<TeamRepo['removeTeamFencer']>
  ): ReturnType<TeamRepo['removeTeamFencer']> {
    return this.teams.removeTeamFencer(...args);
  }

  public createTeamMatch(
    ...args: Parameters<TeamRepo['createTeamMatch']>
  ): ReturnType<TeamRepo['createTeamMatch']> {
    return this.teams.createTeamMatch(...args);
  }

  public createTeamTableauMatch(
    ...args: Parameters<TeamRepo['createTeamTableauMatch']>
  ): ReturnType<TeamRepo['createTeamTableauMatch']> {
    return this.teams.createTeamTableauMatch(...args);
  }

  public getTeamTableauMatches(
    ...args: Parameters<TeamRepo['getTeamTableauMatches']>
  ): ReturnType<TeamRepo['getTeamTableauMatches']> {
    return this.teams.getTeamTableauMatches(...args);
  }

  public getTeamMatchesByCompetition(
    ...args: Parameters<TeamRepo['getTeamMatchesByCompetition']>
  ): ReturnType<TeamRepo['getTeamMatchesByCompetition']> {
    return this.teams.getTeamMatchesByCompetition(...args);
  }

  public createTeamBout(
    ...args: Parameters<TeamRepo['createTeamBout']>
  ): ReturnType<TeamRepo['createTeamBout']> {
    return this.teams.createTeamBout(...args);
  }

  public updateTeamBout(
    ...args: Parameters<TeamRepo['updateTeamBout']>
  ): ReturnType<TeamRepo['updateTeamBout']> {
    return this.teams.updateTeamBout(...args);
  }

  public createTeamMatchCard(
    ...args: Parameters<TeamRepo['createTeamMatchCard']>
  ): ReturnType<TeamRepo['createTeamMatchCard']> {
    return this.teams.createTeamMatchCard(...args);
  }

  public createTeamBoutCard(
    ...args: Parameters<TeamRepo['createTeamBoutCard']>
  ): ReturnType<TeamRepo['createTeamBoutCard']> {
    return this.teams.createTeamBoutCard(...args);
  }

  public getTeamBoutCards(
    ...args: Parameters<TeamRepo['getTeamBoutCards']>
  ): ReturnType<TeamRepo['getTeamBoutCards']> {
    return this.teams.getTeamBoutCards(...args);
  }

  public getTeamMatchCards(
    ...args: Parameters<TeamRepo['getTeamMatchCards']>
  ): ReturnType<TeamRepo['getTeamMatchCards']> {
    return this.teams.getTeamMatchCards(...args);
  }

  public getTeamMatchDetail(
    ...args: Parameters<TeamRepo['getTeamMatchDetail']>
  ): ReturnType<TeamRepo['getTeamMatchDetail']> {
    return this.teams.getTeamMatchDetail(...args);
  }
}

export const db = new DatabaseManager();
