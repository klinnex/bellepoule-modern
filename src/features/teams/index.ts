/**
 * BellePoule Modern - Team Competition Index
 * Feature 22: Main entry point
 * Licensed under GPL-3.0
 */

// Store
export { useTeamStore } from './hooks/useTeamStore';

// Types
export type {
  Team,
  TeamMatch,
  TeamPool,
  TeamFencer,
  TeamBout,
  CreateTeamDTO,
  UpdateTeamBoutScoreDTO,
  TeamStats,
  TeamFencerRow,
  TeamRow,
  TeamBoutRow,
  TeamMatchRow,
} from './types/team.types';

// Utils
export {
  generateRelayOrder,
  generateRelayBouts,
  calculateTeamScore,
  validateTeamComposition,
  getTeamTargetRule,
  getRelayCap,
  calculateTeamPoolRanking,
  calculateTableSize,
  placeRankedTeamsInTable,
  resolveTeamTableauSlot,
} from './utils/teamCalculations';
export type {
  TeamTargetRule,
  TeamPoolRankingRow,
  ResolvedTeamSlot,
} from './utils/teamCalculations';

// Bracket (élimination directe équipes)
export {
  placeTeamsInTable,
  generateTeamBracket,
  propagateTeamWinner,
} from './services/teamBracketService';
export type { TeamTableNode } from './services/teamBracketService';
