/**
 * BellePoule Modern - Mode Club : sauvegardes locales de la configuration d'un club (#1872).
 * Deux sauvegardes par club, dans `<userData>/club-backups/<clubId>/` (format .bpclub).
 * Une nouvelle sauvegarde supprime la plus ancienne ; la restauration remplace les données du club.
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../database';
import { CLUB_BACKUP_EXT, decodeClubBackup, encodeClubBackup } from './clubBackupFile';
import { readBoundedFile } from './pathAuthorization';
import type { ClubBackupEntry } from '../shared/types/club';

export const CLUB_BACKUP_KEEP = 2;
export const CLUB_BACKUPS_DIR = 'club-backups';

const BACKUP_NAME_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.bpclub$/;

/** Dossier d'un club (identifiant assaini : pas de chemin hors du dossier de sauvegardes) */
export function clubBackupDir(userDataPath: string, clubId: string): string {
  return path.join(userDataPath, CLUB_BACKUPS_DIR, clubId.replace(/[^A-Za-z0-9_-]/g, '_'));
}

/** Nom horodaté : trié alphabétiquement = trié chronologiquement */
export function clubBackupFileName(date: Date): string {
  return `${date.toISOString().replace(/[:.]/g, '-')}${CLUB_BACKUP_EXT}`;
}

/** Noms à supprimer pour ne garder que les `keep` plus récents (ordre croissant : le plus ancien d'abord) */
export function backupsToRemove(names: readonly string[], keep = CLUB_BACKUP_KEEP): string[] {
  const sorted = names.filter(n => BACKUP_NAME_RE.test(n)).sort();
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

function backupEntry(name: string): ClubBackupEntry | null {
  const m = BACKUP_NAME_RE.exec(name);
  if (!m) return null;
  // 2026-11-18T16-20-00-000Z → 2026-11-18T16:20:00.000Z
  const iso = m[1].replace(/^(.{10}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
  return { id: name, createdAt: iso };
}

/** Sauvegardes du club, les plus récentes d'abord */
export function listClubBackups(userDataPath: string, clubId: string): ClubBackupEntry[] {
  const dir = clubBackupDir(userDataPath, clubId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(n => BACKUP_NAME_RE.test(n))
    .sort()
    .reverse()
    .map(backupEntry)
    .filter((e): e is ClubBackupEntry => e !== null);
}

/** Crée une sauvegarde puis supprime les plus anciennes au-delà de CLUB_BACKUP_KEEP */
export async function createClubBackup(
  db: Pick<DatabaseManager, 'clubBackup'>,
  userDataPath: string,
  clubId: string,
  now = new Date()
): Promise<ClubBackupEntry[]> {
  const data = await encodeClubBackup(db.clubBackup.exportClub(clubId));
  const dir = clubBackupDir(userDataPath, clubId);
  fs.mkdirSync(dir, { recursive: true });
  const name = clubBackupFileName(now);
  const tmp = path.join(dir, `.${name}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, path.join(dir, name));
  for (const old of backupsToRemove(fs.readdirSync(dir))) {
    fs.rmSync(path.join(dir, old), { force: true });
  }
  return listClubBackups(userDataPath, clubId);
}

/** Restaure une sauvegarde : les données du club sont remplacées sur ce poste */
export async function restoreClubBackup(
  db: Pick<DatabaseManager, 'clubBackup'>,
  userDataPath: string,
  clubId: string,
  id: string
): Promise<{ clubName: string }> {
  if (!BACKUP_NAME_RE.test(id)) throw new Error('Sauvegarde inconnue');
  const file = path.join(clubBackupDir(userDataPath, clubId), id);
  if (!fs.existsSync(file)) throw new Error('Sauvegarde introuvable');
  const data = (await decodeClubBackup(await readBoundedFile(file))) as { clubId?: unknown };
  if (data.clubId !== clubId) throw new Error('La sauvegarde appartient à un autre club');
  const result = db.clubBackup.importClub(data, true);
  return { clubName: result.clubName };
}
