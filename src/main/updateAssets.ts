/**
 * BellePoule Modern - Choix de l'asset de mise à jour + remplacement en place
 * Licensed under GPL-3.0
 *
 * Mode d'installation détecté au lancement :
 * - appimage : process.env.APPIMAGE → remplacement du fichier AppImage, relance
 * - portable : PORTABLE_EXECUTABLE_FILE (electron-builder) → remplacement de l'exe, relance
 * - installer : NSIS (Windows), DMG (macOS), deb/rpm (Linux)
 */

import fs from 'fs';
import path from 'path';

export type InstallKind = 'appimage' | 'portable' | 'installer';

export interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url?: string;
  digest?: string | null;
}

export function detectInstallKind(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv
): { kind: InstallKind; target: string | null } {
  if (platform === 'linux' && env.APPIMAGE) return { kind: 'appimage', target: env.APPIMAGE };
  if (platform === 'win32' && env.PORTABLE_EXECUTABLE_FILE) {
    return { kind: 'portable', target: env.PORTABLE_EXECUTABLE_FILE };
  }
  return { kind: 'installer', target: null };
}

/** Suffixes d'arch utilisés par artifactName (electron-builder). */
function archTokens(arch: string): string[] {
  if (arch === 'x64') return ['x64', 'x86_64', 'amd64'];
  if (arch === 'arm64') return ['arm64', 'aarch64'];
  if (arch === 'ia32') return ['ia32', 'i386'];
  return [arch];
}

/** Préférences ordonnées (suffixes de nom) selon plateforme + mode d'installation. */
function preferredSuffixes(platform: NodeJS.Platform, kind: InstallKind): string[] {
  if (platform === 'win32') return kind === 'portable' ? ['-portable.exe'] : ['-setup.exe', '.exe'];
  if (platform === 'darwin') return ['.dmg'];
  if (platform === 'linux')
    return kind === 'appimage' ? ['.AppImage'] : ['.deb', '.rpm', '.AppImage'];
  return [];
}

/**
 * Sélectionne l'asset adapté (plateforme, arch, mode). Préférence à l'arch exacte,
 * sinon asset sans arch connue. Exclut le portable pour un install NSIS et inversement.
 */
export function selectUpdateAsset<T extends ReleaseAsset>(
  assets: T[],
  platform: NodeJS.Platform,
  arch: string,
  kind: InstallKind
): T | null {
  const tokens = archTokens(arch);
  const allArch = ['x64', 'x86_64', 'amd64', 'arm64', 'aarch64', 'ia32', 'i386'];
  const hasToken = (name: string, list: string[]) =>
    list.some(t => new RegExp(`[-_.]${t}[-_.]`, 'i').test(name));

  for (const suffix of preferredSuffixes(platform, kind)) {
    const candidates = assets.filter(a => {
      const n = a.name;
      if (!n.endsWith(suffix)) return false;
      if (platform === 'win32' && kind !== 'portable' && n.endsWith('-portable.exe')) return false;
      return true;
    });
    const exact = candidates.find(a => hasToken(a.name, tokens));
    if (exact) return exact;
    const neutral = candidates.find(a => !hasToken(a.name, allArch));
    if (neutral) return neutral;
  }
  return null;
}

/**
 * Remplace atomiquement `target` par `source` (AppImage / exe portable).
 * - copie dans `<target>.new` puis rename (même dossier → atomique)
 * - Windows : l'exe en cours peut être renommé, pas écrasé → `<target>.old`
 * Retourne false si le dossier n'est pas inscriptible.
 */
export function replaceExecutableInPlace(
  source: string,
  target: string,
  platform: NodeJS.Platform
): boolean {
  const dir = path.dirname(target);
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    return false;
  }
  const staged = `${target}.new`;
  const old = `${target}.old`;
  fs.copyFileSync(source, staged);
  if (platform !== 'win32') fs.chmodSync(staged, 0o755);
  if (platform === 'win32') {
    fs.rmSync(old, { force: true });
    fs.renameSync(target, old);
    try {
      fs.renameSync(staged, target);
    } catch (e) {
      fs.renameSync(old, target);
      throw e;
    }
  } else {
    fs.renameSync(staged, target);
  }
  return true;
}

/** Nettoie les restes d'un remplacement précédent (`.old`, `.new`). */
export function cleanupReplacedExecutable(target: string | null): void {
  if (!target) return;
  for (const f of [`${target}.old`, `${target}.new`]) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // fichier encore verrouillé : retenté au prochain lancement
    }
  }
}

/**
 * Exe portable Windows : le lanceur NSIS garde son propre .exe ouvert (lecture seule,
 * sans partage suppression) tant que l'app tourne → impossible de le renommer ou
 * l'écraser. La nouvelle version est donc copiée À CÔTÉ, sous le nom de l'asset
 * (qui contient déjà la version), puis l'ancien exe est supprimé au lancement suivant.
 *
 * Chemin cible : même dossier que l'exe courant, nom = basename de l'asset (.exe).
 * Collision avec l'exe courant ou un fichier existant → suffixe `-<n>`.
 */
export function portableSideBySidePath(
  currentExe: string,
  assetName: string | undefined,
  exists: (p: string) => boolean
): string {
  const dir = path.win32.dirname(currentExe);
  const raw = path.win32.basename(path.posix.basename(assetName || ''));
  const safe = raw.replace(/[^\w.\-() ]/g, '_');
  const base = safe.toLowerCase().endsWith('.exe')
    ? safe.slice(0, -4)
    : 'BellePoule-Modern-portable';
  const same = (p: string) => p.toLowerCase() === currentExe.toLowerCase();
  let candidate = path.win32.join(dir, `${base}.exe`);
  for (let n = 2; same(candidate) || exists(candidate); n++) {
    candidate = path.win32.join(dir, `${base}-${n}.exe`);
  }
  return candidate;
}

/**
 * Ancien exe portable à supprimer : seulement un .exe du même dossier que l'exe
 * courant, et pas l'exe courant lui-même.
 */
export function isSafePortableCleanup(previousExe: unknown, currentExe: string): boolean {
  if (typeof previousExe !== 'string' || !previousExe.toLowerCase().endsWith('.exe')) return false;
  if (previousExe.toLowerCase() === currentExe.toLowerCase()) return false;
  return (
    path.win32.dirname(previousExe).toLowerCase() === path.win32.dirname(currentExe).toLowerCase()
  );
}
