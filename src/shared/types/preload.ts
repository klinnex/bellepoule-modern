/**
 * BellePoule Modern - Preload API Types
 * Type-safe API interfaces for IPC communication
 * Licensed under GPL-3.0
 */

import { 
  Competition, 
  Fencer, 
  Match, 
  Pool, 
  Referee, 
  CompetitionSettings,
  ImportResult,
  ExportFormat,
  Phase,
  DirectEliminationTable
} from '../types';

// Re-export Pool for preload
export type { Pool } from '../types';

// ============================================================================
// Database API Types
// ============================================================================

export interface CompetitionCreateData {
  title: string;
  date: Date;
  weapon: string;
  gender: string;
  category: string;
  settings?: Partial<CompetitionSettings>;
}

export interface CompetitionUpdateData {
  title?: string;
  date?: Date;
  location?: string;
  organizer?: string;
  settings?: Partial<CompetitionSettings>;
}

export interface FencerCreateData {
  ref: number;
  lastName: string;
  firstName: string;
  birthDate?: Date;
  gender: string;
  nationality: string;
  league?: string;
  club?: string;
  license?: string;
  ranking?: number;
}

export interface FencerUpdateData {
  lastName?: string;
  firstName?: string;
  birthDate?: Date;
  gender?: string;
  nationality?: string;
  league?: string;
  club?: string;
  license?: string;
  ranking?: number;
  status?: string;
}

export interface MatchCreateData {
  number: number;
  fencerAId?: string;
  fencerBId?: string;
  maxScore: number;
  poolId?: string;
  tableId?: string;
  round?: number;
  position?: number;
}

export interface MatchUpdateData {
  scoreA?: { value: number | null; isVictory: boolean };
  scoreB?: { value: number | null; isVictory: boolean };
  status?: string;
  strip?: number;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

export interface SessionState {
  currentPhase?: number;
  selectedPool?: string;
  selectedTable?: string;
  uiState?: Record<string, any>;
  lastSaveTime?: Date;
}

// ============================================================================
// File API Types
// ============================================================================

export interface FileOpenOptions {
  title: string;
  filters: Array<{
    name: string;
    extensions: string[];
  }>;
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
}

export interface FileSaveOptions {
  title: string;
  filters: Array<{
    name: string;
    extensions: string[];
  }>;
  defaultPath?: string;
}

export interface FileOpenResult {
  filePath: string;
  content?: string;
}

export interface FileSaveResult {
  filePath: string;
  success: boolean;
}

// ============================================================================
// Dialog API Types
// ============================================================================

export interface DialogOpenOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
}

export interface DialogSaveOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

// ============================================================================
// Menu Event Types
// ============================================================================

export interface MenuEventData {
  format?: string;
  filepath?: string;
  content?: string;
}

// ============================================================================
// Version Info Types
// ============================================================================

export interface VersionInfo {
  version: string;
  build: number;
  date: string;
}

// ============================================================================
// Complete API Interface Types
// ============================================================================

export interface DatabaseAPI {
  // Competitions
  createCompetition: (data: CompetitionCreateData) => Promise<Competition>;
  getCompetition: (id: string) => Promise<Competition | null>;
  getAllCompetitions: () => Promise<Competition[]>;
  updateCompetition: (id: string, updates: CompetitionUpdateData) => Promise<void>;
  deleteCompetition: (id: string) => Promise<void>;
  
  // Fencers
  addFencer: (competitionId: string, fencer: FencerCreateData) => Promise<Fencer>;
  getFencer: (id: string) => Promise<Fencer | null>;
  getFencersByCompetition: (competitionId: string) => Promise<Fencer[]>;
  updateFencer: (id: string, updates: FencerUpdateData) => Promise<void>;
  deleteFencer: (id: string) => Promise<void>;
  
  // Matches
  createMatch: (match: MatchCreateData, poolId?: string) => Promise<Match>;
  getMatch: (id: string) => Promise<Match | null>;
  getMatchesByPool: (poolId: string) => Promise<Match[]>;
  updateMatch: (id: string, updates: MatchUpdateData) => Promise<void>;
  
  // Pools
  createPool: (phaseId: string, number: number) => Promise<Pool>;
  addFencerToPool: (poolId: string, fencerId: string, position: number) => Promise<void>;
  getPoolFencers: (poolId: string) => Promise<Fencer[]>;
  updatePool: (pool: Pool) => Promise<void>;
  
  // Session State
  saveSessionState: (competitionId: string, state: SessionState) => Promise<void>;
  getSessionState: (competitionId: string) => Promise<SessionState | null>;
  clearSessionState: (competitionId: string) => Promise<void>;
}

export interface FileAPI {
  export: (filepath: string) => Promise<FileSaveResult>;
  import: (filepath: string) => Promise<FileOpenResult>;
}

export interface DialogAPI {
  openFile: (options: DialogOpenOptions) => Promise<FileOpenResult | null>;
  saveFile: (options: DialogSaveOptions) => Promise<FileSaveResult | null>;
}

export interface MenuAPI {
  onMenuNewCompetition: (callback: () => void) => void;
  onMenuSave: (callback: () => void) => void;
  onMenuCompetitionProperties: (callback: () => void) => void;
  onMenuAddFencer: (callback: () => void) => void;
  onMenuAddReferee: (callback: () => void) => void;
  onMenuNextPhase: (callback: () => void) => void;
  onMenuExport: (callback: (format: string) => void) => void;
  onMenuImport: (callback: (format: string, filepath: string, content: string) => void) => void;
  onMenuReportIssue: (callback: () => void) => void;
  onFileOpened: (callback: (filepath: string) => void) => void;
  onFileSaved: (callback: (filepath: string) => void) => void;
  onAutosaveCompleted: (callback: () => void) => void;
  onAutosaveFailed: (callback: () => void) => void;
}

export interface RemoteAPI {
  startServer: (port?: number) => Promise<{ success: boolean; message: string }>;
  stopServer: () => Promise<{ success: boolean; message: string }>;
  getServerStatus: () => Promise<{ isRunning: boolean; port: number }>;
  setPort: (port: number) => Promise<{ success: boolean; message: string }>;
  onServerStatusChanged: (callback: (status: { isRunning: boolean; port: number }) => void) => void;
}

export interface UtilityAPI {
  openExternal: (url: string) => Promise<void>;
  getVersionInfo: () => Promise<VersionInfo>;
  removeAllListeners: (channel: string) => void;
}

export interface ElectronAPI extends MenuAPI, UtilityAPI {
  db: DatabaseAPI;
  file: FileAPI;
  dialog: DialogAPI;
  remote: RemoteAPI;
}