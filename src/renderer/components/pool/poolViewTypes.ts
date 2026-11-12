/**
 * BellePoule Modern - Types de PoolView (extrait, #1599)
 * Licensed under GPL-3.0
 */
import type { Fencer, Pool, Referee, Weapon } from '../../../shared/types';
import type { Arena } from '../../../shared/types/remote';

export interface PoolViewProps {
  pool: Pool;
  maxScore?: number;
  weapon?: Weapon;
  /** Égalité tranchée par V (olympique, rapières, laser) — défaut : laser */
  tieBreakByVictory?: boolean;
  competitionName?: string;
  competitionId?: string;
  onScoreUpdate: (
    matchIndex: number,
    scoreA: number,
    scoreB: number,
    winnerOverride?: 'A' | 'B',
    specialStatus?: 'abandon' | 'forfait' | 'exclusion',
    priority?: 'A' | 'B'
  ) => void;
  onMatchReset?: (matchIndex: number) => void;
  onMatchCancel?: (matchIndex: number) => void;
  onFencerChangePool?: (fencer: Fencer) => void;
  onFencerStatusChange?: (
    fencerId: string,
    status: 'abandon' | 'forfait' | 'exclusion',
    blackCard?: boolean
  ) => void;
  onFencerAdded?: (updatedPool: Pool) => void;
  assignedFencerIds?: ReadonlySet<string>;
  stripRange?: { start: number; end: number };
  onStripChange?: (poolId: string, strip: number | undefined) => void;
  arenas?: Arena[];
  isRemoteActive?: boolean;
  remoteServerUrl?: string;
  /** Saisie distante active : QR de la piste de la poule sur la feuille (aperçu/impression/export) */
  stripQr?: { url?: string; strip: number };
  /** Facteur de taille des cartes de poule (préréglage) */
  cardScale?: number;
  onMatchArenaChange?: (
    matchId: string,
    oldArena: number,
    newArena: number | null,
    fencerA?: Fencer | null,
    fencerB?: Fencer | null
  ) => void;
  onRefereeAssigned?: (poolId: string, referees: Referee[]) => void;
  /** Nombre max d'arbitres assignables simultanément (mode expert) ; 1 = sélection unique */
  maxRefereesPerPool?: number;
  /** Arbitres de la compétition utilisés par le remplissage automatique (gestion des arbitres active) */
  autoFillReferees?: Referee[];
  /** Arbitres assignés par le remplissage automatique (matchId → arbitre) */
  onAutoFillReferees?: (assignments: Map<string, Referee>) => void;
  /** Tournoi des rapières : matchs de la vague en cours (surbrillance violette) */
  waveMatchIds?: ReadonlySet<string>;
}

export type ViewMode = 'grid' | 'matches';
