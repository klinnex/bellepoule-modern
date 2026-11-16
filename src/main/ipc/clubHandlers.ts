/**
 * BellePoule Modern - Handlers IPC `club:*` : Mode Club (#1872).
 * Membres, séances, pointage, combats libres et statistiques par période.
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import { readPhotosZip } from './fileHandlers';
import { remoteServers } from '../remoteRegistry';
import { TRAINING_ID } from './trainingHandlers';
import { trainingFinishListeners, type TrainingFinishRecord } from '../remote/matchFinish';
import {
  clubBoutIdOf,
  linkedClubSession,
  pushClubBout,
  releaseClubBout,
  setLinkedClubSession,
} from '../remote/clubArena';
import type { DatabaseManager } from '../../database';
import type {
  ClubBoutFilter,
  ClubBoutInput,
  ClubBoutResult,
  ClubExerciseInput,
  ClubItemInput,
  ClubLoanFilter,
  ClubLoanInput,
  ClubLoanReturn,
  ClubMemberInput,
  ClubMemberReport,
  ClubPeriodKind,
  ClubRecurrence,
  ClubSessionInput,
  ClubUpdate,
} from '../../shared/types/club';
import {
  computeHeadToHead,
  computeLeaderboard,
  computeMemberStats,
  statsByPeriod,
} from '../../shared/utils/clubStats';

export interface ClubHandlersContext {
  db: DatabaseManager;
}

const PERIOD_KINDS: readonly ClubPeriodKind[] = ['day', 'month', 'quarter', 'season', 'year'];

/** Fiche statistique d'un membre sur la plage demandée */
export function buildMemberReport(
  db: DatabaseManager,
  memberId: string,
  filter: Omit<ClubBoutFilter, 'memberId' | 'includeUnfinished'> = {},
  groupBy: ClubPeriodKind = 'month'
): ClubMemberReport {
  const bouts = db.club.listBouts({ ...filter, memberId });
  return {
    stats: computeMemberStats(memberId, bouts),
    headToHead: computeHeadToHead(memberId, bouts),
    progression: statsByPeriod(memberId, bouts, PERIOD_KINDS.includes(groupBy) ? groupBy : 'month'),
  };
}

/** Score final d'une tablette arbitre → combat du club terminé (saisie « referee ») */
export function onClubRemoteFinish(db: DatabaseManager, record: TrainingFinishRecord): void {
  const boutId = clubBoutIdOf(record?.id);
  if (!boutId) return;
  const bout = db.club.getBout(boutId);
  if (!bout || bout.status === 'cancelled') return;
  db.club.finishBout(boutId, {
    scoreA: record.scoreA,
    scoreB: record.scoreB,
    entryMode: 'referee',
    duration: record.durationSec,
  });
}

const trainingServer = () => remoteServers.get(TRAINING_ID);

export function registerClubHandlers({ db }: ClubHandlersContext): void {
  const repo = db.club;
  trainingFinishListeners.add(record => onClubRemoteFinish(db, record));
  // Saisie distante : serveur d'entraînement (tablettes /arene{N}/arbitre)
  ipcMain.handle('club:remoteStatus', () => {
    const entry = trainingServer();
    const active = !!entry?.server.hasSession();
    return {
      active,
      url: entry ? entry.server.getServerUrl() : null,
      strips: active ? entry!.server.getArenaCount() : 0,
    };
  });
  ipcMain.handle('club:pushBout', (_, boutId: string) => {
    const bout = repo.getBout(boutId);
    if (!bout || (bout.status !== 'pending' && bout.status !== 'in_progress')) return 'no_arena';
    return pushClubBout(
      trainingServer()?.server,
      bout,
      repo.getMember(bout.memberAId),
      repo.getMember(bout.memberBId)
    );
  });
  ipcMain.handle('club:linkRemote', (_, sessionId: string | null) =>
    setLinkedClubSession(typeof sessionId === 'string' ? sessionId : null)
  );
  ipcMain.handle('club:releaseBout', (_, boutId: string) =>
    releaseClubBout(trainingServer()?.server, boutId)
  );
  // Identité du club + cartes
  // Clubs
  ipcMain.handle('club:listClubs', () => repo.listClubs());
  ipcMain.handle('club:getClub', (_, id: string) => repo.getClub(id));
  ipcMain.handle('club:createClub', (_, data: { name: string; stripCount?: number }) =>
    repo.createClub(data ?? { name: '' })
  );
  ipcMain.handle('club:updateClub', (_, id: string, data: ClubUpdate) =>
    repo.updateClub(id, data ?? {})
  );
  ipcMain.handle('club:deleteClub', (_, id: string) => repo.deleteClub(id));
  ipcMain.handle('club:importPhotos', async (_, clubId: string, filepath: string) =>
    repo.setPhotosByLicense(clubId, await readPhotosZip(filepath))
  );
  ipcMain.handle('club:findMemberByCardCode', (_, code: string, clubId?: string) =>
    repo.findMemberByCardCode(code, typeof clubId === 'string' ? clubId : undefined)
  );
  ipcMain.handle('club:regenerateCardCode', (_, id: string) => repo.regenerateCardCode(id));
  // Membres
  ipcMain.handle('club:listMembers', (_, clubId: string, includeInactive?: boolean) =>
    repo.listMembers(clubId, includeInactive === true)
  );
  ipcMain.handle('club:createMember', (_, clubId: string, data: ClubMemberInput) =>
    repo.createMember(clubId, data)
  );
  ipcMain.handle('club:updateMember', (_, id: string, data: Partial<ClubMemberInput>) =>
    repo.updateMember(id, data)
  );
  ipcMain.handle('club:deleteMember', (_, id: string) => repo.deleteMember(id));
  ipcMain.handle('club:importMembers', (_, clubId: string, inputs: ClubMemberInput[]) =>
    repo.importMembers(clubId, Array.isArray(inputs) ? inputs : [])
  );
  // Séances
  ipcMain.handle('club:listSessions', (_, clubId: string, range?: { from?: string; to?: string }) =>
    repo.listSessions(clubId, range ?? {})
  );
  ipcMain.handle('club:getSession', (_, id: string) => repo.getSession(id));
  ipcMain.handle('club:createSession', (_, clubId: string, data: ClubSessionInput) =>
    repo.createSession(clubId, data)
  );
  ipcMain.handle('club:updateSession', (_, id: string, data: Partial<ClubSessionInput>) =>
    repo.updateSession(id, data)
  );
  ipcMain.handle(
    'club:createSeries',
    (_, clubId: string, data: ClubSessionInput, recurrence: ClubRecurrence) =>
      repo.createSeries(clubId, data, recurrence ?? { everyDays: 0 })
  );
  ipcMain.handle('club:closeSession', (_, id: string) => {
    // Séance fermée : les tablettes ne lancent plus de combats pour elle
    if (linkedClubSession() === id) setLinkedClubSession(null);
    return repo.closeSession(id);
  });
  ipcMain.handle('club:reopenSession', (_, id: string) => repo.reopenSession(id));
  ipcMain.handle('club:startSession', (_, id: string) => repo.startSession(id));
  ipcMain.handle('club:setMemberFeedback', (_, sessionId: string, memberId: string, text: string) =>
    repo.setMemberFeedback(sessionId, memberId, typeof text === 'string' ? text : '')
  );
  // Bibliothèque d'exercices
  ipcMain.handle('club:listExercises', () => repo.listExercises());
  ipcMain.handle('club:createExercise', (_, data: ClubExerciseInput) =>
    repo.createExercise(data ?? { title: '' })
  );
  ipcMain.handle('club:updateExercise', (_, id: string, data: Partial<ClubExerciseInput>) =>
    repo.updateExercise(id, data ?? {})
  );
  ipcMain.handle('club:deleteExercise', (_, id: string) => repo.deleteExercise(id));
  ipcMain.handle('club:importExercises', (_, list: ClubExerciseInput[]) =>
    repo.importExercises(Array.isArray(list) ? list : [])
  );
  ipcMain.handle('club:getMemberFeedback', (_, memberId: string) =>
    repo.getMemberFeedback(memberId)
  );
  ipcMain.handle('club:deleteSession', (_, id: string) => repo.deleteSession(id));
  ipcMain.handle('club:setAttendance', (_, sessionId: string, memberId: string, present: boolean) =>
    repo.setAttendance(sessionId, memberId, present === true)
  );
  // Combats
  ipcMain.handle('club:listBouts', (_, filter?: ClubBoutFilter) => repo.listBouts(filter ?? {}));
  ipcMain.handle('club:createBout', (_, data: ClubBoutInput) => repo.createBout(data));
  ipcMain.handle('club:startBout', (_, id: string) => repo.startBout(id));
  ipcMain.handle('club:updateBoutScore', (_, id: string, scoreA: number, scoreB: number) =>
    repo.updateBoutScore(id, scoreA, scoreB)
  );
  ipcMain.handle('club:finishBout', (_, id: string, result: ClubBoutResult) =>
    repo.finishBout(id, result)
  );
  ipcMain.handle('club:cancelBout', (_, id: string) => repo.cancelBout(id));
  ipcMain.handle('club:deleteBout', (_, id: string) => repo.deleteBout(id));
  // Statistiques
  ipcMain.handle('club:getLeaderboard', (_, filter?: ClubBoutFilter) =>
    computeLeaderboard(repo.listBouts({ ...(filter ?? {}), includeUnfinished: false }))
  );
  ipcMain.handle(
    'club:getMemberReport',
    (_, memberId: string, filter?: ClubBoutFilter, groupBy?: ClubPeriodKind) =>
      buildMemberReport(db, memberId, filter ?? {}, groupBy ?? 'month')
  );
  // Inventaire : matériel et prêts
  const inv = db.clubInventory;
  ipcMain.handle('club:listItems', (_, clubId: string, includeRetired?: boolean) =>
    inv.listItems(clubId, includeRetired !== false)
  );
  ipcMain.handle('club:createItem', (_, clubId: string, data: ClubItemInput) =>
    inv.createItem(clubId, data ?? { name: '', category: 'other' })
  );
  ipcMain.handle('club:updateItem', (_, id: string, data: Partial<ClubItemInput>) =>
    inv.updateItem(id, data ?? {})
  );
  ipcMain.handle('club:deleteItem', (_, id: string) => inv.deleteItem(id));
  ipcMain.handle('club:listLoans', (_, clubId: string, filter?: ClubLoanFilter) =>
    inv.listLoans(clubId, filter ?? {})
  );
  ipcMain.handle('club:lendItem', (_, data: ClubLoanInput) => inv.lendItem(data));
  ipcMain.handle('club:returnLoan', (_, id: string, data?: ClubLoanReturn) =>
    inv.returnLoan(id, data ?? {})
  );
  ipcMain.handle('club:deleteLoan', (_, id: string) => inv.deleteLoan(id));
  ipcMain.handle('club:listCategories', (_, clubId: string) => inv.listCategories(clubId));
  ipcMain.handle('club:createCategory', (_, clubId: string, name: string) =>
    inv.createCategory(clubId, name)
  );
  ipcMain.handle('club:renameCategory', (_, id: string, name: string) =>
    inv.renameCategory(id, name)
  );
  ipcMain.handle('club:deleteCategory', (_, id: string) => inv.deleteCategory(id));
  ipcMain.handle('club:listBrands', (_, clubId: string) => inv.listBrands(clubId));
  ipcMain.handle('club:createBrand', (_, clubId: string, name: string) =>
    inv.createBrand(clubId, name)
  );
  ipcMain.handle('club:renameBrand', (_, id: string, name: string) => inv.renameBrand(id, name));
  ipcMain.handle('club:deleteBrand', (_, id: string) => inv.deleteBrand(id));
  ipcMain.handle('club:getInventoryLock', (_, clubId: string) => inv.isInventoryLocked(clubId));
  ipcMain.handle('club:setInventoryLock', (_, clubId: string, locked: boolean) =>
    inv.setInventoryLock(clubId, locked === true)
  );
  ipcMain.handle('club:importItems', (_, clubId: string, list: ClubItemInput[]) =>
    inv.importItems(clubId, Array.isArray(list) ? list : [])
  );
}
