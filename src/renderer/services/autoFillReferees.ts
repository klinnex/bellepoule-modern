/**
 * BellePoule Modern - Arbitres du remplissage automatique (scores de test, statistiques)
 * Même moteur que l'affectation réelle (#1979, docs/adr/0014) : une poule = un arbitre,
 * un match de tableau = un arbitre par tour, neutralité par défaut ; un arbitre peut
 * enchaîner plusieurs créneaux (reuseReferees).
 * Outil de test : si aucun candidat n'est pointé, tous sont considérés disponibles.
 * Licensed under GPL-3.0
 */
import type { Pool, Referee } from '../../shared/types';
import {
  autoAssignReferees,
  type AssignableMatch,
} from '../../shared/domain/referees/refereeAutoAssign';
import { DEFAULT_NEUTRALITY } from '../../shared/domain/referees/refereeMatching';

/** Arbitre candidat : un Referee, ou sa forme réduite côté tableau */
type Candidate = Pick<Referee, 'id'> &
  Partial<Pick<Referee, 'club' | 'nationality' | 'region'>> & {
    status?: string;
  };

export function autoFillRefereeAssignments<M extends AssignableMatch, R extends Candidate>(
  matches: M[],
  pools: Pool[],
  candidates: R[],
  /** Matchs déjà arbitrés par id (charge partagée entre appels) ; mis à jour en place */
  load: Map<string, number>
): Map<string, R> {
  if (matches.length === 0 || candidates.length === 0) return new Map();
  const anyAvailable = candidates.some(r => r.status !== 'unavailable');
  // Le moteur ne lit que id, club, nation, ligue, statut, niveau et charge
  const referees = candidates.map(r => ({
    ...r,
    status: anyAvailable ? r.status : 'available',
  })) as unknown as Referee[];
  const { assignments } = autoAssignReferees(matches, pools, referees, {
    neutrality: DEFAULT_NEUTRALITY,
    matchesToday: load,
    // Remplissage de test : tous les matchs reçoivent un arbitre si la neutralité le permet
    reuseReferees: true,
  });
  const byId = new Map(candidates.map(r => [r.id, r]));
  const out = new Map<string, R>();
  for (const [matchId, ref] of assignments) {
    const original = byId.get(ref.id);
    if (!original) continue;
    out.set(matchId, original);
    load.set(ref.id, (load.get(ref.id) ?? 0) + 1);
  }
  return out;
}
