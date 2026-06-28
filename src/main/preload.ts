/**
 * BellePoule Modern - Preload Script
 * Exposes safe APIs to the renderer process with type safety
 * Licensed under GPL-3.0
 */

import { contextBridge, ipcRenderer } from 'electron';

// DIAGNOSTIC inconditionnel : affiche les sondes serveur dans la console renderer.
ipcRenderer.on('remote:diag', (_: any, msg: string) => {
  console.warn('[DIAG serveur]', msg);
});
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
  Pool,
  MatchTouchData,
  MatchCardData,
  MatchTimingData,
  MatchSnapshot,
  ArenaExitData,
} from '../shared/types/preload';

// Input validation functions
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validateUUID = (id: string, label: string): void => {
  if (!id || !UUID_RE.test(id)) throw new Error(`Invalid ${label} format`);
};

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
  // ref est optionnel - il sera généré automatiquement par la base de données
  if (fencer.ref !== undefined && (typeof fencer.ref !== 'number' || fencer.ref < 0)) {
    throw new Error('Fencer reference number must be positive');
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
      validateUUID(id, 'competition ID');
      return ipcRenderer.invoke('db:getCompetition', id);
    },
    getAllCompetitions: () => ipcRenderer.invoke('db:getAllCompetitions'),
    updateCompetition: (id: string, updates: CompetitionUpdateData) => {
      validateUUID(id, 'competition ID');
      return ipcRenderer.invoke('db:updateCompetition', id, updates);
    },
    deleteCompetition: (id: string) => {
      validateUUID(id, 'competition ID');
      return ipcRenderer.invoke('db:deleteCompetition', id);
    },

    // Fencers
    addFencer: (competitionId: string, fencer: FencerCreateData) => {
      validateUUID(competitionId, 'competition ID');
      validateFencerData(fencer);
      return ipcRenderer.invoke('db:addFencer', competitionId, fencer);
    },
    getFencer: (id: string) => {
      validateUUID(id, 'fencer ID');
      return ipcRenderer.invoke('db:getFencer', id);
    },
    getFencersByCompetition: (competitionId: string) => {
      validateUUID(competitionId, 'competition ID');
      return ipcRenderer.invoke('db:getFencersByCompetition', competitionId);
    },
    updateFencer: (id: string, updates: FencerUpdateData) => {
      validateUUID(id, 'fencer ID');
      return ipcRenderer.invoke('db:updateFencer', id, updates);
    },
    deleteFencer: (id: string) => {
      validateUUID(id, 'fencer ID');
      return ipcRenderer.invoke('db:deleteFencer', id);
    },
    deleteAllFencers: (competitionId: string) => {
      validateUUID(competitionId, 'competition ID');
      return ipcRenderer.invoke('db:deleteAllFencers', competitionId);
    },

    // Matches
    createMatch: (match: MatchCreateData, poolId?: string) => {
      validateMatchData(match);
      return ipcRenderer.invoke('db:createMatch', match, poolId);
    },
    getMatch: (id: string) => {
      validateUUID(id, 'match ID');
      return ipcRenderer.invoke('db:getMatch', id);
    },
    getMatchesByPool: (poolId: string) => {
      if (!poolId || typeof poolId !== 'string') {
        throw new Error('Pool ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getMatchesByPool', poolId);
    },
    updateMatch: (id: string, updates: MatchUpdateData) => {
      validateUUID(id, 'match ID');
      return ipcRenderer.invoke('db:updateMatch', id, updates);
    },

    upsertTableauMatch: (params: any) => ipcRenderer.invoke('db:upsertTableauMatch', params),
    upsertMultipleTableauMatches: (competitionId: string, matches: any[]) =>
      ipcRenderer.invoke('db:upsertMultipleTableauMatches', competitionId, matches),
    getTableauMatchesForExport: (competitionId: string) =>
      ipcRenderer.invoke('db:getTableauMatchesForExport', competitionId),

    // Pools
    createPool: (phaseId: string, number: number, poolId?: string) => {
      if (!phaseId || typeof phaseId !== 'string') {
        throw new Error('Phase ID is required and must be a string');
      }
      if (typeof number !== 'number' || number < 0) {
        throw new Error('Pool number is required and must be positive');
      }
      return ipcRenderer.invoke('db:createPool', phaseId, number, poolId);
    },
    clearPoolsForPhase: (phaseId: string) => {
      if (!phaseId || typeof phaseId !== 'string') {
        throw new Error('Phase ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:clearPoolsForPhase', phaseId);
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
    addFencerToPoolMidCompetition: (poolId: string, fencerId: string, maxScore?: number) => {
      if (!poolId || typeof poolId !== 'string') {
        throw new Error('Pool ID is required and must be a string');
      }
      if (!fencerId || typeof fencerId !== 'string') {
        throw new Error('Fencer ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:addFencerToPoolMidCompetition', poolId, fencerId, maxScore);
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
    getPoolsByPhase: (phaseId: string) => ipcRenderer.invoke('db:getPoolsByPhase', phaseId),
    getPoolSignatures: (poolId: string) => ipcRenderer.invoke('db:getPoolSignatures', poolId),
    getDEMatchSignaturesByMatchIds: (matchIds: string[]) =>
      ipcRenderer.invoke('db:getDEMatchSignaturesByMatchIds', matchIds),
    updatePoolReferee: (poolId: string, refereeId: string | null) =>
      ipcRenderer.invoke('db:updatePoolReferee', poolId, refereeId),

    // Phases
    createPhase: (competitionId: string, type: string, order: number, name: string) =>
      ipcRenderer.invoke('db:createPhase', competitionId, type, order, name),
    getPhase: (id: string) => ipcRenderer.invoke('db:getPhase', id),
    getPhasesByCompetition: (competitionId: string) =>
      ipcRenderer.invoke('db:getPhasesByCompetition', competitionId),
    updatePhase: (id: string, updates: { name?: string; isComplete?: boolean }) =>
      ipcRenderer.invoke('db:updatePhase', id, updates),
    deletePhase: (id: string) => ipcRenderer.invoke('db:deletePhase', id),

    // Referees
    createReferee: (
      competitionId: string,
      data: {
        name: string;
        gender?: string;
        nationality?: string;
        club?: string;
        license?: string;
        category?: string;
      }
    ) => ipcRenderer.invoke('db:createReferee', competitionId, data),
    getReferee: (id: string) => ipcRenderer.invoke('db:getReferee', id),
    getRefereesByCompetition: (competitionId: string) =>
      ipcRenderer.invoke('db:getRefereesByCompetition', competitionId),
    updateReferee: (id: string, updates: Record<string, string | undefined>) =>
      ipcRenderer.invoke('db:updateReferee', id, updates),
    deleteReferee: (id: string) => ipcRenderer.invoke('db:deleteReferee', id),
    getMatchesWithReferees: (competitionId: string) =>
      ipcRenderer.invoke('db:getMatchesWithReferees', competitionId),

    // Touch / Card read
    getTouches: (matchId: string) => ipcRenderer.invoke('db:getTouches', matchId),
    getCards: (matchId: string) => ipcRenderer.invoke('db:getCards', matchId),

    // Session State
    saveSessionState: (competitionId: string, state: SessionState) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:saveSessionState', competitionId, state);
    },
    saveSessionStateSync: (competitionId: string, state: unknown): boolean => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      return ipcRenderer.sendSync('db:saveSessionStateSync', competitionId, state);
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

    // Statistiques combattants
    saveTouch: (touch: MatchTouchData) => ipcRenderer.invoke('db:saveTouch', touch),
    saveCard: (card: MatchCardData) => ipcRenderer.invoke('db:saveCard', card),
    updateMatchTiming: (timing: MatchTimingData) =>
      ipcRenderer.invoke('db:updateMatchTiming', timing),
    getFencerHistory: (fencerId: string) => {
      if (!fencerId || typeof fencerId !== 'string') {
        throw new Error('Fencer ID is required and must be a string');
      }
      return ipcRenderer.invoke('db:getFencerHistory', fencerId);
    },
    saveArenaExit: (exit: ArenaExitData) => ipcRenderer.invoke('db:saveArenaExit', exit),
    getFencerCompetitionStats: (fencerId: string) =>
      ipcRenderer.invoke('db:getFencerCompetitionStats', fencerId),
    getCompetitionFencerStats: (competitionId: string) =>
      ipcRenderer.invoke('db:getCompetitionFencerStats', competitionId),
    saveAbandonSnapshot: (
      fencerId: string,
      competitionId: string,
      previousStatus: string,
      abandonType: string,
      snapshots: MatchSnapshot[]
    ) =>
      ipcRenderer.invoke(
        'db:saveAbandonSnapshot',
        fencerId,
        competitionId,
        previousStatus,
        abandonType,
        snapshots
      ),
    getAbandonSnapshot: (fencerId: string) => ipcRenderer.invoke('db:getAbandonSnapshot', fencerId),
    getScoreAuditLogByCompetition: (competitionId: string) =>
      ipcRenderer.invoke('db:getScoreAuditLogByCompetition', competitionId),
    deleteAbandonSnapshot: (fencerId: string) =>
      ipcRenderer.invoke('db:deleteAbandonSnapshot', fencerId),
    getMatchTimeline: (matchId: string) =>
      ipcRenderer.invoke('db:getMatchTimeline', matchId),
    getCompetitionTimeline: (competitionId: string) =>
      ipcRenderer.invoke('db:getCompetitionTimeline', competitionId),

    // Classement saisonnier Quest
    addCompetitionToSeason: (payload: any) =>
      ipcRenderer.invoke('db:addCompetitionToSeason', payload),
    getSeasonRanking: () =>
      ipcRenderer.invoke('db:getSeasonRanking'),
    getSeasonCompetitions: () =>
      ipcRenderer.invoke('db:getSeasonCompetitions'),
    removeCompetitionFromSeason: (competitionId: string) =>
      ipcRenderer.invoke('db:removeCompetitionFromSeason', competitionId),
    resetSeason: () =>
      ipcRenderer.invoke('db:resetSeason'),

    // Équipes
    createTeam: (competitionId: string, name: string, club: string) =>
      ipcRenderer.invoke('db:createTeam', competitionId, name, club),
    getTeamsByCompetition: (competitionId: string) =>
      ipcRenderer.invoke('db:getTeamsByCompetition', competitionId),
    deleteTeam: (teamId: string) =>
      ipcRenderer.invoke('db:deleteTeam', teamId),
    upsertTeamFencer: (teamId: string, fencerId: string, teamOrder: number, isReserve: boolean) =>
      ipcRenderer.invoke('db:upsertTeamFencer', teamId, fencerId, teamOrder, isReserve),
    removeTeamFencer: (teamId: string, fencerId: string) =>
      ipcRenderer.invoke('db:removeTeamFencer', teamId, fencerId),
    createTeamMatch: (competitionId: string, poolNumber: number, teamAId: string, teamBId: string) =>
      ipcRenderer.invoke('db:createTeamMatch', competitionId, poolNumber, teamAId, teamBId),
    getTeamMatchesByCompetition: (competitionId: string) =>
      ipcRenderer.invoke('db:getTeamMatchesByCompetition', competitionId),
    createTeamBout: (matchId: string, boutOrder: number, fencerAId: string, fencerBId: string, maxScore: number) =>
      ipcRenderer.invoke('db:createTeamBout', matchId, boutOrder, fencerAId, fencerBId, maxScore),
    updateTeamBout: (boutId: string, scoreA: number, scoreB: number, status: string, winnerId: string | null) =>
      ipcRenderer.invoke('db:updateTeamBout', boutId, scoreA, scoreB, status, winnerId),
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
    writeContent: (filepath: string, content: string) => {
      if (!filepath || typeof filepath !== 'string') {
        throw new Error('Filepath is required and must be a string');
      }
      if (typeof content !== 'string') {
        throw new Error('Content must be a string');
      }
      return ipcRenderer.invoke('file:writeContent', filepath, content);
    },
    printHtml: (html: string) => {
      if (!html || typeof html !== 'string') {
        throw new Error('HTML content is required');
      }
      return ipcRenderer.invoke('file:printHtml', html);
    },
    printHtmlToPDF: (html: string, outputPath: string) => {
      if (!html || typeof html !== 'string') {
        throw new Error('HTML content is required');
      }
      if (!outputPath || typeof outputPath !== 'string') {
        throw new Error('Output path is required');
      }
      return ipcRenderer.invoke('file:printHtmlToPDF', html, outputPath);
    },
    exportPhotos: (competitionId: string, filepath: string) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      if (!filepath || typeof filepath !== 'string') {
        throw new Error('Filepath is required and must be a string');
      }
      return ipcRenderer.invoke('file:exportPhotos', competitionId, filepath);
    },
    importPhotos: (competitionId: string, filepath: string) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      if (!filepath || typeof filepath !== 'string') {
        throw new Error('Filepath is required and must be a string');
      }
      return ipcRenderer.invoke('file:importPhotos', competitionId, filepath);
    },
    exportFencersArchive: (competitionId: string, filepath: string) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      if (!filepath || typeof filepath !== 'string') {
        throw new Error('Filepath is required and must be a string');
      }
      return ipcRenderer.invoke('file:exportFencersArchive', competitionId, filepath);
    },
    importFencersArchive: (competitionId: string, filepath: string) => {
      if (!competitionId || typeof competitionId !== 'string') {
        throw new Error('Competition ID is required and must be a string');
      }
      if (!filepath || typeof filepath !== 'string') {
        throw new Error('Filepath is required and must be a string');
      }
      return ipcRenderer.invoke('file:importFencersArchive', competitionId, filepath);
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
  onMenuNewCompetition: (callback: () => void) => ipcRenderer.on('menu:new-competition', callback),
  onMenuSave: (callback: () => void) => ipcRenderer.on('menu:save', callback),
  onMenuCompetitionProperties: (callback: () => void) =>
    ipcRenderer.on('menu:competition-properties', callback),
  onMenuAddFencer: (callback: () => void) => ipcRenderer.on('menu:add-fencer', callback),
  onMenuAddReferee: (callback: () => void) => ipcRenderer.on('menu:add-referee', callback),
  onMenuNextPhase: (callback: () => void) => ipcRenderer.on('menu:next-phase', callback),
  onMenuExport: (callback: (format: string) => void) =>
    ipcRenderer.on('menu:export', (_, format) => callback(format)),
  onMenuImport: (callback: (format: string, filepath: string, content: string) => void) =>
    ipcRenderer.on('menu:import', (_, format, filepath, content) =>
      callback(format, filepath, content)
    ),
  onMenuOpenSettings: (callback: () => void) => ipcRenderer.on('menu:open-settings', callback),
  onMenuReportIssue: (callback: () => void) => ipcRenderer.on('menu:report-issue', callback),
  onShowAbout: (callback: () => void) => ipcRenderer.on('menu:show-about', callback),
  onFileOpened: (callback: (filepath: string) => void) =>
    ipcRenderer.on('file:opened', (_, filepath) => callback(filepath)),
  onFileSaved: (callback: (filepath: string) => void) =>
    ipcRenderer.on('file:saved', (_, filepath) => callback(filepath)),
  onAutosaveCompleted: (callback: () => void) => ipcRenderer.on('autosave:completed', callback),
  onAutosaveFailed: (callback: () => void) => ipcRenderer.on('autosave:failed', callback),
  onDbReady: (callback: () => void) => ipcRenderer.once('db:ready', callback),

  // Utility functions
  print: () => ipcRenderer.invoke('window:print'),
  setWindowSize: (width: number, height: number) => ipcRenderer.invoke('window:setSize', width, height),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  getVersionInfo: () => ipcRenderer.invoke('app:getVersionInfo'),

  // Updater functions
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    setSilentMode: (enabled: boolean) => {
      if (typeof enabled !== 'boolean') {
        throw new Error('Enabled must be a boolean');
      }
      return ipcRenderer.invoke('updater:setSilentMode', enabled);
    },
    getSilentMode: () => ipcRenderer.invoke('updater:getSilentMode'),
    hasPendingUpdate: () => ipcRenderer.invoke('updater:hasPendingUpdate'),
    getPendingUpdateInfo: () => ipcRenderer.invoke('updater:getPendingUpdateInfo'),
    installPendingUpdate: () => ipcRenderer.invoke('updater:installPendingUpdate'),
  },

  // Chiffrement OS (safeStorage) pour secrets locaux
  crypto: {
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke('crypto:isAvailable'),
    protect: (plaintext: string): Promise<string | null> => {
      if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
      return ipcRenderer.invoke('crypto:protect', plaintext);
    },
    unprotect: (ciphertext: string): Promise<string | null> => {
      if (typeof ciphertext !== 'string') throw new Error('ciphertext must be a string');
      return ipcRenderer.invoke('crypto:unprotect', ciphertext);
    },
  },

  // Remote score server functions
  remote: {
    getNetworkInterfaces: () => ipcRenderer.invoke('remote:getNetworkInterfaces'),
    startServer: (competitionId: string, port?: number, host?: string, useHttps?: boolean) =>
      ipcRenderer.invoke('remote:startServer', competitionId, port, host, useHttps),
    getCertFingerprint: () => ipcRenderer.invoke('remote:getCertFingerprint'),
    stopServer: (competitionId: string) => ipcRenderer.invoke('remote:stopServer', competitionId),
    getServerInfo: (competitionId: string) => ipcRenderer.invoke('remote:getServerInfo', competitionId),
    startSession: (
      competitionId: string,
      strips: number,
      matches?: any[],
      showPhotos?: boolean,
      kioskViews?: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean },
      cardAnnounce?: boolean
    ) =>
      ipcRenderer.invoke(
        'remote:startSession',
        competitionId,
        strips,
        matches,
        showPhotos,
        kioskViews,
        cardAnnounce
      ),
    stopSession: (competitionId: string) => ipcRenderer.invoke('remote:stopSession', competitionId),
    launchCompetition: (competitionId: string) => ipcRenderer.invoke('remote:launchCompetition', competitionId),
    getSession: (competitionId: string) => ipcRenderer.invoke('remote:getSession', competitionId),
    getArenas: (competitionId: string) => ipcRenderer.invoke('remote:getArenas', competitionId),
    updateStripCount: (competitionId: string, count: number) =>
      ipcRenderer.invoke('remote:updateStripCount', competitionId, count),
    updateShowPhotos: (competitionId: string, value: boolean) =>
      ipcRenderer.invoke('remote:updateShowPhotos', competitionId, value),
    updateCardAnnounce: (competitionId: string, value: boolean) =>
      ipcRenderer.invoke('remote:updateCardAnnounce', competitionId, value),
    updateTheme: (competitionId: string, theme: string) =>
      ipcRenderer.invoke('remote:updateTheme', competitionId, theme),
    updateKioskViews: (competitionId: string, views: {
      poules: boolean;
      classement: boolean;
      direct: boolean;
      suivants: boolean;
    }) => ipcRenderer.invoke('remote:updateKioskViews', competitionId, views),
    updateMatchArena: (competitionId: string, matchId: string, fromArena: number | null, toArena: number | null, fencerA?: any, fencerB?: any) =>
      ipcRenderer.invoke('remote:updateMatchArena', competitionId, matchId, fromArena, toArena, fencerA, fencerB),
    updatePoolFencers: (competitionId: string, updates: Array<{ poolId: string; fencers: any[] }>) =>
      ipcRenderer.invoke('remote:updatePoolFencers', competitionId, updates),
    syncPoolMatches: (competitionId: string, poolsData: Array<{ poolId: string; matches: any[] }>) =>
      ipcRenderer.invoke('remote:syncPoolMatches', competitionId, poolsData),
    refreshDeMatches: (competitionId: string, matches: any[]) =>
      ipcRenderer.invoke('remote:refreshDeMatches', competitionId, matches),
    setArenaPassword: (competitionId: string, arenaId: string, password: string) =>
      ipcRenderer.invoke('remote:setArenaPassword', competitionId, arenaId, password),
    setOrgNote: (competitionId: string, note: any) =>
      ipcRenderer.invoke('remote:setOrgNote', competitionId, note),
    clearOrgNote: (competitionId: string) => ipcRenderer.invoke('remote:clearOrgNote', competitionId),
    updateArenaTheme: (competitionId: string, arenaId: string, theme: string, customTheme?: any) =>
      ipcRenderer.invoke('remote:updateArenaTheme', competitionId, arenaId, theme, customTheme),
    clearArenaThemeOverride: (competitionId: string, arenaId: string) =>
      ipcRenderer.invoke('remote:clearArenaThemeOverride', competitionId, arenaId),
    updateKioskTheme: (competitionId: string, variables: Record<string, string>) =>
      ipcRenderer.invoke('remote:updateKioskTheme', competitionId, variables),
    updateArenaScreenTheme: (competitionId: string, arenaId: string, targetType: string, customTheme?: any) =>
      ipcRenderer.invoke('remote:updateArenaScreenTheme', competitionId, arenaId, targetType, customTheme),
    setWebhookUrl: (url: string | null) => ipcRenderer.invoke('remote:setWebhookUrl', url),
    updateLogo: (logo: string | null) => ipcRenderer.invoke('remote:updateLogo', logo),
    setTtsConfig: (config: unknown) => ipcRenderer.invoke('remote:setTtsConfig', config),
    setWallpaper: (competitionId: string, wallpaper: string | null) =>
      ipcRenderer.invoke('remote:setWallpaper', competitionId, wallpaper),
    changePort: (competitionId: string, newPort: number) =>
      ipcRenderer.invoke('remote:changePort', competitionId, newPort),
    acknowledgeDTCall: (competitionId: string, arenaId: string) =>
      ipcRenderer.invoke('remote:acknowledgeDTCall', competitionId, arenaId),
    resetPoolMatch: (competitionId: string, matchId: string) =>
      ipcRenderer.invoke('remote:resetPoolMatch', competitionId, matchId),
    finishPoolMatch: (competitionId: string, matchId: string, scoreA: number, scoreB: number) =>
      ipcRenderer.invoke('remote:finishPoolMatch', competitionId, matchId, scoreA, scoreB),
    setRegistrationEnabled: (competitionId: string, enabled: boolean) =>
      ipcRenderer.invoke('remote:setRegistrationEnabled', competitionId, enabled),
    getConnectedClients: (competitionId: string) =>
      ipcRenderer.invoke('remote:getConnectedClients', competitionId),
    sendClientCommand: (competitionId: string, socketId: string, command: any) =>
      ipcRenderer.invoke('remote:sendClientCommand', competitionId, socketId, command),
    broadcastCommand: (competitionId: string, command: any) =>
      ipcRenderer.invoke('remote:broadcastCommand', competitionId, command),
    onClientListUpdate: (cb: (clients: any[]) => void) => {
      const handler = (_: any, clients: any[]) => cb(clients);
      ipcRenderer.on('remote:clientListUpdate', handler);
      return () => ipcRenderer.removeListener('remote:clientListUpdate', handler);
    },
    renameClient: (competitionId: string, socketId: string, label: string) =>
      ipcRenderer.invoke('remote:renameClient', competitionId, socketId, label),
    identifyClient: (competitionId: string, socketId: string) =>
      ipcRenderer.invoke('remote:identifyClient', competitionId, socketId),
    setClientKioskMode: (competitionId: string, socketId: string, config: any) =>
      ipcRenderer.invoke('remote:setClientKioskMode', competitionId, socketId, config),
  },

  training: {
    startServer: (port?: number, host?: string, useHttps?: boolean) =>
      ipcRenderer.invoke('training:startServer', port, host, useHttps),
    stopServer: () => ipcRenderer.invoke('training:stopServer'),
    startSession: (strips: number, weapon: string, customRules?: any) =>
      ipcRenderer.invoke('training:startSession', strips, weapon, customRules),
    stopSession: () => ipcRenderer.invoke('training:stopSession'),
    getHistory: () => ipcRenderer.invoke('training:getHistory'),
    getSession: () => ipcRenderer.invoke('training:getSession'),
    getArenas: () => ipcRenderer.invoke('training:getArenas'),
    getServerInfo: () => ipcRenderer.invoke('training:getServerInfo'),
  },

  // Remote event listeners (for real-time updates)
  onRemoteArenaUpdate: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('arena:update', handler);
    return () => ipcRenderer.removeListener('arena:update', handler);
  },
  onRemoteMatchFinished: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => {
      // DIAGNOSTIC : confirmer que l'IPC match:finished atteint bien le renderer.
      console.warn('[preload] IPC match:finished reçu', data?.matchId, data?.scoreA, data?.scoreB, 'tableau=', data?.isTableau);
      callback(data);
    };
    ipcRenderer.on('match:finished', handler);
    return () => ipcRenderer.removeListener('match:finished', handler);
  },
  onTrainingMatchFinished: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('training:match_finished', handler);
    return () => ipcRenderer.removeListener('training:match_finished', handler);
  },
  onRemoteFencerExcluded: (callback: (data: { fencerId: string; matchId: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('remote:fencer_excluded', handler);
    return () => ipcRenderer.removeListener('remote:fencer_excluded', handler);
  },
  onKioskNoteUpdate: (callback: (note: any) => void) => {
    const handler = (_: any, note: any) => callback(note);
    ipcRenderer.on('kiosk:note', handler);
    return () => ipcRenderer.removeListener('kiosk:note', handler);
  },
  onDTCall: (callback: (data: { arenaId: string; arenaNumber: number; matchNumber: number | null; competitionId: string | null; timestamp: number }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('remote:dt_call', handler);
    return () => ipcRenderer.removeListener('remote:dt_call', handler);
  },
  onDTCallCancel: (callback: (data: { arenaId: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('remote:dt_cancel', handler);
    return () => ipcRenderer.removeListener('remote:dt_cancel', handler);
  },

  onScoreIpConflict: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('score:ip-conflict', handler);
    return () => ipcRenderer.removeListener('score:ip-conflict', handler);
  },

  onPoolSignatureUpdated: (callback: (data: { poolId: string; signedFencerIds: string[]; totalFencers: number }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('pool:signature:updated', handler);
    return () => ipcRenderer.removeListener('pool:signature:updated', handler);
  },

  getLogo: () => ipcRenderer.invoke('app:getLogo'),
  getTtsConfig: () => ipcRenderer.invoke('app:getTtsConfig'),
  onLogoLoaded: (callback: (logo: string | null) => void) => {
    const handler = (_: any, logo: string | null) => callback(logo);
    ipcRenderer.on('app:logoLoaded', handler);
    return () => ipcRenderer.removeListener('app:logoLoaded', handler);
  },

  // Bibliothèque de thèmes persistante
  themes: {
    list: () => ipcRenderer.invoke('themes:list'),
    save: (theme: unknown) => ipcRenderer.invoke('themes:save', theme),
    delete: (id: string) => ipcRenderer.invoke('themes:delete', id),
  },

  // Remove listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),

  // Notify main process of language change (to rebuild native menu)
  notifyLanguageChanged: (lang: string) => ipcRenderer.send('app:language-changed', lang),

  // Language injected before renderer loads (avoids race with localStorage read)
  initialLanguage: (() => {
    const arg = process.argv.find(a => a.startsWith('--initial-lang='));
    return arg ? arg.slice('--initial-lang='.length) : null;
  })(),
});

// Type declarations for the renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
