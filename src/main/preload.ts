/**
 * BellePoule Modern - Preload Script
 * Exposes safe APIs to the renderer process with type safety
 * Licensed under GPL-3.0
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type {
  ElectronAPI,
  CompetitionEventType,
  UpdateInfo,
  UpdateProgressEvent,
  ProxySettingsDTO,
  RemoteArenaUpdateEvent,
  RemoteMatchFinishedEvent,
} from '../shared/types/preload';

import { setPrintRequestHandler, type PrintRequestHandler } from './preloadApi/printHandler';
import { dbApi } from './preloadApi/dbApi';
import { fileApi } from './preloadApi/fileApi';
import { dialogApi } from './preloadApi/dialogApi';
import { remoteApi } from './preloadApi/remoteApi';

// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object

const electronApi = {
  // Database operations with validation
  db: dbApi,

  // File operations with validation
  file: fileApi,

  // Dialog operations with validation
  dialog: dialogApi,

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
  onFileOpened: (callback: (filepath: string, competitionIds?: string[]) => void) =>
    ipcRenderer.on('file:opened', (_, filepath, competitionIds) =>
      callback(filepath, competitionIds)
    ),
  setCurrentCompetition: (competitionId: string | null) =>
    ipcRenderer.send('app:current-competition', competitionId),
  onFileSaved: (callback: (filepath: string) => void) =>
    ipcRenderer.on('file:saved', (_, filepath) => callback(filepath)),
  onAutosaveCompleted: (callback: () => void) => ipcRenderer.on('autosave:completed', callback),
  onAutosaveFailed: (callback: () => void) => ipcRenderer.on('autosave:failed', callback),
  onDbReady: (callback: () => void) => ipcRenderer.once('db:ready', callback),

  // Boîte d'impression intégrée (#1214)
  printDialog: {
    getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
    render: (html: string, settings?: Record<string, unknown>) => {
      if (!html || typeof html !== 'string') throw new Error('HTML content is required');
      return ipcRenderer.invoke('print:render', html, settings);
    },
    execute: (html: string, settings?: Record<string, unknown>) => {
      if (!html || typeof html !== 'string') throw new Error('HTML content is required');
      return ipcRenderer.invoke('print:execute', html, settings);
    },
    savePdf: (html: string, settings?: Record<string, unknown>, title?: string) => {
      if (!html || typeof html !== 'string') throw new Error('HTML content is required');
      return ipcRenderer.invoke('print:savePdf', html, settings, title);
    },
    systemDialog: (html: string) => {
      if (!html || typeof html !== 'string') throw new Error('HTML content is required');
      return ipcRenderer.invoke('print:systemDialog', html);
    },
    /** Le renderer enregistre la fenêtre d'impression qui traite les demandes `file.printHtml` */
    setHandler: (handler: PrintRequestHandler | null) => {
      setPrintRequestHandler(handler);
    },
  },

  // Utility functions
  print: () => ipcRenderer.invoke('window:print'),
  setWindowSize: (width: number, height: number, options?: { force?: boolean }) =>
    ipcRenderer.invoke('window:setSize', width, height, options),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  getEventLoopDelay: (reset?: boolean) =>
    ipcRenderer.invoke('perf:getEventLoopDelay', reset === true),
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
    downloadAndInstall: () => ipcRenderer.invoke('updater:downloadAndInstall'),
    getAutoCheck: () => ipcRenderer.invoke('updater:getAutoCheck'),
    setAutoCheck: (enabled: boolean) => {
      if (typeof enabled !== 'boolean') {
        throw new Error('Enabled must be a boolean');
      }
      return ipcRenderer.invoke('updater:setAutoCheck', enabled);
    },
    getDownloadDir: () => ipcRenderer.invoke('updater:getDownloadDir'),
    chooseDownloadDir: () => ipcRenderer.invoke('updater:chooseDownloadDir'),
    resetDownloadDir: () => ipcRenderer.invoke('updater:resetDownloadDir'),
    getChannel: () => ipcRenderer.invoke('updater:getChannel'),
    setChannel: (channel: 'stable' | 'dev') => {
      if (channel !== 'stable' && channel !== 'dev') {
        throw new Error('Invalid channel');
      }
      return ipcRenderer.invoke('updater:setChannel', channel);
    },
  },

  // Proxy réseau (Paramètres → Réseau)
  proxy: {
    get: () => ipcRenderer.invoke('proxy:get'),
    set: (settings: ProxySettingsDTO) => ipcRenderer.invoke('proxy:set', settings),
    test: () => ipcRenderer.invoke('proxy:test'),
  },

  // Rapport de diagnostic (fichier JSON, sans port réseau) (#1326)
  diagnostic: {
    exportReport: () => ipcRenderer.invoke('diagnostic:exportReport'),
  },

  // Publication des résultats sur GREG (escrime-info.com), envoi fait par le main (#1328)
  greg: {
    publish: (request: unknown) => ipcRenderer.invoke('greg:publish', request),
  },

  // Connecteur FTP/FTPS : dépôt du fichier de résultats (#1331)
  ftp: {
    publish: (request: unknown) => ipcRenderer.invoke('ftp:publish', request),
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
  remote: remoteApi,

  // Journée multi-épreuves (#1714)
  eventDay: {
    list: () => ipcRenderer.invoke('eventDay:list'),
    create: (data: { name: string; date: string; stripCount?: number }) =>
      ipcRenderer.invoke('eventDay:create', data),
    update: (id: string, updates: { name?: string; date?: string; stripCount?: number }) =>
      ipcRenderer.invoke('eventDay:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('eventDay:delete', id),
    setCompetitionDay: (competitionId: string, dayId: string | null) =>
      ipcRenderer.invoke('eventDay:setCompetitionDay', competitionId, dayId),
    listReferees: (dayId: string) => ipcRenderer.invoke('eventDay:listReferees', dayId),
    createReferee: (dayId: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('eventDay:createReferee', dayId, data),
    updateReferee: (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('eventDay:updateReferee', id, data),
    deleteReferee: (id: string) => ipcRenderer.invoke('eventDay:deleteReferee', id),
    syncReferees: (dayId: string) => ipcRenderer.invoke('eventDay:syncReferees', dayId),
    getOverview: (dayId: string) => ipcRenderer.invoke('eventDay:getOverview', dayId),
    getBusyElsewhere: (competitionId: string) =>
      ipcRenderer.invoke('eventDay:getBusyElsewhere', competitionId),
    getStripOccupation: (dayId: string) => ipcRenderer.invoke('eventDay:getStripOccupation', dayId),
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
    openDemoScreens: (strips: number) => ipcRenderer.invoke('training:openDemoScreens', strips),
  },

  // Remote event listeners (for real-time updates)
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const handler = (_: IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateProgress: (callback: (data: UpdateProgressEvent) => void) => {
    const handler = (_: IpcRendererEvent, data: UpdateProgressEvent) => callback(data);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },
  onRemoteArenaUpdate: (callback: (data: RemoteArenaUpdateEvent) => void) => {
    const handler = (_: IpcRendererEvent, data: RemoteArenaUpdateEvent) => callback(data);
    ipcRenderer.on('arena:update', handler);
    return () => ipcRenderer.removeListener('arena:update', handler);
  },
  onRemoteMatchFinished: (callback: (data: RemoteMatchFinishedEvent) => void) => {
    const handler = (_: IpcRendererEvent, data: RemoteMatchFinishedEvent) => callback(data);
    ipcRenderer.on('match:finished', handler);
    return () => ipcRenderer.removeListener('match:finished', handler);
  },
  onTrainingMatchFinished: (callback: (data: any) => void) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('training:match_finished', handler);
    return () => ipcRenderer.removeListener('training:match_finished', handler);
  },
  onCompetitionEvent: (
    callback: (event: { type: CompetitionEventType; competitionId?: string }) => void
  ) => {
    const handler = (
      _: IpcRendererEvent,
      data: { type: CompetitionEventType; competitionId?: string }
    ) => callback(data);
    ipcRenderer.on('competition:event', handler);
    return () => ipcRenderer.removeListener('competition:event', handler);
  },
  onRemoteFencerExcluded: (
    callback: (data: { fencerId: string; matchId: string; reason?: 'black_card' }) => void
  ) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('remote:fencer_excluded', handler);
    return () => ipcRenderer.removeListener('remote:fencer_excluded', handler);
  },
  onRemoteFencerReinstated: (
    callback: (data: {
      fencerId: string;
      matchId: string;
      status: string;
      scoreA: number;
      scoreB: number;
    }) => void
  ) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('remote:fencer_reinstated', handler);
    return () => ipcRenderer.removeListener('remote:fencer_reinstated', handler);
  },
  onRemoteCheckinUpdated: (
    callback: (data: { kind: 'fencer' | 'referee'; id: string; present: boolean }) => void
  ) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('remote:checkin_updated', handler);
    return () => ipcRenderer.removeListener('remote:checkin_updated', handler);
  },
  onRemoteRefereeChanged: (callback: (data: { matchId: string; refereeId: string }) => void) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('remote:referee_changed', handler);
    return () => ipcRenderer.removeListener('remote:referee_changed', handler);
  },
  onKioskNoteUpdate: (callback: (note: any) => void) => {
    const handler = (_: IpcRendererEvent, note: any) => callback(note);
    ipcRenderer.on('kiosk:note', handler);
    return () => ipcRenderer.removeListener('kiosk:note', handler);
  },
  onDTCall: (
    callback: (data: {
      arenaId: string;
      arenaNumber: number | null;
      matchNumber: number | null;
      competitionId: string | null;
      timestamp: number;
      reason?: 'black_card';
      fencerName?: string | null;
    }) => void
  ) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('remote:dt_call', handler);
    return () => ipcRenderer.removeListener('remote:dt_call', handler);
  },
  onDTCallCancel: (callback: (data: { arenaId: string }) => void) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('remote:dt_cancel', handler);
    return () => ipcRenderer.removeListener('remote:dt_cancel', handler);
  },

  onScoreIpConflict: (callback: (data: any) => void) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('score:ip-conflict', handler);
    return () => ipcRenderer.removeListener('score:ip-conflict', handler);
  },

  onPoolSignatureUpdated: (
    callback: (data: { poolId: string; signedFencerIds: string[]; totalFencers: number }) => void
  ) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('pool:signature:updated', handler);
    return () => ipcRenderer.removeListener('pool:signature:updated', handler);
  },

  onTableauSignatureUpdated: (callback: (data: { matchId: string; fencerId: string }) => void) => {
    const handler = (_: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('tableau:signature:updated', handler);
    return () => ipcRenderer.removeListener('tableau:signature:updated', handler);
  },

  getLogo: () => ipcRenderer.invoke('app:getLogo'),
  getLogos: () => ipcRenderer.invoke('app:getLogos'),
  saveLogos: (logos: { id: string; name: string; data: string }[]) =>
    ipcRenderer.invoke('app:saveLogos', logos),
  getTtsConfig: () => ipcRenderer.invoke('app:getTtsConfig'),
  onLogoLoaded: (callback: (logo: string | null) => void) => {
    const handler = (_: IpcRendererEvent, logo: string | null) => callback(logo);
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

  // Écran de démarrage (splash) affiché ou non
  splash: {
    getEnabled: () => ipcRenderer.invoke('app:getSplashEnabled'),
    setEnabled: (enabled: boolean) => {
      if (typeof enabled !== 'boolean') throw new Error('Enabled must be a boolean');
      return ipcRenderer.invoke('app:setSplashEnabled', enabled);
    },
  },

  // Cyrano scoring machine integration (#1720)
  cyrano: {
    start: (options?: { port?: number; host?: string; compe?: string }) =>
      ipcRenderer.invoke('cyrano:start', options),
    stop: () => ipcRenderer.invoke('cyrano:stop'),
    isRunning: () => ipcRenderer.invoke('cyrano:isRunning'),
    setPistes: (pistes: unknown[]) => ipcRenderer.invoke('cyrano:setPistes', pistes),
    getStatus: () => ipcRenderer.invoke('cyrano:getStatus'),
    getLog: () => ipcRenderer.invoke('cyrano:getLog'),
    setOptions: (options: unknown) => ipcRenderer.invoke('cyrano:setOptions', options),
  },

  // Language injected before renderer loads (avoids race with localStorage read)
  initialLanguage: (() => {
    const arg = process.argv.find(a => a.startsWith('--initial-lang='));
    return arg ? arg.slice('--initial-lang='.length) : null;
  })(),
} satisfies ElectronAPI;

contextBridge.exposeInMainWorld('electronAPI', electronApi);

// Type declarations for the renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
