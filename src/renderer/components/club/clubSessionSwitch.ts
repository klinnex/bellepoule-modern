/**
 * BellePoule Modern - Mode Club (#1872) : plusieurs séances ouvertes en même temps.
 * Séance affichée parmi les ouvertes, ouverture d'une séance prévue ou passée sans
 * fermer les autres (fermeture seulement sur décision explicite).
 * Licensed under GPL-3.0
 */

import type { ClubAPI, ClubSession } from '../../../shared/types/club';

type OpenApi = Pick<ClubAPI, 'startSession' | 'reopenSession'>;

/** Séances ouvertes, la plus récente d'abord (date, puis heure d'ouverture) */
export function openSessions(sessions: ClubSession[]): ClubSession[] {
  return sessions
    .filter(s => s.status === 'open')
    .sort((a, b) => b.date.localeCompare(a.date) || b.openedAt.localeCompare(a.openedAt));
}

/** Séance affichée : celle choisie si elle est ouverte, sinon la plus récente ouverte */
export function activeSession(
  sessions: ClubSession[],
  activeId: string | null
): ClubSession | null {
  const open = openSessions(sessions);
  return open.find(s => s.id === activeId) ?? open[0] ?? null;
}

/** Ouvre la séance (prévue → démarrée, passée → rouverte) ; les autres restent ouvertes */
export async function openClubSession(api: OpenApi, target: ClubSession): Promise<void> {
  if (target.status === 'planned') await api.startSession(target.id);
  else if (target.status === 'closed') await api.reopenSession(target.id);
}
