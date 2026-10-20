/**
 * BellePoule Modern - Handlers IPC `db:*` (extraits de main.ts, #1155).
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import type { DatabaseManager } from '../../database';
import type { RemoteScoreServer } from '../remoteScoreServer';
import type { Card } from '../../shared/types';

export interface DbHandlersContext {
  db: DatabaseManager;
  remoteServers: Map<string, { server: RemoteScoreServer }>;
  stopRemoteServer(competitionId: string): boolean;
}

export function registerDbHandlers({
  db,
  remoteServers,
  stopRemoteServer,
}: DbHandlersContext): void {
  // Competition handlers
  ipcMain.handle('db:createCompetition', async (_, data) => {
    return db.createCompetition(data);
  });

  ipcMain.handle('db:getCompetition', async (_, id) => {
    return db.getCompetition(id);
  });

  ipcMain.handle('db:getAllCompetitions', async () => {
    return db.getAllCompetitions();
  });

  ipcMain.handle('db:deleteCompetition', async (_, id) => {
    // Saisie distante encore active : l'arrêter, sinon elle survit à la compétition (#1009)
    stopRemoteServer(id);
    return db.deleteCompetition(id);
  });

  ipcMain.handle('db:updateCompetition', async (_, id, updates) => {
    const result = db.updateCompetition(id, updates);
    // Propager le paramètre carton noir aux tablettes si une session distante est active
    const blackCard = updates?.settings?.blackCardEnabled;
    if (blackCard !== undefined) {
      remoteServers.get(id)?.server.updateBlackCardEnabled(blackCard === true);
    }
    // Score max / chronos / repos modifiés : tablettes à jour sans relancer la session (#1134)
    if (updates?.settings) remoteServers.get(id)?.server.refreshCompetitionSettings();
    return result;
  });

  // Fencer handlers
  ipcMain.handle('db:addFencer', async (_, competitionId, fencer) => {
    return db.addFencer(competitionId, fencer);
  });

  ipcMain.handle('db:getFencer', async (_, id) => {
    return db.getFencer(id);
  });

  ipcMain.handle('db:getFencersByCompetition', async (_, competitionId) => {
    return db.getFencersByCompetition(competitionId);
  });

  ipcMain.handle('db:updateFencer', async (_, id, updates) => {
    return db.updateFencer(id, updates);
  });

  ipcMain.handle('db:deleteFencer', async (_, id) => {
    return db.deleteFencer(id);
  });

  ipcMain.handle('db:deleteAllFencers', async (_, competitionId) => {
    return db.deleteAllFencers(competitionId);
  });

  // Match handlers
  ipcMain.handle('db:createMatch', async (_, match, poolId) => {
    return db.createMatch(match, poolId);
  });

  ipcMain.handle('db:getMatch', async (_, id) => {
    return db.getMatch(id);
  });

  ipcMain.handle('db:getMatchesByPool', async (_, poolId) => {
    return db.getMatchesByPool(poolId);
  });

  ipcMain.handle('db:updateMatch', async (_, id, updates) => {
    const hasScore = updates.scoreA !== undefined || updates.scoreB !== undefined;
    if (hasScore) {
      try {
        const prev = db.getMatch(id);
        db.updateMatch(id, updates);
        if (prev) {
          db.logScoreChange({
            matchId: id,
            poolId: prev.poolId ?? undefined,
            previousScoreA: prev.scoreA,
            previousScoreB: prev.scoreB,
            newScoreA: updates.scoreA ?? prev.scoreA,
            newScoreB: updates.scoreB ?? prev.scoreB,
            changedBy: 'ui',
          });
        }
      } catch {
        db.updateMatch(id, updates);
      }
    } else {
      db.updateMatch(id, updates);
    }

    // Propager l'assignation d'arbitre au serveur distant
    if (updates.refereeId) {
      for (const { server } of remoteServers.values()) {
        try {
          server.assignRefereeToMatch(id, updates.refereeId);
        } catch {
          /* non bloquant */
        }
      }
    }
  });

  ipcMain.handle('db:upsertTableauMatch', async (_, params) => {
    return db.upsertTableauMatch(params);
  });

  ipcMain.handle(
    'db:upsertMultipleTableauMatches',
    async (_, competitionId: string, matches: any[]) => {
      return db.upsertMultipleTableauMatches(competitionId, matches);
    }
  );

  ipcMain.handle('db:getTableauMatchesForExport', async (_, competitionId: string) => {
    return db.getTableauMatchesForExport(competitionId);
  });

  // Session State handlers
  ipcMain.handle('db:saveSessionState', async (_, competitionId, state) => {
    return db.saveSessionState(competitionId, state);
  });

  ipcMain.handle('db:getSessionState', async (_, competitionId) => {
    return db.getSessionState(competitionId);
  });

  // Sync save for beforeunload (renderer cannot await async IPC on close)
  ipcMain.on('db:saveSessionStateSync', (event, competitionId: string, state: unknown) => {
    try {
      db.saveSessionState(competitionId, state);
      db.forceSave();
      event.returnValue = true;
    } catch (e) {
      console.error('[DB] Sync session state save failed', e);
      event.returnValue = false;
    }
  });

  ipcMain.handle('db:clearSessionState', async (_, competitionId) => {
    return db.clearSessionState(competitionId);
  });

  // Pool handlers
  ipcMain.handle('db:updatePool', async (_, pool) => {
    return db.updatePool(pool);
  });
  ipcMain.handle('db:updatePoolReferee', async (_, poolId, refereeId) => {
    return db.updatePoolReferee(poolId, refereeId);
  });
  ipcMain.handle('db:updatePoolReferees', async (_, poolId, refereeIds) => {
    return db.updatePoolReferees(poolId, Array.isArray(refereeIds) ? refereeIds : []);
  });
  ipcMain.handle('db:createPool', async (_, phaseId, number, poolId) => {
    return db.createPool(phaseId, number, poolId);
  });
  ipcMain.handle('db:clearPoolsForPhase', async (_, phaseId) => {
    return db.clearPoolsForPhase(phaseId);
  });
  ipcMain.handle('db:addFencerToPool', async (_, poolId, fencerId, position) => {
    return db.addFencerToPool(poolId, fencerId, position);
  });
  ipcMain.handle('db:syncPoolSnapshot', async (_, competitionId, snapshot) => {
    return db.syncPoolSnapshot(competitionId, snapshot);
  });
  ipcMain.handle('db:getPoolFencers', async (_, poolId) => {
    return db.getPoolFencers(poolId);
  });
  ipcMain.handle('db:getPoolsByPhase', async (_, phaseId) => {
    return db.getPoolsByPhase(phaseId);
  });
  ipcMain.handle('db:getPoolSignatures', async (_, poolId: string) => {
    return db.getPoolSignatures(poolId);
  });
  ipcMain.handle('db:getDEMatchSignaturesByMatchIds', async (_, matchIds: string[]) => {
    return db.getDEMatchSignaturesByMatchIds(matchIds);
  });

  // Phase handlers
  ipcMain.handle('db:createPhase', async (_, competitionId, type, order, name) => {
    return db.createPhase(competitionId, type, order, name);
  });
  ipcMain.handle('db:getPhase', async (_, id) => {
    return db.getPhase(id);
  });
  ipcMain.handle('db:getPhasesByCompetition', async (_, competitionId) => {
    return db.getPhasesByCompetition(competitionId);
  });
  ipcMain.handle('db:updatePhase', async (_, id, updates) => {
    return db.updatePhase(id, updates);
  });
  ipcMain.handle('db:deletePhase', async (_, id) => {
    return db.deletePhase(id);
  });

  // Referee handlers
  ipcMain.handle('db:createReferee', async (_, competitionId, data) => {
    return db.createReferee(competitionId, data);
  });
  ipcMain.handle('db:getReferee', async (_, id) => {
    return db.getReferee(id);
  });
  ipcMain.handle('db:getRefereeComments', async (_, competitionId: string, refereeId?: string) => {
    return db.getRefereeComments(competitionId, refereeId);
  });

  ipcMain.handle('db:getRefereesByCompetition', async (_, competitionId) => {
    return db.getRefereesByCompetition(competitionId);
  });
  ipcMain.handle('db:updateReferee', async (_, id, updates) => {
    return db.updateReferee(id, updates);
  });
  ipcMain.handle('db:deleteReferee', async (_, id) => {
    return db.deleteReferee(id);
  });
  ipcMain.handle('db:getMatchesWithReferees', async (_, competitionId) => {
    return db.getMatchesWithReferees(competitionId);
  });
  ipcMain.handle('db:getRefereeStats', async (_, competitionId) => {
    return db.getRefereeStats(competitionId);
  });

  // Touch / Card read handlers
  ipcMain.handle('db:getTouches', async (_, matchId) => {
    return db.getTouches(matchId);
  });
  ipcMain.handle('db:getCards', async (_, matchId) => {
    return db.getCards(matchId);
  });

  // Statistiques combattants
  ipcMain.handle('db:saveTouch', async (_, touch) => {
    return db.saveTouch(touch);
  });

  ipcMain.handle('db:saveCard', async (_, card) => {
    return db.saveCard(card);
  });

  ipcMain.handle('db:updateMatchTiming', async (_, timing) => {
    return db.updateMatchTiming(timing.matchId, timing.startTime, timing.endTime, timing.duration);
  });

  ipcMain.handle('db:getFencerHistory', async (_, fencerId) => {
    return db.getFencerHistory(fencerId);
  });

  ipcMain.handle('db:saveArenaExit', async (_, exit) => {
    return db.saveArenaExit(exit);
  });

  ipcMain.handle('db:getFencerCompetitionStats', async (_, fencerId) => {
    return db.getFencerCompetitionStats(fencerId);
  });

  ipcMain.handle('db:getCompetitionFencerStats', async (_, competitionId) => {
    return db.getCompetitionFencerStats(competitionId);
  });

  // Abandon snapshot handlers
  ipcMain.handle(
    'db:saveAbandonSnapshot',
    async (_, fencerId, competitionId, previousStatus, abandonType, snapshots) => {
      db.saveAbandonSnapshot(fencerId, competitionId, previousStatus, abandonType, snapshots);
    }
  );

  ipcMain.handle('db:getAbandonSnapshot', async (_, fencerId) => {
    return db.getAbandonSnapshot(fencerId);
  });

  ipcMain.handle('db:deleteAbandonSnapshot', async (_, fencerId) => {
    db.deleteAbandonSnapshot(fencerId);
  });

  ipcMain.handle('db:getScoreAuditLogByCompetition', async (_, competitionId) => {
    return db.getScoreAuditLogByCompetition(competitionId);
  });

  ipcMain.handle('db:getMatchTimeline', async (_, matchId: string) => {
    return db.getMatchTimeline(matchId);
  });

  ipcMain.handle('db:getCompetitionTimeline', async (_, competitionId: string) => {
    return db.getCompetitionTimeline(competitionId);
  });

  // ── Classement saisonnier Quest ───────────────────────────────────────────────

  ipcMain.handle(
    'db:addCompetitionToSeason',
    async (_, payload: Parameters<typeof db.addCompetitionToSeason>[0]) => {
      return db.addCompetitionToSeason(payload);
    }
  );

  ipcMain.handle('db:getSeasonRanking', async () => {
    return db.getSeasonRanking();
  });

  ipcMain.handle('db:getSeasonCompetitions', async () => {
    return db.getSeasonCompetitions();
  });

  ipcMain.handle('db:removeCompetitionFromSeason', async (_, competitionId: string) => {
    return db.removeCompetitionFromSeason(competitionId);
  });

  ipcMain.handle('db:resetSeason', async () => {
    return db.resetSeason();
  });

  // ── Équipes ───────────────────────────────────────────────────────────────────

  ipcMain.handle('db:createTeam', async (_, competitionId: string, name: string, club: string) => {
    return db.createTeam(competitionId, name, club);
  });

  ipcMain.handle('db:getTeamsByCompetition', async (_, competitionId: string) => {
    return db.getTeamsByCompetition(competitionId);
  });

  ipcMain.handle('db:deleteTeam', async (_, teamId: string) => {
    return db.deleteTeam(teamId);
  });

  ipcMain.handle(
    'db:upsertTeamFencer',
    async (_, teamId: string, fencerId: string, teamOrder: number, isReserve: boolean) => {
      return db.upsertTeamFencer(teamId, fencerId, teamOrder, isReserve);
    }
  );

  ipcMain.handle('db:removeTeamFencer', async (_, teamId: string, fencerId: string) => {
    return db.removeTeamFencer(teamId, fencerId);
  });

  ipcMain.handle(
    'db:createTeamMatch',
    async (
      _,
      competitionId: string,
      poolNumber: number,
      teamAId: string,
      teamBId: string,
      round?: number
    ) => {
      return db.createTeamMatch(competitionId, poolNumber, teamAId, teamBId, round);
    }
  );

  ipcMain.handle('db:getTeamMatchesByCompetition', async (_, competitionId: string) => {
    return db.getTeamMatchesByCompetition(competitionId);
  });

  ipcMain.handle(
    'db:createTeamBout',
    async (
      _,
      matchId: string,
      boutOrder: number,
      fencerAId: string,
      fencerBId: string,
      maxScore: number
    ) => {
      return db.createTeamBout(matchId, boutOrder, fencerAId, fencerBId, maxScore);
    }
  );

  ipcMain.handle(
    'db:updateTeamBout',
    async (
      _,
      boutId: string,
      scoreA: number,
      scoreB: number,
      status: string,
      winnerId: string | null
    ) => {
      return db.updateTeamBout(boutId, scoreA, scoreB, status, winnerId);
    }
  );

  ipcMain.handle(
    'db:createTeamTableauMatch',
    async (
      _,
      competitionId: string,
      tableId: string,
      round: number,
      position: number,
      teamAId: string,
      teamBId: string
    ) => {
      return db.createTeamTableauMatch(competitionId, tableId, round, position, teamAId, teamBId);
    }
  );

  ipcMain.handle('db:getTeamTableauMatches', async (_, competitionId: string, tableId: string) => {
    return db.getTeamTableauMatches(competitionId, tableId);
  });

  ipcMain.handle(
    'db:createTeamMatchCard',
    async (
      _,
      matchId: string,
      teamId: string,
      type: 'white' | 'yellow' | 'red' | 'black',
      reason: string
    ) => {
      return db.createTeamMatchCard(matchId, teamId, type, reason);
    }
  );

  ipcMain.handle('db:getTeamMatchCards', async (_, matchId: string) => {
    return db.getTeamMatchCards(matchId);
  });

  // Cartons individuels des relais par équipes (#1086)
  ipcMain.handle('db:createTeamBoutCard', async (_, boutId: string, card: Card) => {
    return db.createTeamBoutCard(boutId, card);
  });

  ipcMain.handle('db:getTeamBoutCards', async (_, matchId: string) => {
    return db.getTeamBoutCards(matchId);
  });
}
