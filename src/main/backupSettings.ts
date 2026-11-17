/**
 * BellePoule Modern - Dossier de sauvegarde par défaut (Paramètres → Sauvegarde)
 * Licensed under GPL-3.0
 *
 * Fichier `<userData>/backup-settings.json` : `{ "dir": "/chemin/absolu" }`.
 * Sans réglage, le dossier par défaut est `<Documents>/BellePoule`.
 * Les sauvegardes automatiques (toutes les 2 minutes) et « Enregistrer » y écrivent.
 */

import fs from 'fs';
import path from 'path';

export const BACKUP_SETTINGS_FILE = 'backup-settings.json';
/** Nom fixe de la sauvegarde automatique : écrasée à chaque cycle, jamais empilée */
export const AUTOSAVE_FILE_NAME = 'BellePoule-autosave.bpm';

export interface BackupSettings {
  /** Dossier choisi par l'utilisateur ; absent = dossier par défaut */
  dir?: string;
}

export interface BackupDirInfo {
  dir: string;
  isDefault: boolean;
}

/** Dossier par défaut : `<Documents>/BellePoule` */
export function defaultBackupDir(documentsPath: string): string {
  return path.join(documentsPath, 'BellePoule');
}

/** Chemin saisi valide : absolu, sans octet nul ; normalisé. */
export function sanitizeBackupDir(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const dir = input.trim();
  if (!dir || dir.includes('\0') || !path.isAbsolute(dir)) return null;
  return path.normalize(dir);
}

export function readBackupSettings(userDataPath: string): BackupSettings {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(userDataPath, BACKUP_SETTINGS_FILE), 'utf8')
    ) as { dir?: unknown };
    const dir = sanitizeBackupDir(raw.dir);
    return dir ? { dir } : {};
  } catch {
    return {};
  }
}

export function writeBackupSettings(userDataPath: string, settings: BackupSettings): void {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(userDataPath, BACKUP_SETTINGS_FILE),
    `${JSON.stringify(settings, null, 2)}\n`,
    'utf8'
  );
}

/** Dossier effectif de sauvegarde : réglage utilisateur, sinon dossier par défaut. */
export function resolveBackupDir(userDataPath: string, documentsPath: string): BackupDirInfo {
  const { dir } = readBackupSettings(userDataPath);
  return dir
    ? { dir, isDefault: false }
    : { dir: defaultBackupDir(documentsPath), isDefault: true };
}

/** Nom de la sauvegarde automatique d'une compétition : titre assaini + début d'id (unicité) */
export function competitionAutosaveName(title: string | undefined, competitionId: string): string {
  const base = (title ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const shortId = competitionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return `${base || 'competition'}-${shortId}-autosave.bpm`;
}
