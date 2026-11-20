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
} from '../../shared/domain/teams/team.types';

// Utils
export {
  generateRelayOrder,
  relayOrderFor,
  FIE_RELAY_ORDER_3,
  generateRelayBouts,
  calculateTeamScore,
  validateTeamComposition,
  getTeamTargetRule,
  getRelayCap,
  calculateTeamPoolRanking,
  calculateTableSize,
  placeRankedTeamsInTable,
  resolveTeamTableauSlot,
} from '../../shared/domain/teams/teamCalculations';
export type {
  TeamTargetRule,
  TeamPoolRankingRow,
  ResolvedTeamSlot,
} from '../../shared/domain/teams/teamCalculations';

// Bracket (élimination directe équipes)
export {
  placeTeamsInTable,
  generateTeamBracket,
  propagateTeamWinner,
} from '../../shared/domain/teams/teamBracketService';
export type { TeamTableNode } from '../../shared/domain/teams/teamBracketService';
