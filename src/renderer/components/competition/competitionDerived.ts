/**
 * BellePoule Modern - Valeurs dérivées de la vue compétition, fonctions pures
 * (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { MatchStatus } from '../../../shared/types';
import type { Pool, PoolRanking } from '../../../shared/types';
import { filterPoolWinners } from '../../../shared/utils/poolCalculations';
import {
  applyTableauAdvancement,
  getTableauAdvancement,
} from '../../../shared/utils/customFormulaSettings';
import type { getActiveFormula } from '../../../shared/utils/customFormulaSettings';
import { rapieresTableauQualifiers } from '../../../features/rapieres/rapieresCalculations';
import type { RapieresTableauMode } from '../../../features/rapieres/rapieres.types';
import type { TableauMatch } from '../tableau/tableauTypes';

export interface MatchProgress {
  done: number;
  total: number;
  label: 'poules' | 'tableau';
}

/** Progression des matchs : poules si elles existent, sinon tableau, sinon null. */
export function computeMatchProgress(
  pools: Pool[],
  tableauMatches: TableauMatch[]
): MatchProgress | null {
  if (pools.length > 0) {
    const total = pools.reduce((s, p) => s + p.matches.length, 0);
    const done = pools.reduce(
      (s, p) => s + p.matches.filter(m => m.status === MatchStatus.FINISHED).length,
      0
    );
    return { done, total, label: 'poules' };
  }
  if (tableauMatches.length > 0) {
    const total = tableauMatches.filter(m => m.fencerA && m.fencerB).length;
    const done = tableauMatches.filter(m => m.winner !== null).length;
    return { done, total, label: 'tableau' };
  }
  return null;
}

interface TableauRankingOptions {
  isRapieres: boolean;
  rapieresTableauMode: RapieresTableauMode | undefined;
  poolWinnersOnly: boolean;
  customFormula: ReturnType<typeof getActiveFormula>;
  postPoolSplitCriteria: string | undefined;
  activeSplitGroup: string | null;
  splitOffCompetitionIds: Partial<Record<string, string>> | undefined;
}

/** Classement effectif pour le tableau (filtré par vainqueurs de poule et/ou groupe actif). */
export function computeEffectiveTableauRanking(
  overallRanking: PoolRanking[],
  pools: Pool[],
  {
    isRapieres,
    rapieresTableauMode,
    poolWinnersOnly,
    customFormula,
    postPoolSplitCriteria,
    activeSplitGroup,
    splitOffCompetitionIds,
  }: TableauRankingOptions
): PoolRanking[] {
  let ranking = overallRanking;
  if (isRapieres && pools.length > 0) {
    // Rapières : toutes les équipes, ou les 4 demi-finalistes (#1441)
    ranking = rapieresTableauQualifiers(pools, ranking, rapieresTableauMode);
  } else if (poolWinnersOnly && pools.length > 0) {
    ranking = filterPoolWinners(pools, ranking);
  } else if (customFormula) {
    // Qualifiés pour le tableau selon la formule (pourcentage, nombre, taille de tableau)
    ranking = applyTableauAdvancement(ranking, getTableauAdvancement(customFormula));
  }
  if (postPoolSplitCriteria === 'gender' && activeSplitGroup) {
    ranking = ranking
      .filter(r => (r.fencer.gender as string) === activeSplitGroup)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  } else if (postPoolSplitCriteria === 'gender' && splitOffCompetitionIds) {
    // Groupes extraits dans une compétition séparée : exclus du tableau de cette compétition
    ranking = ranking
      .filter(r => !splitOffCompetitionIds[r.fencer.gender as string])
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }
  return ranking;
}
