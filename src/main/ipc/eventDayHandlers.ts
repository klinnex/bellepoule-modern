/**
 * BellePoule Modern - Handlers IPC `eventDay:*` : journée multi-épreuves (#1714).
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import type { DatabaseManager } from '../../database';
import type { DayRefereeInput } from '../../shared/types/eventDay';
import type { EventDayOverview } from '../../shared/types/preload';
import { busyElsewhere, computeDayStatuses, detectDayConflicts } from '../../shared/utils/eventDay';

export interface EventDayHandlersContext {
  db: DatabaseManager;
}

/** Synchronise les arbitres de la journée dans toutes ses épreuves */
export function syncDay(db: DatabaseManager, dayId: string): { added: number; updated: number } {
  const day = db.eventDays.getDay(dayId);
  const total = { added: 0, updated: 0 };
  for (const competitionId of day?.competitionIds ?? []) {
    const r = db.eventDays.syncCompetition(competitionId);
    total.added += r.added;
    total.updated += r.updated;
  }
  return total;
}

export function buildOverview(db: DatabaseManager, dayId: string): EventDayOverview {
  const refs = db.eventDays.listReferees(dayId);
  const assignments = db.eventDays.getAssignments(dayId);
  return {
    statuses: computeDayStatuses(refs, assignments),
    conflicts: detectDayConflicts(refs, assignments, db.eventDays.getCompetitionWeapons(dayId)),
  };
}

export function registerEventDayHandlers({ db }: EventDayHandlersContext): void {
  const repo = db.eventDays;
  ipcMain.handle('eventDay:list', () => repo.listDays());
  ipcMain.handle('eventDay:create', (_, data) => repo.createDay(data));
  ipcMain.handle('eventDay:update', (_, id: string, updates) => repo.updateDay(id, updates));
  ipcMain.handle('eventDay:delete', (_, id: string) => repo.deleteDay(id));
  ipcMain.handle('eventDay:setCompetitionDay', (_, competitionId: string, dayId: string | null) => {
    repo.setCompetitionDay(competitionId, dayId);
    // Rattachement : arbitres de la journée reportés aussitôt dans l'épreuve
    return dayId ? repo.syncCompetition(competitionId) : { added: 0, updated: 0 };
  });
  ipcMain.handle('eventDay:listReferees', (_, dayId: string) => repo.listReferees(dayId));
  ipcMain.handle('eventDay:createReferee', (_, dayId: string, data: DayRefereeInput) =>
    repo.createReferee(dayId, data)
  );
  ipcMain.handle('eventDay:updateReferee', (_, id: string, data: DayRefereeInput) =>
    repo.updateReferee(id, data)
  );
  ipcMain.handle('eventDay:deleteReferee', (_, id: string) => repo.deleteReferee(id));
  ipcMain.handle('eventDay:syncReferees', (_, dayId: string) => syncDay(db, dayId));
  ipcMain.handle('eventDay:getOverview', (_, dayId: string) => buildOverview(db, dayId));
  ipcMain.handle('eventDay:getBusyElsewhere', (_, competitionId: string) => {
    const dayId = repo.getCompetitionDayId(competitionId);
    if (!dayId) return {};
    return busyElsewhere(
      repo.getAssignments(dayId),
      competitionId,
      repo.getLinks({ competitionId })
    );
  });
  ipcMain.handle('eventDay:getStripOccupation', (_, dayId: string) =>
    repo.getStripOccupation(dayId)
  );
}
