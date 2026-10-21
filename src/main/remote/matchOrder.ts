/**
 * BellePoule Modern - Matchs proposés aux tablettes arbitre : jouabilité et ordre
 * d'enchaînement des matchs de poule (extrait de remoteScoreServer).
 * Licensed under GPL-3.0
 */
import { FencerStatus, MatchStatus, type Match } from '../../shared/types';
import type { ArenaMatch } from '../../shared/types/remote';

/** Match jouable : aucun des deux tireurs abandonné, forfait ou exclu. */
export function isMatchPlayable(m: Match | ArenaMatch): boolean {
  const inactive = new Set([FencerStatus.ABANDONED, FencerStatus.FORFAIT, FencerStatus.EXCLUDED]);
  return (
    !inactive.has(m.fencerA?.status as FencerStatus) &&
    !inactive.has(m.fencerB?.status as FencerStatus)
  );
}

/**
 * Ordre des matchs restants : terminés d'abord, puis enchaînement qui évite qu'un tireur
 * du match précédent tire de nouveau tout de suite.
 */
export function applySmartMatchOrder(matches: Match[]): Match[] {
  const pending = matches.filter(m => m.status !== MatchStatus.FINISHED && isMatchPlayable(m));
  const finished = matches.filter(m => m.status === MatchStatus.FINISHED);

  if (pending.length === 0) return matches;

  const ordered: Match[] = [];
  const remaining = [...pending];
  let lastFencerIds: Set<string> = new Set();

  if (finished.length > 0) {
    const lastMatch = finished[finished.length - 1];
    if (lastMatch.fencerA) lastFencerIds.add(lastMatch.fencerA.id);
    if (lastMatch.fencerB) lastFencerIds.add(lastMatch.fencerB.id);
  }

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < remaining.length; i++) {
      const match = remaining[i];
      let score = 0;
      if (!lastFencerIds.has(match.fencerA?.id || '')) score++;
      if (!lastFencerIds.has(match.fencerB?.id || '')) score++;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
      if (score === 2) break;
    }

    const chosen = remaining.splice(bestIdx >= 0 ? bestIdx : 0, 1)[0];
    ordered.push(chosen);

    lastFencerIds = new Set();
    if (chosen.fencerA) lastFencerIds.add(chosen.fencerA.id);
    if (chosen.fencerB) lastFencerIds.add(chosen.fencerB.id);
  }

  return [...finished, ...ordered];
}
