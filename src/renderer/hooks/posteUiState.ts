/**
 * BellePoule Modern - État d'interface du poste, par épreuve (#1980, docs/adr/0017)
 * Onglet affiché, bornes de taille de la préparation des poules, pistes de la saisie distante :
 * propres à ce poste, gardés dans le navigateur (localStorage), plus dans l'état partagé de
 * l'épreuve. Lecture tolérante : stockage absent, illisible ou bloqué → rien.
 * Licensed under GPL-3.0
 */
import type { Phase } from './useCompetitionSession';

export interface PosteUiState {
  tab?: Phase;
  minFencersPerPool?: number;
  maxFencersPerPool?: number;
  remoteArenaCount?: number;
  remoteStripStart?: number;
}

const key = (competitionId: string) => `bellepoule-ui-${competitionId}`;

export function readPosteUiState(competitionId: string): PosteUiState {
  try {
    const raw = localStorage.getItem(key(competitionId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as PosteUiState) : {};
  } catch {
    return {};
  }
}

export function writePosteUiState(competitionId: string, patch: PosteUiState): void {
  try {
    const next = { ...readPosteUiState(competitionId), ...patch };
    localStorage.setItem(key(competitionId), JSON.stringify(next));
  } catch {
    /* stockage indisponible : l'état partagé sert de repli */
  }
}

/** Onglets latéraux : toujours accessibles, quelle que soit la phase de l'épreuve */
const SIDE_TABS = new Set<Phase>(['remote', 'logs', 'referees']);

/**
 * Onglet à rouvrir : celui du poste s'il ne devance pas la phase de l'épreuve (un poste ne
 * rouvre pas le tableau d'une épreuve encore en poules), sinon la phase de l'épreuve.
 */
export function tabToRestore(
  stored: Phase | undefined,
  competitionPhase: Phase | undefined,
  order: (phase: Phase) => number
): Phase | undefined {
  if (!stored) return competitionPhase;
  if (SIDE_TABS.has(stored)) return stored;
  if (!competitionPhase) return stored;
  return order(stored) <= order(competitionPhase) ? stored : competitionPhase;
}
