/**
 * BellePoule Modern - Preload Script
 * Exposes safe APIs to the renderer process with type safety
 * Licensed under GPL-3.0
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { 
  ElectronAPI,
  CompetitionCreateData,
  CompetitionUpdateData,
  FencerCreateData,
  FencerUpdateData,
  MatchCreateData,
  MatchUpdateData,
  SessionState,
  DialogOpenOptions,
  DialogSaveOptions,
  FileOpenResult,
  FileSaveResult,
  VersionInfo,
  Pool
} from '../shared/types/preload';

// Input validation functions
const validateCompetitionData = (data: CompetitionCreateData): void => {
  if (!data.title || typeof data.title !== 'string') {
    throw new Error('Competition title is required and must be a string');
  }
  if (!data.date || !(data.date instanceof Date)) {
    throw new Error('Competition date is required and must be a Date');
  }
  if (!data.weapon || typeof data.weapon !== 'string') {
    throw new Error('Weapon is required and must be a string');
  }
};

const validateFencerData = (fencer: FencerCreateData): void => {
  if (!fencer.lastName || typeof fencer.lastName !== 'string') {
    throw new Error('Fencer last name is required and must be a string');
  }
  if (!fencer.firstName || typeof fencer.firstName !== 'string') {
    throw new Error('Fencer first name is required and must be a string');
  }
  if (typeof fencer.ref !== 'number' || fencer.ref < 0) {
    throw new Error('Fencer reference number is required and must be positive');
  }
};

const validateMatchData = (match: MatchCreateData): void => {
  if (typeof match.number !== 'number' || match.number < 0) {
    throw new Error('Match number is required and must be positive');
  }
  if (typeof match.maxScore !== 'number' || match.maxScore < 0) {
    throw new Error('Match max score is required and must be positive');
  }
};

// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations with validation
  db: {
    // Competitions
    createCompetition: (data: CompetitionCreateData) => {
      validateCompetitionData(data);
      return ipcRenderer.invoke('db:createCompetition', data);
    },
    getCompetition: (id: string) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getCompetition', id);
    },
    getAllCompetitions: () => ipcRenderer.invoke('db:getAllCompetitions'),
    updateCompetition: (id: string, updates: CompetitionUpdateData) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:updateCompetition', id, updates);
    },
    deleteCompetition: (id: string) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:deleteCompetition', id);
    },
    
    // Fencers
    addFencer: (competitionId: string, fencer: FencerCreateData) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      validateFencerData(fencer);
      return ipcRenderer.invoke('db:addFencer', competitionId, fencer);
    },
    getFencer: (id: string) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Fencer ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getFencer', id);
    },
    getFencersByCompetition: (competitionId: string) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getFencersByCompetition', competitionId);
    },
    updateFencer: (id: string, updates: FencerUpdateData) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Fencer ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:updateFencer', id, updates);
    },
    deleteFencer: (id: string) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Fencer ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:deleteFencer', id);
    },
    
    // Matches
    createMatch: (match: MatchCreateData, poolId?: string) => {
      validateMatchData(match);
      return ipcRenderer.invoke('db:createMatch', match, poolId);
    },
    getMatch: (id: string) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Match ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getMatch', id);
    },
    getMatchesByPool: (poolId: string) => {
      if (!poolId || typeof poolId !== 'string') {
        throw new Error('Pool ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getMatchesByPool', poolId);
    },
    updateMatch: (id: string, updates: MatchUpdateData) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Match ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:updateMatch', id, updates);
    },
    
    // Pools
    createPool: (phaseId: string, number: number) => {
      if (!phaseId || typeof phaseId !== 'string') {
        throw new Error('Phase ID is required and must be a string');
      }
      if (typeof number !== 'number' || number < 0) {
        throw new Error('Pool number is required and must be positive');
      }
      return ipcRenderer.invoke('db:createPool', phaseId, number);
    },
    addFencerToPool: (poolId: string, fencerId: string, position: number) => {
      if (!poolId || typeof poolId !== 'string') {
        throw new Error('Pool ID is required and must be a string');
      }
      if (!fencerId || typeof fencerId !== 'string') {
        throw new Error('Fencer ID is required and must be a string');
      }
      if (typeof position !== 'number' || position < 0) {
        throw new Error('Position is required and must be positive');
      }
      return ipcRenderer.invoke('db:addFencerToPool', poolId, fencerId, position);
    },
    getPoolFencers: (poolId: string) => {
      if (!poolId || typeof poolId !== 'string') {
        throw new Error('Pool ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getPoolFencers', poolId);
    },
    updatePool: (pool: Pool) => {
      if (!pool || typeof pool !== 'object') {
        throw new Error('Pool is required and must be an object');
      }
      return ipcRenderer.invoke('db:updatePool', pool);
    },
    
    // Session State
    saveSessionState: (competitionId: string, state: SessionState) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:saveSessionState', competitionId, state);
    },
    getSessionState: (competitionId: string) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getSessionState', competitionId);
    },
    clearSessionState: (competitionId: string) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:clearSessionState', competitionId);
    },
  },

  // File operations with validation
  file: {
    export: (filepath: string) => {
      if (!filepath || typeof filepath !== 'string') {
        throw new Error('Filepath is required and must be a string');
      }
      return ipcRenderer.invoke('file:export', filepath);
    },
    import: (filepath: string) => {
      if (!filepath || typeof filepath !== 'string') {
        throw new Error('Filepath is required and must be a string');
      }
      return ipcRenderer.invoke('file:import', filepath);
    },
  },

  // Dialog operations with validation
  dialog: {
    openFile: (options: DialogOpenOptions) => {
      if (!options || typeof options !== 'object') {
        throw new Error('Dialog options are required');
      }
      return ipcRenderer.invoke('dialog:openFile', options);
    },
    saveFile: (options: DialogSaveOptions) => {
      if (!options || typeof options !== 'object') {
        throw new Error('Dialog options are required');
      }
      return ipcRenderer.invoke('dialog:saveFile', options);
    },
  },

  // Menu event listeners
  onMenuNewCompetition: (callback: () => void) => 
    ipcRenderer.on('menu:new-competition', callback),
  onMenuSave: (callback: () => void) => 
    ipcRenderer.on('menu:save', callback),
  onMenuCompetitionProperties: (callback: () => void) => 
    ipcRenderer.on('menu:competition-properties', callback),
  onMenuAddFencer: (callback: () => void) => 
    ipcRenderer.on('menu:add-fencer', callback),
  onMenuAddReferee: (callback: () => void) => 
    ipcRenderer.on('menu:add-referee', callback),
  onMenuNextPhase: (callback: () => void) => 
    ipcRenderer.on('menu:next-phase', callback),
  onMenuExport: (callback: (format: string) => void) => 
    ipcRenderer.on('menu:export', (_, format) => callback(format)),
  onMenuImport: (callback: (format: string, filepath: string, content: string) => void) => 
    ipcRenderer.on('menu:import', (_, format, filepath, content) => callback(format, filepath, content)),
  onMenuReportIssue: (callback: () => void) => 
    ipcRenderer.on('menu:report-issue', callback),
  onFileOpened: (callback: (filepath: string) => void) => 
    ipcRenderer.on('file:opened', (_, filepath) => callback(filepath)),
  onFileSaved: (callback: (filepath: string) => void) => 
    ipcRenderer.on('file:saved', (_, filepath) => callback(filepath)),
  onAutosaveCompleted: (callback: () => void) => 
    ipcRenderer.on('autosave:completed', callback),
  onAutosaveFailed: (callback: () => void) => 
    ipcRenderer.on('autosave:failed', callback),

  // Remote server management
  remote: {
    startServer: (port?: number) => ipcRenderer.invoke('remote:startServer', port),
    stopServer: () => ipcRenderer.invoke('remote:stopServer'),
    getServerStatus: () => ipcRenderer.invoke('remote:getServerStatus'),
    setPort: (port: number) => ipcRenderer.invoke('remote:setPort', port),
    onServerStatusChanged: (callback: (status: { isRunning: boolean; port: number }) => void) => 
      ipcRenderer.on('remote:status-changed', (_, status) => callback(status)),
  },

  // Utility functions
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  getVersionInfo: () => ipcRenderer.invoke('app:getVersionInfo'),

  // Remove listeners
  removeAllListeners: (channel: string) => 
    ipcRenderer.removeAllListeners(channel),
});

// Type declarations for the renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
