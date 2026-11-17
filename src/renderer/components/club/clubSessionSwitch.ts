/**
 * BellePoule Modern - Mode Club (#1872) : passage d'une séance à une autre. La séance
 * ouverte est fermée (une seule par club), puis la cible est démarrée (prévue) ou
 * rouverte (passée).
 * Licensed under GPL-3.0
 */

import type { ClubAPI, ClubSession } from '../../../shared/types/club';

type SwitchApi = Pick<ClubAPI, 'closeSession' | 'startSession' | 'reopenSession'>;

export async function switchClubSession(
  api: SwitchApi,
  current: ClubSession | null,
  target: ClubSession
): Promise<void> {
  if (current && current.id !== target.id) await api.closeSession(current.id);
  if (target.status === 'planned') await api.startSession(target.id);
  else if (target.status === 'closed') await api.reopenSession(target.id);
}
