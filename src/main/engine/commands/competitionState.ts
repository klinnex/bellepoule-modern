/**
 * BellePoule Modern - État de l'épreuve exposé par le contrat (#1980, docs/adr/0017, étape 4a)
 * Projection tenue par le moteur dans session_state, lue par getCompetitionState : l'écran la
 * relit quand le journal avance au lieu de relire le bloc par sa propre API.
 * Licensed under GPL-3.0
 */
import type { CompetitionStateDTO } from '../../../shared/api/contract';

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** État d'une épreuve à partir du bloc de session ; null si l'épreuve n'a jamais été ouverte */
export function competitionState(session: Record<string, unknown>): CompetitionStateDTO | null {
  if (Object.keys(session).length === 0) return null;
  const ui = (session.uiState ?? {}) as { currentPoolRound?: number };
  const prep = session.poolPrepParams as CompetitionStateDTO['poolPrepParams'];
  return {
    currentPhase: typeof session.currentPhase === 'number' ? session.currentPhase : 0,
    pools: arr(session.pools),
    poolHistory: arr(session.poolHistory),
    appelHistory: arr(session.appelHistory),
    overallRanking: arr(session.overallRanking),
    tableauMatches: arr(session.tableauMatches),
    finalResults: arr(session.finalResults),
    consolationBrackets: arr(session.consolationBrackets),
    // Tour courant : l'écran le range dans uiState, le moteur au premier niveau
    currentPoolRound: Number(ui.currentPoolRound ?? session.currentPoolRound ?? 1) || 1,
    skipPoolPhase: session.skipPoolPhase === true,
    ...(typeof session.poolsLaunched === 'boolean' ? { poolsLaunched: session.poolsLaunched } : {}),
    ...(typeof session.remoteArenaCount === 'number'
      ? { remoteArenaCount: session.remoteArenaCount }
      : {}),
    ...(typeof session.remoteStripStart === 'number'
      ? { remoteStripStart: session.remoteStripStart }
      : {}),
    ...(session.rapieres ? { rapieres: session.rapieres as CompetitionStateDTO['rapieres'] } : {}),
    ...(prep ? { poolPrepParams: prep } : {}),
  };
}
