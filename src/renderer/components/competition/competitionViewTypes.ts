/**
 * BellePoule Modern - Props de CompetitionView (partagées avec ses hooks, #1599)
 * Licensed under GPL-3.0
 */
import type { Competition } from '../../../shared/types';

export interface CompetitionViewProps {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
  requestPhase?: string;
  onPhaseApplied?: () => void;
  onRemoteServerChange?: (url: string | null, arenaCount: number) => void;
  onOpenCompetition?: (competitionId: string) => void;
}
