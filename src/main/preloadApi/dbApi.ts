/**
 * BellePoule Modern - Préload : Base de données (db:*), avec validation (#1774)
 * Licensed under GPL-3.0
 */
import { ipcRenderer } from 'electron';
import type {
  ArenaExitData,
  CompetitionCreateData,
  CompetitionUpdateData,
  DatabaseAPI,
  FencerCreateData,
  FencerUpdateData,
  MatchCardData,
  MatchCreateData,
  MatchSnapshot,
  MatchTimingData,
  SimulatedMatchEvents,
  MatchTouchData,
  MatchUpdateData,
  Pool,
  PoolSnapshot,
  SessionState,
} from '../../shared/types/preload';
import {
  validateUUID,
  validateCompetitionData,
  validateFencerData,
  validateMatchData,
} from '../ipc/validation';

export const dbApi = {
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
  syncPoolSnapshot: (competitionId: string, snapshot: PoolSnapshot) => {
    if (!competitionId || typeof competitionId !== 'string') {
      throw new Error('Competition ID is required and must be a string');
    }
    if (
      !snapshot ||
      typeof snapshot.id !== 'string' ||
      !Array.isArray(snapshot.fencerIds) ||
      !Array.isArray(snapshot.matches)
    ) {
      throw new Error('Pool snapshot is invalid');
    }
    return ipcRenderer.invoke('db:syncPoolSnapshot', competitionId, snapshot);
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
  updatePoolReferees: (poolId: string, refereeIds: string[]) =>
    ipcRenderer.invoke('db:updatePoolReferees', poolId, refereeIds),

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
  getRefereeComments: (competitionId: string, refereeId?: string) =>
    ipcRenderer.invoke('db:getRefereeComments', competitionId, refereeId),
  updateReferee: (id: string, updates: Record<string, string | undefined>) =>
    ipcRenderer.invoke('db:updateReferee', id, updates),
  deleteReferee: (id: string) => ipcRenderer.invoke('db:deleteReferee', id),
  getMatchesWithReferees: (competitionId: string) =>
    ipcRenderer.invoke('db:getMatchesWithReferees', competitionId),
  getRefereeStats: (competitionId: string) =>
    ipcRenderer.invoke('db:getRefereeStats', competitionId),

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
  replaceSimulatedMatchEvents: (matchId: string, events: SimulatedMatchEvents | null) =>
    ipcRenderer.invoke('db:replaceSimulatedMatchEvents', matchId, events),
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
  getMatchTimeline: (matchId: string) => ipcRenderer.invoke('db:getMatchTimeline', matchId),
  getCompetitionTimeline: (competitionId: string) =>
    ipcRenderer.invoke('db:getCompetitionTimeline', competitionId),

  // Classement saisonnier Quest
  addCompetitionToSeason: (payload: any) =>
    ipcRenderer.invoke('db:addCompetitionToSeason', payload),
  getSeasonRanking: () => ipcRenderer.invoke('db:getSeasonRanking'),
  getSeasonCompetitions: () => ipcRenderer.invoke('db:getSeasonCompetitions'),
  removeCompetitionFromSeason: (competitionId: string) =>
    ipcRenderer.invoke('db:removeCompetitionFromSeason', competitionId),
  resetSeason: () => ipcRenderer.invoke('db:resetSeason'),

  // Équipes
  createTeam: (competitionId: string, name: string, club: string) =>
    ipcRenderer.invoke('db:createTeam', competitionId, name, club),
  getTeamsByCompetition: (competitionId: string) =>
    ipcRenderer.invoke('db:getTeamsByCompetition', competitionId),
  deleteTeam: (teamId: string) => ipcRenderer.invoke('db:deleteTeam', teamId),
  upsertTeamFencer: (teamId: string, fencerId: string, teamOrder: number, isReserve: boolean) =>
    ipcRenderer.invoke('db:upsertTeamFencer', teamId, fencerId, teamOrder, isReserve),
  removeTeamFencer: (teamId: string, fencerId: string) =>
    ipcRenderer.invoke('db:removeTeamFencer', teamId, fencerId),
  createTeamMatch: (
    competitionId: string,
    poolNumber: number,
    teamAId: string,
    teamBId: string,
    round?: number
  ) => ipcRenderer.invoke('db:createTeamMatch', competitionId, poolNumber, teamAId, teamBId, round),
  getTeamMatchesByCompetition: (competitionId: string) =>
    ipcRenderer.invoke('db:getTeamMatchesByCompetition', competitionId),
  createTeamBout: (
    matchId: string,
    boutOrder: number,
    fencerAId: string,
    fencerBId: string,
    maxScore: number
  ) => ipcRenderer.invoke('db:createTeamBout', matchId, boutOrder, fencerAId, fencerBId, maxScore),
  updateTeamBout: (
    boutId: string,
    scoreA: number,
    scoreB: number,
    status: string,
    winnerId: string | null
  ) => ipcRenderer.invoke('db:updateTeamBout', boutId, scoreA, scoreB, status, winnerId),
  createTeamTableauMatch: (
    competitionId: string,
    tableId: string,
    round: number,
    position: number,
    teamAId: string,
    teamBId: string
  ) =>
    ipcRenderer.invoke(
      'db:createTeamTableauMatch',
      competitionId,
      tableId,
      round,
      position,
      teamAId,
      teamBId
    ),
  getTeamTableauMatches: (competitionId: string, tableId: string) =>
    ipcRenderer.invoke('db:getTeamTableauMatches', competitionId, tableId),
  createTeamMatchCard: (
    matchId: string,
    teamId: string,
    type: 'white' | 'yellow' | 'red' | 'black',
    reason: string
  ) => ipcRenderer.invoke('db:createTeamMatchCard', matchId, teamId, type, reason),
  getTeamMatchCards: (matchId: string) => ipcRenderer.invoke('db:getTeamMatchCards', matchId),
  createTeamBoutCard: (boutId: string, card: unknown) =>
    ipcRenderer.invoke('db:createTeamBoutCard', boutId, card),
  getTeamBoutCards: (matchId: string) => ipcRenderer.invoke('db:getTeamBoutCards', matchId),
} satisfies DatabaseAPI;
