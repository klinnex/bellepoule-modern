/**
 * BellePoule Modern - Types internes du serveur distant
 * (extraits de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

import { FencerStatus } from '../../shared/types';

/** Carton noir distribué depuis une tablette (annulable depuis la sélection des matchs) */
export interface BlackCardRecord {
  fencerId: string;
  matchId: string;
  arenaId: string | null;
  poolId: string | null;
  previousStatus: FencerStatus;
  fencerName: string;
  opponentName: string;
  timestamp: number;
}

// Format arène Sabre Laser équipe : état de saisie temps réel pour une
// rencontre assignée à une arène. Distinct de `Arena`/`ArenaMatch`
// (scoring individuel) — aucun champ ni logique partagée.
export interface TeamArenaBout {
  id: string;
  boutOrder: number;
  fencerAId: string;
  fencerAName: string;
  fencerBId: string;
  fencerBName: string;
  scoreA: number;
  scoreB: number;
  maxScore: number;
  status: string;
  winnerId: string | null;
}

export interface TeamArenaCard {
  id: string;
  teamId: string;
  type: 'white' | 'yellow' | 'red' | 'black';
  createdAt: string;
}

export interface TeamArenaState {
  matchId: string;
  competitionId: string;
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  isLaserPoints: boolean; // saisie par zones A/B/C (1/3/5) ou touche simple
  bouts: TeamArenaBout[];
  currentBoutIndex: number; // index dans `bouts`
  liveScoreA: number; // score de l'assaut en cours, pas encore persisté
  liveScoreB: number;
  elapsedAccumulatedSec: number; // temps déjà écoulé (assaut en pause)
  timerStartedAt: number | null; // epoch ms, null = chrono à l'arrêt
  cards: TeamArenaCard[];
}
