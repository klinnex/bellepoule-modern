/**
 * BellePoule Modern - États regroupés de PoolView (#1241)
 * Chaque groupe remplace une série de useState liés par un seul reducer
 * (useStateGroup) : les setters gardent leur nom, les appels ne changent pas.
 * Licensed under GPL-3.0
 */
import type { Referee } from '../../../shared/types';

export interface InlineEditCell {
  key: string;
  rowId: string;
  colId: string;
  matchIndex: number;
  inverted: boolean;
}

/** Saisie du score (modale et cellule inline) */
export const POOL_SCORE_INPUT_INIT = {
  editingMatch: null as number | null,
  isMatchInverted: false,
  editScoreA: '',
  editScoreB: '',
  victoryA: false,
  victoryB: false,
  matchesUpdateTrigger: 0,
  keyboardFocusField: 'A' as 'A' | 'B',
  inlineEditCell: null as InlineEditCell | null,
  inlineSingleScore: '',
  cellScoreBuffer: {} as Record<string, number>,
};

/** Modales et panneaux ponctuels de la vue poule */
export const POOL_DIALOGS_INIT = {
  showColumnMenu: false,
  showPoolConfetti: false,
  showAddFencerModal: false,
  auditMatchId: null as string | null,
  showFinishedLog: false,
  pendingSpecialStatus: null as 'abandon' | 'forfait' | 'exclusion' | null,
};

/** Modale de désignation des arbitres */
export const POOL_REFEREE_INIT = {
  showRefereeModal: false,
  competitionReferees: [] as Referee[],
  isLoadingReferees: false,
  pendingRefereeIds: [] as string[],
};
