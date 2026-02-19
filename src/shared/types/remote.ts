/**
 * BellePoule Modern - Remote Score Entry Types
 * Licensed under GPL-3.0
 */

import { Fencer, Match, Score } from '../types';

export interface RemoteMatch extends Match {
  stripNumber: number;
  refereeId?: string;
  refereeName?: string;
  startTime?: Date;
  estimatedDuration?: number;
}

export interface RemoteScoreUpdate {
  matchId: string;
  scoreA: number;
  scoreB: number;
  status: 'in_progress' | 'finished' | 'abandoned';
  winner?: 'A' | 'B';
  specialStatus?: 'abandon' | 'forfait' | 'exclusion';
  timestamp: Date;
  refereeId: string;
}

export interface RemoteReferee {
  id: string;
  name: string;
  code: string; // Code d'accès simple
  isActive: boolean;
  currentMatch?: string;
  lastActivity: Date;
}

export interface RemoteStrip {
  number: number;
  status: 'available' | 'occupied' | 'maintenance';
  currentMatch?: RemoteMatch;
  assignedReferee?: string;
}

export interface RemoteSession {
  competitionId: string;
  strips: RemoteStrip[];
  referees: RemoteReferee[];
  activeMatches: RemoteMatch[];
  isRunning: boolean;
  startTime?: Date;
}

export interface WebSocketMessage {
  type:
    | 'score_update'
    | 'match_assigned'
    | 'match_finished'
    | 'referee_connected'
    | 'referee_disconnected'
    | 'strip_status_change'
    | 'score_update_broadcast';
  data: any;
  timestamp: Date;
  sender: string;
}

// Interface pour l'arbitre (vue tablette)
export interface RefereeInterface {
  referee: RemoteReferee;
  currentMatch: RemoteMatch | null;
  nextMatch: RemoteMatch | null;
  completedMatches: RemoteMatch[];
  strip: RemoteStrip;
}

// Messages client vers serveur
export interface ClientMessage {
  type: 'login' | 'score_update' | 'match_complete' | 'heartbeat' | 'logout';
  data: any;
}

// Messages serveur vers client
export interface ServerMessage {
  type:
    | 'login_success'
    | 'login_error'
    | 'match_assignment'
    | 'score_update_broadcast'
    | 'session_update'
    | 'error';
  data: any;
}

// Arena management
export interface Arena {
  id: string;
  name: string;
  number: number;
  currentMatch: ArenaMatch | null;
  status: 'idle' | 'ready' | 'in_progress' | 'finished';
  startTime: Date | null;
  elapsedTime: number; // in seconds
  settings: ArenaSettings;
}

export interface ArenaSettings {
  matchDuration: number; // in seconds
  breakDuration: number; // between matches
  autoAdvance: boolean; // automatically load next match
}

export interface ArenaMatch {
  id: string;
  poolId: string;
  fencerA: Fencer;
  fencerB: Fencer;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'in_progress' | 'finished';
  startTime: Date | null;
  endTime: Date | null;
  duration?: number; // in seconds
}

export interface ArenaUpdate {
  arenaId: string;
  match: ArenaMatch | null;
  scoreA?: number;
  scoreB?: number;
  time?: number;
  status: Arena['status'];
  fencerA?: Fencer;
  fencerB?: Fencer;
  timerStatus?: 'running' | 'paused' | 'reset';
  cardsA?: string[];
  cardsB?: string[];
}

export interface RefereeControl {
  startMatch: () => void;
  pauseMatch: () => void;
  addScore: (fencer: 'A' | 'B', points: number) => void;
  setScore: (scoreA: number, scoreB: number) => void;
  finishMatch: () => void;
  nextMatch: () => void;
}
