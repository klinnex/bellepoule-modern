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

const BUILD_PATTERNS = [/Build #(\d+)/i, /build\.(\d+)/i, /dev\.(\d+)/i, /#(\d+)/];

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

/**
 * Release au build le plus élevé du canal (stable : hors pré-releases).
 * L'ordre de l'API (date de création) ne suffit pas : un stable publié après
 * un dev reprend un build plus ancien.
 */
export function pickLatestRelease<T extends ReleaseLike>(
  releases: T[],
  includePrerelease: boolean
): T | null {
  let best: T | null = null;
  let bestBuild = -1;
  for (const r of releases) {
    if (r.draft) continue;
    if (!includePrerelease && r.prerelease) continue;
    const build = parseReleaseBuild(r);
    if (build > bestBuild) {
      best = r;
      bestBuild = build;
    }
  }
  return best;
}
