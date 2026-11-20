/**
 * BellePoule Modern - Mode Club : synchronisation externe d'un club vers un dossier
 * (Google Drive, Dropbox… via leur client de bureau ; plusieurs postes peuvent pointer
 * le même dossier). Un fichier `.bpclub` par club, reprise automatique toutes les 30 s.
 * Licensed under GPL-3.0
 *
 * Réglages : `<userData>/club-sync.json` → { clubs: { <clubId>: { dir, fileName, … } } }.
 * État de référence (`lastDbHash` / `lastFileHash`) : empreintes du contenu à la dernière
 * synchro ; elles disent qui a changé quoi depuis, sans horodatage (fiable entre postes).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../database';
import type { ClubBackup } from '../database/repos/clubBackupRepo';
import { CLUB_BACKUP_EXT, decodeClubBackup, encodeClubBackup } from './clubBackupFile';
import { readBoundedFile } from './pathAuthorization';

export const CLUB_SYNC_SETTINGS_FILE = 'club-sync.json';
export const CLUB_SYNC_INTERVAL_MS = 30_000;

export interface ClubSyncEntry {
  /** Dossier choisi (dialogue natif, côté main) */
  dir: string;
  /** Nom du fichier .bpclub dans le dossier (fixé à l'activation) */
  fileName: string;
  /** Empreinte du contenu du club à la dernière synchro (absente = jamais synchronisé) */
  lastDbHash?: string;
  /** Empreinte du fichier à la dernière synchro */
  lastFileHash?: string;
  lastSync?: string;
}

export interface ClubSyncSettings {
  clubs: Record<string, ClubSyncEntry>;
}

export type ClubSyncState = 'off' | 'synced' | 'conflict' | 'error';

export interface ClubSyncStatus {
  clubId: string;
  state: ClubSyncState;
  dir: string | null;
  fileName: string | null;
  lastSync: string | null;
  error: string | null;
}

export type SyncAction = 'none' | 'write' | 'import' | 'conflict';

/**
 * Décision pure (sans E/S) selon ce qui a changé depuis la dernière synchro.
 * - Fichier absent → écriture du club.
 * - Jamais synchronisé + fichier présent + club local existant → conflit (au choix de l'utilisateur).
 * - Club absent localement → reprise du fichier (nouveau poste), sauf si rien n'a changé.
 * - Un seul côté modifié → ce côté l'emporte ; les deux côtés modifiés → conflit.
 */
export function decideSync(s: {
  hasBaseline: boolean;
  fileExists: boolean;
  clubExists: boolean;
  dbChanged: boolean;
  fileChanged: boolean;
}): SyncAction {
  if (!s.clubExists) {
    return s.fileExists && (!s.hasBaseline || s.fileChanged) ? 'import' : 'none';
  }
  if (!s.fileExists) return 'write';
  if (!s.hasBaseline) return 'conflict';
  if (s.dbChanged && s.fileChanged) return 'conflict';
  if (s.dbChanged) return 'write';
  if (s.fileChanged) return 'import';
  return 'none';
}

/** Nom de fichier stable : <club assaini>-<8 premiers car. de l'id>.bpclub (pas de collision) */
export function clubSyncFileName(clubName: string, clubId: string): string {
  const base =
    clubName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'club';
  const shortId = clubId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'club';
  return `${base}-${shortId}${CLUB_BACKUP_EXT}`;
}

const sha256 = (data: Buffer | string): string =>
  crypto.createHash('sha256').update(data).digest('hex');

/** Empreinte du contenu (hors `exportedAt`, qui change à chaque export) */
export function hashClubContent(backup: ClubBackup): string {
  return sha256(JSON.stringify({ ...backup, exportedAt: '' }));
}

export function readClubSyncSettings(userDataPath: string): ClubSyncSettings {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(userDataPath, CLUB_SYNC_SETTINGS_FILE), 'utf8')
    ) as { clubs?: unknown };
    const clubs: Record<string, ClubSyncEntry> = {};
    if (raw.clubs && typeof raw.clubs === 'object') {
      for (const [id, v] of Object.entries(raw.clubs as Record<string, ClubSyncEntry>)) {
        if (v && typeof v.dir === 'string' && typeof v.fileName === 'string') clubs[id] = v;
      }
    }
    return { clubs };
  } catch {
    return { clubs: {} };
  }
}

export function writeClubSyncSettings(userDataPath: string, settings: ClubSyncSettings): void {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(userDataPath, CLUB_SYNC_SETTINGS_FILE),
    `${JSON.stringify(settings, null, 2)}\n`,
    'utf8'
  );
}

/** Écriture atomique (fichier temporaire puis renommage) : Drive ne voit jamais un fichier partiel */
function writeFileAtomic(target: string, data: Buffer): void {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
}

/** Accès DB réduit au strict nécessaire (facilite les tests) */
export type ClubSyncDb = Pick<DatabaseManager, 'club' | 'clubBackup'>;

export class ClubSyncService {
  private readonly conflicts = new Set<string>();
  private readonly errors = new Map<string, string>();
  private readonly busy = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: ClubSyncDb,
    private readonly userDataPath: string,
    /** Appelé après une reprise du fichier (la vue doit se recharger) */
    private readonly onImported: (clubId: string) => void = () => undefined
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.syncAll(), CLUB_SYNC_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(clubId: string): ClubSyncStatus {
    const entry = readClubSyncSettings(this.userDataPath).clubs[clubId];
    const base = { clubId, dir: null, fileName: null, lastSync: null, error: null };
    if (!entry) return { ...base, state: 'off' };
    const state: ClubSyncState = this.errors.has(clubId)
      ? 'error'
      : this.conflicts.has(clubId)
        ? 'conflict'
        : 'synced';
    return {
      clubId,
      state,
      dir: entry.dir,
      fileName: entry.fileName,
      lastSync: entry.lastSync ?? null,
      error: this.errors.get(clubId) ?? null,
    };
  }

  /** Active la synchro d'un club dans `dir` puis synchronise tout de suite */
  async enable(clubId: string, dir: string): Promise<ClubSyncStatus> {
    const club = this.db.club.getClub(clubId);
    if (!club) throw new Error('Club inconnu');
    const settings = readClubSyncSettings(this.userDataPath);
    const previous = settings.clubs[clubId];
    settings.clubs[clubId] = {
      dir,
      fileName: previous?.fileName ?? clubSyncFileName(club.name, clubId),
      lastDbHash: previous?.lastDbHash,
      lastFileHash: previous?.lastFileHash,
      lastSync: previous?.lastSync,
    };
    writeClubSyncSettings(this.userDataPath, settings);
    return this.sync(clubId);
  }

  disable(clubId: string): ClubSyncStatus {
    const settings = readClubSyncSettings(this.userDataPath);
    delete settings.clubs[clubId];
    writeClubSyncSettings(this.userDataPath, settings);
    this.conflicts.delete(clubId);
    this.errors.delete(clubId);
    return this.status(clubId);
  }

  /** Résolution d'un conflit : « file » = garder le fichier, « app » = garder ce poste */
  async resolve(clubId: string, keep: 'file' | 'app'): Promise<ClubSyncStatus> {
    return this.sync(clubId, keep === 'file' ? 'import' : 'write');
  }

  async syncAll(): Promise<void> {
    for (const clubId of Object.keys(readClubSyncSettings(this.userDataPath).clubs)) {
      await this.sync(clubId);
    }
  }

  /** Une passe de synchro pour un club. `forced` court-circuite la décision (résolution). */
  async sync(clubId: string, forced?: 'write' | 'import'): Promise<ClubSyncStatus> {
    const settings = readClubSyncSettings(this.userDataPath);
    const entry = settings.clubs[clubId];
    if (!entry || this.busy.has(clubId)) return this.status(clubId);
    this.busy.add(clubId);
    try {
      const filePath = path.join(entry.dir, entry.fileName);
      if (!fs.existsSync(entry.dir)) {
        throw new Error(`Dossier de synchronisation introuvable : ${entry.dir}`);
      }
      const fileBuf = fs.existsSync(filePath) ? await readBoundedFile(filePath) : null;
      const fileHash = fileBuf ? sha256(fileBuf) : undefined;
      const club = this.db.club.getClub(clubId);
      const backup = club ? this.db.clubBackup.exportClub(clubId) : null;
      const dbHash = backup ? hashClubContent(backup) : undefined;

      const action =
        forced ??
        decideSync({
          hasBaseline: entry.lastDbHash !== undefined && entry.lastFileHash !== undefined,
          fileExists: fileBuf !== null,
          clubExists: club !== null,
          dbChanged: dbHash !== entry.lastDbHash,
          fileChanged: fileHash !== entry.lastFileHash,
        });

      if (action === 'write' && backup && dbHash) {
        const data = await encodeClubBackup(backup);
        writeFileAtomic(filePath, data);
        entry.lastDbHash = dbHash;
        entry.lastFileHash = sha256(data);
        entry.lastSync = new Date().toISOString();
        this.conflicts.delete(clubId);
      } else if (action === 'import' && fileBuf && fileHash) {
        const data = (await decodeClubBackup(fileBuf)) as ClubBackup;
        if (data.clubId !== clubId) throw new Error('Le fichier appartient à un autre club');
        this.db.clubBackup.importClub(data, club !== null);
        const reimported = this.db.clubBackup.exportClub(clubId);
        entry.lastDbHash = hashClubContent(reimported);
        entry.lastFileHash = fileHash;
        entry.lastSync = new Date().toISOString();
        this.conflicts.delete(clubId);
        this.onImported(clubId);
      } else if (action === 'conflict') {
        this.conflicts.add(clubId);
      } else {
        this.conflicts.delete(clubId);
      }

      this.errors.delete(clubId);
      // Relecture : la synchro peut avoir été désactivée pendant les E/S
      const latest = readClubSyncSettings(this.userDataPath);
      if (latest.clubs[clubId]) {
        latest.clubs[clubId] = entry;
        writeClubSyncSettings(this.userDataPath, latest);
      }
    } catch (e) {
      this.errors.set(clubId, e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.delete(clubId);
    }
    return this.status(clubId);
  }
}
