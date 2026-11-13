/**
 * BellePoule Modern - Types des événements de match (touches, cartons, timing, sorties)
 * Licensed under GPL-3.0
 */

export interface MatchTouchData {
  id: string;
  matchId: string;
  fencerId: string;
  zone: string; // TargetZone: A | B | C
  points: number;
  timestamp: string; // ISO 8601
  isValidInSuddenDeath?: boolean;
  isReversed?: boolean;
}

export interface MatchCardData {
  id: string;
  matchId: string;
  fencerId: string;
  cardType: string; // 'yellow' | 'red' | 'black'
  reason: string; // CardReason
  cardGroup: number; // 1–4
  timestamp: string; // ISO 8601
  pointsAwarded: number;
  resultingExclusion?: boolean;
}

export interface MatchTimingData {
  matchId: string;
  startTime: string | null; // ISO 8601
  endTime: string | null; // ISO 8601
  duration: number | null; // secondes
}

/** Événements simulés d'un match rempli automatiquement */
export interface SimulatedMatchEvents {
  timing: Omit<MatchTimingData, 'matchId'>;
  touches: MatchTouchData[];
  cards: MatchCardData[];
}

export interface ArenaExitData {
  id: string;
  matchId: string;
  fencerId: string;
  exitType: 'arena_exit' | 'arena_exit_voluntary';
  timestamp: string; // ISO 8601
  pointsAwarded: number;
}
