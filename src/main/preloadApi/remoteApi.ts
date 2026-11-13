/**
 * BellePoule Modern - Préload : Serveur de saisie distante (remote:*) (#1774)
 * Licensed under GPL-3.0
 */
import { ipcRenderer, type IpcRendererEvent } from 'electron';
import type { RemoteServerAPI } from '../../shared/types/preload';

export const remoteApi = {
  getNetworkInterfaces: () => ipcRenderer.invoke('remote:getNetworkInterfaces'),
  startServer: (competitionId: string, port?: number, host?: string, useHttps?: boolean) =>
    ipcRenderer.invoke('remote:startServer', competitionId, port, host, useHttps),
  getCertFingerprint: () => ipcRenderer.invoke('remote:getCertFingerprint'),
  stopServer: (competitionId: string) => ipcRenderer.invoke('remote:stopServer', competitionId),
  getServerInfo: (competitionId: string) =>
    ipcRenderer.invoke('remote:getServerInfo', competitionId),
  reloadServer: (
    competitionId: string,
    options?: { port?: number; host?: string; useHttps?: boolean }
  ) => ipcRenderer.invoke('remote:reloadServer', competitionId, options),
  startSession: (
    competitionId: string,
    strips: number,
    matches?: any[],
    showPhotos?: boolean,
    kioskViews?: Record<string, boolean>,
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
  launchCompetition: (competitionId: string) =>
    ipcRenderer.invoke('remote:launchCompetition', competitionId),
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
  updateKioskViews: (competitionId: string, views: Record<string, boolean>) =>
    ipcRenderer.invoke('remote:updateKioskViews', competitionId, views),
  updateMatchArena: (
    competitionId: string,
    matchId: string,
    fromArena: number | null,
    toArena: number | null,
    fencerA?: any,
    fencerB?: any
  ) =>
    ipcRenderer.invoke(
      'remote:updateMatchArena',
      competitionId,
      matchId,
      fromArena,
      toArena,
      fencerA,
      fencerB
    ),
  updatePoolFencers: (competitionId: string, updates: Array<{ poolId: string; fencers: any[] }>) =>
    ipcRenderer.invoke('remote:updatePoolFencers', competitionId, updates),
  setActiveWave: (competitionId: string, matchIds: string[] | null, poolsClosed?: boolean) =>
    ipcRenderer.invoke('remote:setActiveWave', competitionId, matchIds, poolsClosed),
  syncPoolMatches: (competitionId: string, poolsData: Array<{ poolId: string; matches: any[] }>) =>
    ipcRenderer.invoke('remote:syncPoolMatches', competitionId, poolsData),
  assignPools: (competitionId: string, poolsData: any[]) =>
    ipcRenderer.invoke('remote:assignPools', competitionId, poolsData),
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
  setStripPlan: (competitionId: string, plan: { start: number; unavailable: number[] }) =>
    ipcRenderer.invoke('remote:setStripPlan', competitionId, plan),
  updateKioskTheme: (competitionId: string, variables: Record<string, string>) =>
    ipcRenderer.invoke('remote:updateKioskTheme', competitionId, variables),
  updateArenaScreenTheme: (
    competitionId: string,
    arenaId: string,
    targetType: string,
    customTheme?: any
  ) =>
    ipcRenderer.invoke(
      'remote:updateArenaScreenTheme',
      competitionId,
      arenaId,
      targetType,
      customTheme
    ),
  setWebhookUrl: (url: string | null) => ipcRenderer.invoke('remote:setWebhookUrl', url),
  testWebhook: (url: string) => ipcRenderer.invoke('remote:testWebhook', url),
  updateLogo: (logo: string | null) => ipcRenderer.invoke('remote:updateLogo', logo),
  setTtsConfig: (config: unknown) => ipcRenderer.invoke('remote:setTtsConfig', config),
  setWallpaper: (competitionId: string, wallpaper: string | null) =>
    ipcRenderer.invoke('remote:setWallpaper', competitionId, wallpaper),
  acknowledgeDTCall: (competitionId: string, arenaId: string) =>
    ipcRenderer.invoke('remote:acknowledgeDTCall', competitionId, arenaId),
  requestMatchSignature: (competitionId: string, arenaId: string, request: unknown) =>
    ipcRenderer.invoke('remote:requestMatchSignature', competitionId, arenaId, request),
  resetPoolMatch: (competitionId: string, matchId: string) =>
    ipcRenderer.invoke('remote:resetPoolMatch', competitionId, matchId),
  finishPoolMatch: (
    competitionId: string,
    matchId: string,
    scoreA: number,
    scoreB: number,
    winner?: 'A' | 'B',
    specialStatus?: 'abandon' | 'forfait' | 'exclusion'
  ) =>
    ipcRenderer.invoke(
      'remote:finishPoolMatch',
      competitionId,
      matchId,
      scoreA,
      scoreB,
      winner,
      specialStatus
    ),
  setTeamArenaMatch: (
    competitionId: string,
    arenaId: string,
    matchId: string,
    isLaserPoints: boolean
  ) =>
    ipcRenderer.invoke('remote:setTeamArenaMatch', competitionId, arenaId, matchId, isLaserPoints),
  clearTeamArenaMatch: (competitionId: string, arenaId: string) =>
    ipcRenderer.invoke('remote:clearTeamArenaMatch', competitionId, arenaId),
  setRegistrationEnabled: (competitionId: string, enabled: boolean) =>
    ipcRenderer.invoke('remote:setRegistrationEnabled', competitionId, enabled),
  setCheckinEnabled: (competitionId: string, enabled: boolean) =>
    ipcRenderer.invoke('remote:setCheckinEnabled', competitionId, enabled),
  setCheckinPassword: (competitionId: string, password: string) =>
    ipcRenderer.invoke('remote:setCheckinPassword', competitionId, password),
  setTrainerEnabled: (competitionId: string, enabled: boolean) =>
    ipcRenderer.invoke('remote:setTrainerEnabled', competitionId, enabled),
  setTrainerPassword: (competitionId: string, password: string) =>
    ipcRenderer.invoke('remote:setTrainerPassword', competitionId, password),
  getConnectedClients: (competitionId: string) =>
    ipcRenderer.invoke('remote:getConnectedClients', competitionId),
  sendClientCommand: (competitionId: string, socketId: string, command: any) =>
    ipcRenderer.invoke('remote:sendClientCommand', competitionId, socketId, command),
  broadcastCommand: (competitionId: string, command: any) =>
    ipcRenderer.invoke('remote:broadcastCommand', competitionId, command),
  onClientListUpdate: (cb: (clients: any[], competitionId?: string | null) => void) => {
    const handler = (_: IpcRendererEvent, clients: any[], competitionId?: string | null) =>
      cb(clients, competitionId);
    ipcRenderer.on('remote:clientListUpdate', handler);
    return () => ipcRenderer.removeListener('remote:clientListUpdate', handler);
  },
  renameClient: (competitionId: string, socketId: string, label: string) =>
    ipcRenderer.invoke('remote:renameClient', competitionId, socketId, label),
  identifyClient: (competitionId: string, socketId: string) =>
    ipcRenderer.invoke('remote:identifyClient', competitionId, socketId),
  setClientKioskMode: (competitionId: string, socketId: string, config: any) =>
    ipcRenderer.invoke('remote:setClientKioskMode', competitionId, socketId, config),
} satisfies RemoteServerAPI;
