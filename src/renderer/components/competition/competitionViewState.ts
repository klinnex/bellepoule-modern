/**
 * BellePoule Modern - États initiaux regroupés de CompetitionView (#1241)
 * Licensed under GPL-3.0
 */
import type { Arena } from '../../../shared/types/remote';
import type { Fencer, Match, Referee } from '../../../shared/types';
import type { ConsolationBracket, FinalResult, TableauMatch } from '../tableau/tableauTypes';

export const CV_REMOTE_INIT = {
  isRemoteActive: false,
  remoteServerUrl: null as string | null,
  remoteArenaCount: 1,
};

export const CV_PLANNING_INIT = {
  minFencersPerPool: 5,
  maxFencersPerPool: 7,
  rankingChanged: false,
  rankingValidated: false,
  skipPoolPhase: false,
};

export const CV_SPLIT_INIT = {
  activeSplitGroup: null as string | null,
  pendingSplitOffGroup: null as string | null,
  splitOffInProgress: false,
  splitTableauStates: {} as Record<
    string,
    { matches: TableauMatch[]; consolation: ConsolationBracket[]; results: FinalResult[] }
  >,
};

export const CV_DATA_INIT = {
  arenaStates: [] as Arena[],
  tableauMatches: [] as TableauMatch[],
  consolationBrackets: [] as ConsolationBracket[],
  finalResults: [] as FinalResult[],
  appelFencers: [] as Fencer[],
  appelVisibleColumns: [] as string[],
  tableauEditUnlocked: false,
  selectedMatch: null as Match | null,
  referees: [] as Referee[],
};
