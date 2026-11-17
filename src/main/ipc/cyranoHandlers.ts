/**
 * BellePoule Modern - Handlers IPC Cyrano (#1720)
 * Configuration et supervision du serveur UDP Cyrano et du PisteHub.
 * Canaux : cyrano:start, cyrano:stop, cyrano:isRunning, cyrano:setPistes,
 *          cyrano:getStatus, cyrano:getLog, cyrano:setOptions, cyrano:pisteAction,
 *          cyrano:loadPistes, cyrano:savePistes (table des pistes en base, #1829),
 *          cyrano:getPistesScope, cyrano:getRoutes (pistes partagées d'une journée, #1878)
 * Licensed under GPL-3.0
 */

import { ipcMain } from 'electron';
import { CyranoServer, type CyranoPisteConfig } from '../cyrano/server';
import type { DatabaseManager } from '../../database';
import { PISTE_ACTIONS, PisteHub, type PisteAction, type PisteHubOptions } from '../piste/pisteHub';

export interface CyranoHandlersContext {
  cyranoServer: CyranoServer;
  pisteHub: PisteHub;
  db: Pick<DatabaseManager, 'getCyranoPistes' | 'replaceCyranoPistes'> & {
    eventDays?: Pick<DatabaseManager['eventDays'], 'getCompetitionDayId' | 'getDay'>;
  };
}

/** Clé de la table des pistes d'une journée multi-épreuves : partagée par ses épreuves (#1878). */
export const dayPistesKey = (dayId: string): string => `day:${dayId}`;

export function registerCyranoHandlers(ctx: CyranoHandlersContext): void {
  const { cyranoServer, pisteHub, db } = ctx;

  ipcMain.handle(
    'cyrano:start',
    async (
      _,
      options?: { port?: number; host?: string; compe?: string }
    ): Promise<{ success: boolean; port?: number; error?: string }> => {
      if (cyranoServer.running) return { success: true, port: cyranoServer.port };
      if (options?.compe) cyranoServer.setCompe(options.compe);
      // Interface d'écoute choisie (#1829) ; vide = toutes les interfaces
      if (options && 'host' in options && !cyranoServer.setHost(options.host)) {
        return { success: false, error: 'invalid_host' };
      }
      try {
        const port = await cyranoServer.start(options?.port);
        pisteHub.attach();
        return { success: true, port };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'start_failed' };
      }
    }
  );

  ipcMain.handle('cyrano:stop', async (): Promise<void> => {
    pisteHub.detach();
    await cyranoServer.stop();
  });

  ipcMain.handle('cyrano:isRunning', (): boolean => cyranoServer.running);

  ipcMain.handle('cyrano:setPistes', (_, pistes: CyranoPisteConfig[]): void => {
    if (!Array.isArray(pistes)) return;
    cyranoServer.setPistes(pistes);
    // Changement de mode d'une piste : DISP renvoyé (#1829)
    pisteHub.syncPisteModes();
  });

  /** Journée de l'épreuve : sa table des pistes est celle de la salle (#1878). */
  const dayOf = (competitionId: string): string | null =>
    db.eventDays?.getCompetitionDayId(competitionId) ?? null;

  // Table des pistes : rattachée à la compétition (#1829), ou à sa journée (#1878).
  // Journée encore vide : la table propre de l'épreuve est reprise (installation existante).
  ipcMain.handle('cyrano:loadPistes', (_, competitionId: unknown): Record<string, unknown>[] => {
    if (typeof competitionId !== 'string' || !competitionId) return [];
    const day = dayOf(competitionId);
    const rows = day ? db.getCyranoPistes(dayPistesKey(day)) : [];
    return (rows.length > 0 ? rows : db.getCyranoPistes(competitionId)).map(row => row.config);
  });

  ipcMain.handle(
    'cyrano:getPistesScope',
    (_, competitionId: unknown): { dayId: string; dayName: string } | null => {
      if (typeof competitionId !== 'string' || !competitionId) return null;
      const day = dayOf(competitionId);
      if (!day) return null;
      return { dayId: day, dayName: db.eventDays?.getDay(day)?.name ?? '' };
    }
  );

  ipcMain.handle('cyrano:getRoutes', (): Record<string, string | null> => pisteHub.getRoutes());

  ipcMain.handle('cyrano:savePistes', (_, competitionId: unknown, pistes: unknown): boolean => {
    if (typeof competitionId !== 'string' || !competitionId || !Array.isArray(pistes)) return false;
    const rows = pistes
      .filter(
        (p): p is Record<string, unknown> & { piste: string } =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as { piste?: unknown }).piste === 'string' &&
          (p as { piste: string }).piste.length > 0 &&
          (p as { piste: string }).piste.length <= 16
      )
      // Doublon de numéro de piste : garde la première (clé primaire competition_id + piste)
      .filter((p, i, all) => all.findIndex(q => q.piste === p.piste) === i)
      .slice(0, 64)
      .map(p => ({ piste: p.piste, config: p }));
    const day = dayOf(competitionId);
    db.replaceCyranoPistes(day ? dayPistesKey(day) : competitionId, rows);
    return true;
  });

  ipcMain.handle('cyrano:getStatus', () => {
    const alerts = pisteHub.getAlerts();
    return {
      running: cyranoServer.running,
      port: cyranoServer.port,
      pistes: cyranoServer.getStatuses().map(p => ({ ...p, alert: alerts[p.piste] ?? null })),
    };
  });

  ipcMain.handle('cyrano:getLog', () => cyranoServer.getLog());

  ipcMain.handle('cyrano:pisteAction', (_, piste: unknown, action: unknown): boolean => {
    if (typeof piste !== 'string' || !PISTE_ACTIONS.includes(action as PisteAction)) return false;
    return pisteHub.pisteAction(piste, action as PisteAction);
  });

  ipcMain.handle('cyrano:setOptions', (_, opts: PisteHubOptions): void => {
    pisteHub.setOptions(opts);
    if (opts.international !== undefined || opts.natSource !== undefined) {
      cyranoServer.getStatuses().forEach(p => pisteHub.clearDispCache(p.piste));
    }
  });
}
