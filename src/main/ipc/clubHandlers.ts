/**
 * BellePoule Modern - Handlers IPC `club:*` : Mode Club (#1872).
 * Membres, séances, pointage, combats libres et statistiques par période.
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import { readPhotosZip } from './fileHandlers';
import type { DatabaseManager } from '../../database';
import type {
  ClubBoutFilter,
  ClubBoutInput,
  ClubBoutResult,
  ClubMemberInput,
  ClubMemberReport,
  ClubPeriodKind,
  ClubSessionInput,
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

export function registerClubHandlers({ db }: ClubHandlersContext): void {
  const repo = db.club;
  // Identité du club + cartes
  ipcMain.handle('club:getSettings', () => repo.getSettings());
  ipcMain.handle(
    'club:updateSettings',
    (_, data: { name?: string; logo?: string | null; stripCount?: number }) =>
      repo.updateSettings(data ?? {})
  );
  ipcMain.handle('club:importPhotos', async (_, filepath: string) =>
    repo.setPhotosByLicense(await readPhotosZip(filepath))
  );
  ipcMain.handle('club:findMemberByCardCode', (_, code: string) => repo.findMemberByCardCode(code));
  ipcMain.handle('club:regenerateCardCode', (_, id: string) => repo.regenerateCardCode(id));
  // Membres
  ipcMain.handle('club:listMembers', (_, includeInactive?: boolean) =>
    repo.listMembers(includeInactive === true)
  );
  ipcMain.handle('club:createMember', (_, data: ClubMemberInput) => repo.createMember(data));
  ipcMain.handle('club:updateMember', (_, id: string, data: Partial<ClubMemberInput>) =>
    repo.updateMember(id, data)
  );
  ipcMain.handle('club:deleteMember', (_, id: string) => repo.deleteMember(id));
  ipcMain.handle('club:importMembers', (_, inputs: ClubMemberInput[]) =>
    repo.importMembers(Array.isArray(inputs) ? inputs : [])
  );
  // Séances
  ipcMain.handle('club:listSessions', (_, range?: { from?: string; to?: string }) =>
    repo.listSessions(range ?? {})
  );
  ipcMain.handle('club:getSession', (_, id: string) => repo.getSession(id));
  ipcMain.handle('club:createSession', (_, data: ClubSessionInput) => repo.createSession(data));
  ipcMain.handle('club:updateSession', (_, id: string, data: Partial<ClubSessionInput>) =>
    repo.updateSession(id, data)
  );
  ipcMain.handle('club:closeSession', (_, id: string) => repo.closeSession(id));
  ipcMain.handle('club:reopenSession', (_, id: string) => repo.reopenSession(id));
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
}
