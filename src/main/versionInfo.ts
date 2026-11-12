/**
 * BellePoule Modern - Lecture de version.json (version, build, canal) (#1326)
 * Partagée par l'IPC `app:getVersionInfo` et le rapport de diagnostic.
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { logger, LogCategory, toError } from '../shared/services/logger';

export interface VersionInfo {
  version: string;
  build: number;
  date: string;
  channel?: 'dev' | 'stable';
}

/** Lit un JSON ; null si absent ou illisible (pas de existsSync préalable : évite le TOCTOU, #1776). */
function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      logger.error(LogCategory.SYSTEM, `Failed to read ${path.basename(file)}:`, toError(e));
    }
    return null;
  }
}

function readVersionInfo(): VersionInfo {
  const versionPaths = [
    path.join(app.getAppPath(), 'version.json'),
    path.join(app.getAppPath(), '..', 'version.json'),
    path.join(__dirname, '..', '..', 'version.json'),
    path.join(process.cwd(), 'version.json'),
  ];
  for (const versionPath of versionPaths) {
    const info = readJson(versionPath);
    if (info && typeof info === 'object') return info as VersionInfo;
  }

  // Fallback: lire depuis package.json
  const pkg = readJson(path.join(app.getAppPath(), 'package.json')) as { version?: unknown } | null;
  const match =
    typeof pkg?.version === 'string'
      ? pkg.version.match(/(\d+\.\d+\.\d+)(?:-(?:build|dev)\.(\d+))?/)
      : null;
  if (match) {
    return { version: match[1], build: parseInt(match[2]) || 0, date: new Date().toISOString() };
  }
  return { version: '1.0.0', build: 0, date: 'Unknown' };
}

let cached: VersionInfo | null = null;

/**
 * Version de l'application. Fichier figé pendant l'exécution : lu une fois (lecture synchrone
 * au démarrage, avant la fenêtre principale), puis servi depuis la mémoire (#1776).
 */
export function getVersionInfo(): VersionInfo {
  if (!cached) cached = readVersionInfo();
  return cached;
}
