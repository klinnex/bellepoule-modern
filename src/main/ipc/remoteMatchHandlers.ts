/**
 * BellePoule Modern - Handlers IPC remote:* (session : démarrage, arènes, poules, rencontres d'équipe)
 * (extraits de main.ts, #1341).
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import { RemoteScoreServer } from '../remoteScoreServer';
import { remoteServers } from '../remoteRegistry';
import { setActiveWave } from '../remote/activeWave';
import { logger, LogCategory, toError } from '../../shared/services/logger';

export function registerRemoteMatchHandlers(): void {
  // Remote session handlers
  ipcMain.handle(
    'remote:startSession',
    async (
      _,
      competitionId: string,
      strips: number,
      matches?: any[],
      showPhotos?: boolean,
      kioskViews?: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean },
      cardAnnounce?: boolean
    ) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) {
          return {
            success: false,
            error: 'remote_not_started',
          };
        }

        const session = await entry.server.startSession(
          competitionId,
          strips,
          matches,
          showPhotos,
          kioskViews,
          cardAnnounce
        );
        return { success: true, session };
      } catch (error) {
        logger.error(LogCategory.NETWORK, 'Error starting session:', toError(error));
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        };
      }
    }
  );

  ipcMain.handle(
    'remote:updateMatchArena',
    async (
      _,
      competitionId: string,
      matchId: string,
      fromArena: number | null,
      toArena: number | null,
      fencerA?: any,
      fencerB?: any
    ) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.updateMatchArena(matchId, fromArena, toArena, fencerA, fencerB);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    }
  );

  ipcMain.handle(
    'remote:updatePoolFencers',
    async (_, competitionId: string, updates: Array<{ poolId: string; fencers: any[] }>) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.updatePoolFencers(updates);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    }
  );

  ipcMain.handle(
    'remote:setActiveWave',
    async (_, competitionId: string, matchIds: string[] | null, poolsClosed?: boolean) => {
      setActiveWave(competitionId, matchIds, poolsClosed);
      return { success: true };
    }
  );

  ipcMain.handle(
    'remote:syncPoolMatches',
    async (_, competitionId: string, poolsData: Array<{ poolId: string; matches: any[] }>) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'server_not_started' };
        entry.server.syncPoolMatches(poolsData);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    }
  );

  ipcMain.handle('remote:assignPools', async (_, competitionId: string, poolsData: any[]) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.assignPools(poolsData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  });

  ipcMain.handle('remote:refreshDeMatches', async (_, competitionId: string, matches: any[]) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'server_not_started' };
      entry.server.refreshDeMatches(matches);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  });

  ipcMain.handle('remote:resetPoolMatch', async (_, competitionId: string, matchId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: true };
      entry.server.resetPoolMatch(matchId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  });

  ipcMain.handle(
    'remote:finishPoolMatch',
    async (_, competitionId: string, ...args: Parameters<RemoteScoreServer['finishPoolMatch']>) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: true };
        entry.server.finishPoolMatch(...args);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    }
  );

  // Format arène Sabre Laser équipe : assigne/retire une rencontre d'équipe sur
  // une arène pour saisie temps réel (tablette arbitre + affichage arène).
  ipcMain.handle(
    'remote:setTeamArenaMatch',
    async (_, competitionId: string, arenaId: string, matchId: string, isLaserPoints: boolean) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: false, error: 'remote_not_started' };
        const ok = entry.server.setTeamArenaMatch(arenaId, matchId, isLaserPoints);
        return ok ? { success: true } : { success: false, error: 'match_not_found' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    }
  );

  ipcMain.handle(
    'remote:clearTeamArenaMatch',
    async (_, competitionId: string, arenaId: string) => {
      try {
        const entry = remoteServers.get(competitionId);
        if (!entry) return { success: true };
        entry.server.clearTeamArenaMatch(arenaId);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
      }
    }
  );
}
