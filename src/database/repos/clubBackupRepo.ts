/**
 * BellePoule Modern - Mode Club : sauvegarde complète d'un club (tables brutes) pour la
 * recharger sur un autre poste. Membres, maîtres d'armes, séances, présences, combats,
 * inventaire, prêts,
 * catégories, marques et bibliothèque d'exercices.
 * Licensed under GPL-3.0
 */
import type { SqlExecutor } from './sqlExecutor';

export const CLUB_BACKUP_FORMAT = 'bellepoule-club';
export const CLUB_BACKUP_VERSION = 1;

/** Tables propres au club (colonne club_id), dans l'ordre d'insertion */
const CLUB_TABLES = [
  'club_members',
  'club_coaches',
  'club_sessions',
  'club_bouts',
  'club_item_categories',
  'club_item_brands',
  'club_items',
  'club_loans',
] as const;

/** Toutes les tables d'une sauvegarde : le club, ses tables, les présences, les exercices */
export const CLUB_BACKUP_TABLES = [
  'clubs',
  ...CLUB_TABLES,
  'club_attendance',
  'club_session_coaches',
  'club_exercises',
] as const;

export type ClubBackupTable = (typeof CLUB_BACKUP_TABLES)[number];
type Cell = string | number | null;
export type ClubBackupRow = Record<string, Cell>;

export interface ClubBackup {
  format: typeof CLUB_BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  clubId: string;
  clubName: string;
  tables: Partial<Record<ClubBackupTable, ClubBackupRow[]>>;
}

export interface ClubBackupImportResult {
  clubId: string;
  clubName: string;
  replaced: boolean;
  rows: number;
}

/** Erreur levée quand le club de la sauvegarde existe déjà sur ce poste */
export const CLUB_EXISTS_ERROR = 'CLUB_EXISTS';

const MAX_ROWS_PER_TABLE = 200_000;

const isCell = (v: unknown): v is Cell =>
  v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

export class ClubBackupRepo {
  constructor(private readonly sql: SqlExecutor) {}

  private ensureOpen(): void {
    if (!this.sql.db) throw new Error('Database not open');
  }

  private hasTable(name: string): boolean {
    return !!this.sql.queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [name]
    );
  }

  /** Colonnes réelles d'une table (nom issu de la liste fixe CLUB_BACKUP_TABLES) */
  private columnsOf(table: ClubBackupTable): string[] {
    return this.sql.queryAll<{ name: string }>(`PRAGMA table_info(${table})`).map(c => c.name);
  }

  /** Sauvegarde du club : lignes brutes de chaque table */
  public exportClub(clubId: string): ClubBackup {
    this.ensureOpen();
    const club = this.sql.queryOne<ClubBackupRow>('SELECT * FROM clubs WHERE id = ?', [clubId]);
    if (!club) throw new Error('Club inconnu');
    const tables: ClubBackup['tables'] = { clubs: [club] };
    for (const table of CLUB_TABLES) {
      if (!this.hasTable(table)) continue;
      tables[table] = this.sql.queryAll<ClubBackupRow>(`SELECT * FROM ${table} WHERE club_id = ?`, [
        clubId,
      ]);
    }
    if (this.hasTable('club_attendance')) {
      tables.club_attendance = this.sql.queryAll<ClubBackupRow>(
        `SELECT a.* FROM club_attendance a
         JOIN club_sessions s ON s.id = a.session_id WHERE s.club_id = ?`,
        [clubId]
      );
    }
    if (this.hasTable('club_session_coaches')) {
      tables.club_session_coaches = this.sql.queryAll<ClubBackupRow>(
        `SELECT sc.* FROM club_session_coaches sc
         JOIN club_sessions s ON s.id = sc.session_id WHERE s.club_id = ?`,
        [clubId]
      );
    }
    if (this.hasTable('club_exercises')) {
      tables.club_exercises = this.sql.queryAll<ClubBackupRow>('SELECT * FROM club_exercises');
    }
    return {
      format: CLUB_BACKUP_FORMAT,
      version: CLUB_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      clubId,
      clubName: String(club.name ?? ''),
      tables,
    };
  }

  /** Club de la sauvegarde déjà présent sur ce poste */
  public clubExists(clubId: string): boolean {
    this.ensureOpen();
    return !!this.sql.queryOne<{ id: string }>('SELECT id FROM clubs WHERE id = ?', [clubId]);
  }

  /** Contrôle de structure ; lève une erreur en français si le fichier n'est pas exploitable */
  public static validate(data: unknown): ClubBackup {
    const d = data as Partial<ClubBackup> | null;
    if (!d || typeof d !== 'object' || d.format !== CLUB_BACKUP_FORMAT) {
      throw new Error("Ce fichier n'est pas une sauvegarde de club BellePoule");
    }
    if (typeof d.version !== 'number' || d.version > CLUB_BACKUP_VERSION) {
      throw new Error('Sauvegarde créée par une version plus récente : mettez BellePoule à jour');
    }
    if (typeof d.clubId !== 'string' || !d.clubId || d.clubId.length > 100) {
      throw new Error('Sauvegarde invalide : identifiant du club manquant');
    }
    if (!d.tables || typeof d.tables !== 'object') {
      throw new Error('Sauvegarde invalide : données manquantes');
    }
    for (const [name, rows] of Object.entries(d.tables)) {
      if (!(CLUB_BACKUP_TABLES as readonly string[]).includes(name)) continue;
      if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_TABLE) {
        throw new Error(`Sauvegarde invalide : table ${name}`);
      }
      for (const r of rows) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) {
          throw new Error(`Sauvegarde invalide : ligne de ${name}`);
        }
      }
    }
    const club = d.tables.clubs?.[0];
    if (!club || club.id !== d.clubId) {
      throw new Error('Sauvegarde invalide : fiche du club manquante');
    }
    return d as ClubBackup;
  }

  /** Efface toutes les données du club (mêmes tables que la sauvegarde, sauf les exercices) */
  private deleteClubData(clubId: string): void {
    if (this.hasTable('club_attendance')) {
      this.sql.run(
        'DELETE FROM club_attendance WHERE session_id IN (SELECT id FROM club_sessions WHERE club_id = ?)',
        [clubId]
      );
    }
    if (this.hasTable('club_session_coaches')) {
      this.sql.run(
        'DELETE FROM club_session_coaches WHERE session_id IN (SELECT id FROM club_sessions WHERE club_id = ?)',
        [clubId]
      );
    }
    for (const table of [...CLUB_TABLES].reverse()) {
      if (this.hasTable(table)) this.sql.run(`DELETE FROM ${table} WHERE club_id = ?`, [clubId]);
    }
    this.sql.run('DELETE FROM clubs WHERE id = ?', [clubId]);
  }

  private insertRows(
    table: ClubBackupTable,
    rows: ClubBackupRow[],
    mode: 'INSERT' | 'INSERT OR IGNORE',
    fix?: (row: Record<string, Cell>) => boolean
  ): number {
    if (!this.hasTable(table) || rows.length === 0) return 0;
    const known = new Set(this.columnsOf(table));
    let n = 0;
    for (const raw of rows) {
      const row: Record<string, Cell> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (known.has(k) && isCell(v)) row[k] = v;
      }
      if (fix && !fix(row)) continue;
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      this.sql.run(
        `${mode} INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map(c => row[c])
      );
      n++;
    }
    return n;
  }

  /**
   * Recharge une sauvegarde. Si le club existe déjà : erreur CLUB_EXISTS, sauf `replace`
   * (ses données sont alors remplacées). Tout ou rien (transaction).
   */
  public importClub(data: unknown, replace = false): ClubBackupImportResult {
    this.ensureOpen();
    const b = ClubBackupRepo.validate(data);
    const clubId = b.clubId;
    const exists = this.clubExists(clubId);
    if (exists && !replace) throw new Error(CLUB_EXISTS_ERROR);
    const venues = this.hasTable('venues')
      ? new Set(this.sql.queryAll<{ id: string }>('SELECT id FROM venues').map(v => v.id))
      : new Set<string>();
    const sessionIds = new Set(
      (b.tables.club_sessions ?? []).map(s => s.id).filter((id): id is string => !!id)
    );
    const coachIds = new Set(
      (b.tables.club_coaches ?? []).map(c => c.id).filter((id): id is string => !!id)
    );
    let rows = 0;
    this.sql.transaction(() => {
      if (exists) this.deleteClubData(clubId);
      rows += this.insertRows('clubs', b.tables.clubs!.slice(0, 1), 'INSERT');
      for (const table of CLUB_TABLES) {
        rows += this.insertRows(table, b.tables[table] ?? [], 'INSERT', row => {
          row.club_id = clubId;
          // Salle d'un autre poste : inconnue ici
          if (table === 'club_sessions' && row.venue_id && !venues.has(String(row.venue_id))) {
            row.venue_id = null;
          }
          return true;
        });
      }
      rows += this.insertRows('club_attendance', b.tables.club_attendance ?? [], 'INSERT', row =>
        sessionIds.has(String(row.session_id))
      );
      rows += this.insertRows(
        'club_session_coaches',
        b.tables.club_session_coaches ?? [],
        'INSERT OR IGNORE',
        row => sessionIds.has(String(row.session_id)) && coachIds.has(String(row.coach_id))
      );
      rows += this.insertRows('club_exercises', b.tables.club_exercises ?? [], 'INSERT OR IGNORE');
    });
    return { clubId, clubName: b.clubName ?? '', replaced: exists, rows };
  }
}
