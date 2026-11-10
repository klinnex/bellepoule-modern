/**
 * BellePoule Modern - Types et helpers partagés de RemoteScoreManager (extrait, #1599)
 * Licensed under GPL-3.0
 */
import { Competition, Pool } from '../../../shared/types';
import { TableauMatch, ConsolationBracket } from '../tableau/tableauTypes';

export interface RemoteScoreManagerProps {
  competition: Competition;
  pools: Pool[];
  tableauMatches?: TableauMatch[];
  consolationBrackets?: ConsolationBracket[];
  onArenaCountChange?: (count: number) => void;
  /** Piste de départ de l'intervalle (la piste de fin = nombre transmis à onArenaCountChange) */
  onStripStartChange?: (start: number) => void;
  onStartRemote: () => void;
  onStopRemote: () => void;
  /** Serveur démarré et joignable (IPC utilisables) */
  onServerStarted?: (url: string) => void;
  isRemoteActive?: boolean;
  initialStripCount?: number;
  initialStripStart?: number;
  isVisible?: boolean;
}

export interface RemoteSession {
  competitionId: string;
  strips: Array<{
    number: number;
    status: 'available' | 'occupied' | 'maintenance';
    currentMatch?: any;
    assignedReferee?: string;
  }>;
  isRunning: boolean;
  startTime?: Date;
}

/** Clé de synchro des matchs DE : id + arbitre(s) assigné(s) */
export function deMatchesKey(
  matches: Array<{ id: string; referee?: { id: string } | null; referees?: Array<{ id: string }> }>
): string {
  return matches
    .map(
      m =>
        `${m.id}:${(m.referees?.length ? m.referees : m.referee ? [m.referee] : []).map(r => r.id).join('+')}`
    )
    .join(',');
}
