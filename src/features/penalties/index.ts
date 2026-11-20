/**
 * BellePoule Modern - Penalties Index
 * Feature 23: Main entry point
 * Licensed under GPL-3.0
 */

// Store
export { usePenaltyStore } from './hooks/usePenaltyStore';

// Types
export type {
  Penalty,
  PenaltyHistory,
  PenaltyStats,
  CardType,
  PenaltyReason,
  CreatePenaltyDTO,
  PenaltyConfig,
} from '../../shared/domain/penalties/penalty.types';

// Utils
export { getPenaltyDescription, validatePenalty, getPenaltyColor } from './utils/penaltyUtils';
