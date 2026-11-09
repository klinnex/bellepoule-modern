/**
 * BellePoule Modern - Penalty System Types
 * Feature 23: Card management
 * Licensed under GPL-3.0
 */

import { Fencer } from '../../../shared/types';

export enum CardType {
  WHITE = 'WHITE',
  YELLOW = 'YELLOW',
  RED = 'RED',
  BLACK = 'BLACK',
}

export enum PenaltyReason {
  DELAY = 'delay', // Retard
  UNCORRECT_BEHAVIOR = 'behavior', // Comportement incorrect
  REFUSAL_OBEY = 'refusal', // Refus d'obéir
  VIOLENCE = 'violence', // Violence
  FRAUD = 'fraud', // Fraude
  DOPING = 'doping', // Dopage
  DISTURBANCE = 'disturbance', // Trouble à l'ordre
  EQUIPMENT = 'equipment', // Equipement non conforme
}

export interface Penalty {
  id: string;
  fencerId: string;
  matchId: string;
  cardType: CardType;
  reason: PenaltyReason;
  customReason?: string;
  timestamp: Date;
  strip?: number;
  bout?: number;
  scoreImpact: number; // Touches to deduct
  givenBy?: string; // Referee name
  notes?: string;
}

export interface PenaltyHistory {
  fencer: Fencer;
  penalties: Penalty[];
  whiteCards: number;
  yellowCards: number;
  redCards: number;
  blackCards: number;
  isExcluded: boolean;
  totalTouchesDeducted: number;
}

export interface PenaltyStats {
  totalPenalties: number;
  byType: Record<CardType, number>;
  byReason: Record<PenaltyReason, number>;
  byFencer: Record<string, number>;
  byMatch: Record<string, number>;
  mostPenalizedFencer?: Fencer;
  mostCommonReason?: PenaltyReason;
}

export interface CreatePenaltyDTO {
  fencerId: string;
  matchId: string;
  cardType: CardType;
  reason: PenaltyReason;
  customReason?: string;
  strip?: number;
  bout?: number;
  givenBy?: string;
  notes?: string;
}

export interface PenaltyConfig {
  whiteCardTouches: number; // Touches to deduct for white (warning, 0)
  yellowCardTouches: number; // Touches to deduct for yellow
  redCardTouches: number; // Touches to deduct for red
  blackCardTouches: number; // Touches to deduct for black (usually match loss)
  maxYellowBeforeRed: number; // How many yellows before automatic red
  autoExcludeAfterReds: number; // How many reds before exclusion
}

export const DEFAULT_PENALTY_CONFIG: PenaltyConfig = {
  whiteCardTouches: 0, // White is warning only
  yellowCardTouches: 1, // Yellow = +1 touch for opponent
  redCardTouches: 1, // Red = -1 touch
  blackCardTouches: 999, // Black = match lost
  maxYellowBeforeRed: 2, // 2nd yellow = red
  autoExcludeAfterReds: 2, // 2 reds = exclusion
};
