/**
 * BellePoule Modern - Données du rapport d'exclusion (carton noir) pour la FFE (#1829)
 * Tireurs exclus par carton noir ; pour chacun, match de la sanction : celui où la base porte
 * un carton noir pour ce tireur, sinon son dernier match joué (poule ou tableau).
 * Licensed under GPL-3.0
 */

import { MatchStatus, type Fencer, type Pool } from '../../shared/types';
import type { TableauMatch } from '../../shared/domain/tableau/tableauTypes';
import type { BlackCardReportEntry } from '../../shared/utils/pdfExport/blackCardReportPdf';
import { isBlackCardExcluded } from '../../shared/domain/fencers/fencerStatus';
import type { BpmClient } from '../../shared/api/client';
import { defaultBpmClient } from '../api/IpcClient';

interface Candidate {
  id: string;
  phase: string;
  fencerA: Fencer | null | undefined;
  fencerB: Fencer | null | undefined;
  scoreA?: number | null;
  scoreB?: number | null;
  strip?: number | null;
  referee?: string;
  at?: Date;
}

const fullName = (f?: Fencer | null): string =>
  f ? `${f.lastName.toUpperCase()} ${f.firstName ?? ''}`.trim() : '';

/** Règle unique : shared/domain/fencers/fencerStatus (#1979, lot 4) */
export const isBlackCardExclusion = (f: Fencer): boolean => isBlackCardExcluded(f);

export async function buildBlackCardEntries(
  fencers: Fencer[],
  pools: Pool[] = [],
  tableauMatches: TableauMatch[] = [],
  client: BpmClient = defaultBpmClient
): Promise<BlackCardReportEntry[]> {
  const excluded = fencers.filter(isBlackCardExclusion);
  if (excluded.length === 0) return [];
  const candidates: Candidate[] = [
    ...pools.flatMap(p =>
      (p.matches ?? [])
        .filter(m => m.status === MatchStatus.FINISHED)
        .map(m => ({
          id: m.id,
          phase: `Poule ${p.number}`,
          fencerA: m.fencerA,
          fencerB: m.fencerB,
          scoreA: m.scoreA?.value,
          scoreB: m.scoreB?.value,
          strip: m.strip ?? p.strip,
          referee: m.referee
            ? `${m.referee.lastName} ${m.referee.firstName ?? ''}`.trim()
            : undefined,
          at: m.updatedAt ? new Date(m.updatedAt) : undefined,
        }))
    ),
    ...tableauMatches
      .filter(m => !m.isBye && m.winner)
      .map(m => ({
        id: m.id,
        phase: m.round > 1 ? `Tableau de ${m.round}` : 'Finale',
        fencerA: m.fencerA,
        fencerB: m.fencerB,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        strip: m.arena,
        referee: m.referee ? `${m.referee.lastName} ${m.referee.firstName}`.trim() : undefined,
      })),
  ];
  // Contrat d'API (#1981) : requête getMatchCards ; hors Electron, repli sur le dernier match
  const getCards = (matchId: string) => client.query('getMatchCards', { matchId });

  const entries: BlackCardReportEntry[] = [];
  for (const f of excluded) {
    const own = candidates.filter(c => c.fencerA?.id === f.id || c.fencerB?.id === f.id);
    let match: Candidate | undefined;
    let at: Date | undefined;
    for (const c of own) {
      const black = (await getCards(c.id).catch(() => [])).find(
        r => r.fencerId === f.id && r.cardType === 'black'
      );
      if (black) {
        match = c;
        at = new Date(black.timestamp);
        break;
      }
    }
    match ??= [...own].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))[0];
    const isA = match?.fencerA?.id === f.id;
    entries.push({
      fencer: { lastName: f.lastName, firstName: f.firstName, license: f.license, club: f.club },
      phase: match?.phase,
      opponent: match ? fullName(isA ? match.fencerB : match.fencerA) : undefined,
      score:
        match && match.scoreA != null && match.scoreB != null
          ? isA
            ? `${match.scoreA} – ${match.scoreB}`
            : `${match.scoreB} – ${match.scoreA}`
          : undefined,
      strip: match?.strip ?? undefined,
      referee: match?.referee,
      at: at ?? match?.at,
    });
  }
  return entries;
}
