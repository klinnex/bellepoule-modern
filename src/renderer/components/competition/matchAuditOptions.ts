/**
 * BellePoule Modern - Options du journal des matchs (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import type { Pool } from '../../../shared/types';
import type { MatchAuditOption } from '../MatchAuditLog';
import { getRoundName } from '../tableau/tableauCalculations';
import type { TableauMatch } from '../tableau/tableauTypes';

/** Libellés + arbitres des matchs pour le journal (sélection par match / arbitre) */
export function buildMatchAuditOptions(
  allPools: Pool[],
  tableau: TableauMatch[],
  competitionId: string
): MatchAuditOption[] {
  const name = (f: { lastName: string } | null | undefined) => f?.lastName ?? '?';
  const refName = (r: { firstName: string; lastName: string }) =>
    `${r.firstName} ${r.lastName}`.trim();
  const poolOpts = allPools.flatMap(p =>
    (p.matches ?? []).map(m => ({
      id: m.id,
      label: `Poule ${p.number} — M${m.number} : ${name(m.fencerA)} vs ${name(m.fencerB)}`,
      referees: m.referee ? [refName(m.referee)] : [],
    }))
  );
  const tableauOpts = tableau
    .filter(m => !m.isBye && (m.fencerA || m.fencerB))
    .sort((a, b) => b.round - a.round || a.position - b.position)
    .flatMap(m => {
      const opt = {
        id: m.id,
        label: `${getRoundName(m.round)} — ${name(m.fencerA)} vs ${name(m.fencerB)}`,
        referees: (m.referees?.length ? m.referees : m.referee ? [m.referee] : []).map(refName),
      };
      // Événements de tablette stockés sous l'id DB composite (#1031)
      return [opt, { ...opt, id: `${competitionId}-${m.id}` }];
    });
  return [...poolOpts, ...tableauOpts];
}
