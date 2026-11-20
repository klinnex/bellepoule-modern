/**
 * BellePoule Modern - Sélection de la release GitHub à proposer
 * Licensed under GPL-3.0
 */

export interface ReleaseLike {
  name?: string | null;
  tag_name?: string | null;
  body?: string | null;
  prerelease?: boolean;
  draft?: boolean;
}

const BUILD_PATTERNS = [/Build #(\d+)/i, /build\.(\d+)/i, /dev\.(\d+)/i, /rc\.(\d+)/i, /#(\d+)/];

/** Numéro de build d'une release : nom, puis tag, puis corps. 0 si introuvable. */
export function parseReleaseBuild(release: ReleaseLike): number {
  for (const text of [release.name, release.tag_name, release.body]) {
    if (!text) continue;
    let best = 0;
    for (const pattern of BUILD_PATTERNS) {
      const m = text.match(pattern);
      if (m) best = Math.max(best, parseInt(m[1], 10));
    }
    if (best > 0) return best;
  }
  return 0;
}

const VERSION_PATTERN = /v?(\d+)\.(\d+)\.(\d+)/;

/** Version X.Y.Z d'une release : tag, puis nom. null si introuvable. */
export function parseReleaseVersion(release: ReleaseLike): string | null {
  for (const text of [release.tag_name, release.name]) {
    const m = text?.match(VERSION_PATTERN);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  }
  return null;
}

/** Repère comparable : version X.Y.Z (null = inconnue) puis build. */
export interface VersionPoint {
  version: string | null;
  build: number;
}

function semverParts(version: string | null): [number, number, number] | null {
  const m = version?.match(VERSION_PATTERN);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Ordre des versions : X.Y.Z d'abord, build ensuite (même version).
 * Une branche de maintenance publie une 2.0.1 avec un build plus élevé que des
 * 3.0.0-dev déjà sortis : comparer le build seul la proposerait aux testeurs dev.
 * Version inconnue d'un côté : repli sur le build seul (anciennes releases).
 */
export function compareVersionPoints(a: VersionPoint, b: VersionPoint): number {
  const va = semverParts(a.version);
  const vb = semverParts(b.version);
  if (va && vb) {
    for (let i = 0; i < 3; i++) {
      if (va[i] !== vb[i]) return va[i] - vb[i];
    }
  }
  return a.build - b.build;
}

/** Vrai si la release est plus récente que la version installée. */
export function isNewerRelease(release: ReleaseLike, current: VersionPoint): boolean {
  const latest = { version: parseReleaseVersion(release), build: parseReleaseBuild(release) };
  return compareVersionPoints(latest, current) > 0;
}

/**
 * Release la plus récente du canal (stable : hors pré-releases), au sens de
 * compareVersionPoints. L'ordre de l'API (date de création) ne suffit pas : un
 * stable publié après un dev reprend un build plus ancien, et un correctif de
 * maintenance (2.0.1) peut sortir après des 3.0.0-dev.
 */
export function pickLatestRelease<T extends ReleaseLike>(
  releases: T[],
  includePrerelease: boolean
): T | null {
  let best: T | null = null;
  let bestPoint: VersionPoint | null = null;
  for (const r of releases) {
    if (r.draft) continue;
    if (!includePrerelease && r.prerelease) continue;
    const point = { version: parseReleaseVersion(r), build: parseReleaseBuild(r) };
    if (!bestPoint || compareVersionPoints(point, bestPoint) > 0) {
      best = r;
      bestPoint = point;
    }
  }
  return best;
}
