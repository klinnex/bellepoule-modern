/**
 * BellePoule Modern - Mise à jour en attente (stockage privé + validation)
 * Licensed under GPL-3.0
 *
 * Dossier privé (0700) sous userData, JSON 0600. À la relecture, tout élément
 * non conforme (hors dossier, autre propriétaire, droits trop larges) est rejeté.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const PENDING_UPDATE_DIR = 'pending-update';
const PENDING_JSON = 'pending-update.json';

export interface PendingUpdateData {
  version: string;
  path: string;
  sha256: string;
  downloadedAt: string;
}

/** Crée (si besoin) le sous-dossier privé et force le mode 0700. */
export function ensurePrivateDir(userDataDir: string): string {
  const dir = path.join(userDataDir, PENDING_UPDATE_DIR);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
  return dir;
}

/** Nom de fichier aléatoire pour l'installeur (extension conservée). */
export function randomInstallerName(filename: string): string {
  const ext = path.extname(path.basename(filename)).replace(/[^.\w]/g, '');
  return `${crypto.randomBytes(16).toString('hex')}${ext}`;
}

export function getPendingJsonPath(userDataDir: string): string {
  return path.join(userDataDir, PENDING_UPDATE_DIR, PENDING_JSON);
}

/** Vrai si `child` est strictement à l'intérieur de `dir`. */
export function isInsideDir(dir: string, child: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Fichier appartenant à l'utilisateur courant et non accessible aux autres (POSIX). */
export function isOwnedAndPrivate(filePath: string): boolean {
  try {
    const st = fs.lstatSync(filePath);
    if (!st.isFile()) return false;
    if (process.platform === 'win32') return true;
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
    return (st.mode & 0o077) === 0;
  } catch {
    return false;
  }
}

export function writePendingUpdate(userDataDir: string, data: PendingUpdateData): void {
  ensurePrivateDir(userDataDir);
  const jsonPath = getPendingJsonPath(userDataDir);
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(jsonPath, 0o600);
}

/** Supprime le JSON (usage unique). */
export function clearPendingUpdate(userDataDir: string): void {
  try {
    fs.unlinkSync(getPendingJsonPath(userDataDir));
  } catch {
    // ignore
  }
}

/**
 * Lit et valide le JSON. Retourne null si absent ou non fiable
 * (JSON invalide, champs manquants, chemin hors dossier privé, propriétaire/droits invalides).
 */
export function readPendingUpdate(userDataDir: string): PendingUpdateData | null {
  const jsonPath = getPendingJsonPath(userDataDir);
  try {
    if (!fs.existsSync(jsonPath)) return null;
    if (!isOwnedAndPrivate(jsonPath)) return null;
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, unknown>;
    if (
      typeof raw.version !== 'string' ||
      typeof raw.path !== 'string' ||
      typeof raw.sha256 !== 'string' ||
      typeof raw.downloadedAt !== 'string'
    ) {
      return null;
    }
    const dir = path.join(userDataDir, PENDING_UPDATE_DIR);
    if (!isInsideDir(dir, raw.path)) return null;
    if (!isOwnedAndPrivate(raw.path)) return null;
    return {
      version: raw.version,
      path: raw.path,
      sha256: raw.sha256,
      downloadedAt: raw.downloadedAt,
    };
  } catch {
    return null;
  }
}
