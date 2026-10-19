/**
 * BellePoule Modern - Tournoi des rapières (mode spécial, arme « À la carte ») (#1118)
 * Binômes de deux tireurs, poules par niveau jouées en vagues, tableau à élimination directe.
 * Licensed under GPL-3.0
 */

export type RapieresLevel = 'beginner' | 'intermediate' | 'expert';

export type RapieresAgeCategory = 'M20' | 'SENIOR' | 'V1' | 'V2' | 'V3' | 'V4' | 'HANDI';

export const RAPIERES_LEVELS: RapieresLevel[] = ['beginner', 'intermediate', 'expert'];

export const RAPIERES_AGE_CATEGORIES: RapieresAgeCategory[] = [
  'M20',
  'SENIOR',
  'V1',
  'V2',
  'V3',
  'V4',
  'HANDI',
];

export interface RapieresFencer {
  firstName: string;
  lastName: string;
  category: RapieresAgeCategory;
}

/** Statut d'une équipe, comme pour un tireur en compétition classique */
export type RapieresTeamStatus =
  'not_checked_in' | 'checked_in' | 'abandoned' | 'forfait' | 'excluded';

export interface RapieresTeam {
  id: string;
  name: string;
  level: RapieresLevel;
  fencers: [RapieresFencer, RapieresFencer];
  /** Absent (états antérieurs) = pointée */
  status?: RapieresTeamStatus;
}

/** Rencontre de poule : une manche, un score */
export interface RapieresBout {
  id: string;
  poolIndex: number;
  wave: number; // 1 = première vague
  teamAId: string;
  teamBId: string;
  scoreA: number | null;
  scoreB: number | null;
}

export interface RapieresPool {
  teamIds: string[];
}

/** Score saisi d'un match de tableau, repéré par tour (nb de matchs du tour) et position */
export interface RapieresTableauScore {
  round: number; // tableSize/2 = 1er tour, …, 1 = finale, 0 = match pour la 3e place
  position: number;
  scoreA: number;
  scoreB: number;
}

export interface RapieresTableau {
  /** Équipes qualifiées, ordre des têtes de série */
  seeds: string[];
  size: number;
  scores: RapieresTableauScore[];
}

export interface RapieresState {
  version: 1;
  teams: RapieresTeam[];
  pools: RapieresPool[];
  bouts: RapieresBout[];
  /** Dernière vague lancée par le DT (0 = aucune) */
  launchedWave: number;
  poolMaxScore: number;
  tableauMaxScore: number;
  tableau?: RapieresTableau;
}

export interface RapieresStats {
  matches: number;
  victories: number;
  touchesGiven: number;
  touchesReceived: number;
}

export interface RapieresRankingRow {
  rank: number;
  teamId: string;
  stats: RapieresStats;
}

export interface RapieresTableauMatch {
  round: number;
  position: number;
  teamAId: string | null;
  teamBId: string | null;
  /** Équipe qualifiée d'office (adversaire absent) */
  isBye: boolean;
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  loserId: string | null;
  /** Gagné d'office : l'adversaire a abandonné, déclaré forfait ou été exclu */
  walkover?: boolean;
}

export const createRapieresState = (): RapieresState => ({
  version: 1,
  teams: [],
  pools: [],
  bouts: [],
  launchedWave: 0,
  poolMaxScore: 5,
  tableauMaxScore: 10,
});
