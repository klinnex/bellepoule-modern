/**
 * BellePoule Modern - Handlers IPC Cyrano (#1720)
 * Configuration et supervision du serveur UDP Cyrano et du PisteHub.
 * Canaux : cyrano:start, cyrano:stop, cyrano:isRunning, cyrano:setPistes,
 *          cyrano:getStatus, cyrano:getLog, cyrano:setOptions, cyrano:pisteAction (#1829)
 * Licensed under GPL-3.0
 */

import { ipcMain } from 'electron';
import { CyranoServer, type CyranoPisteConfig } from '../cyrano/server';
import {
  PISTE_ACTIONS,
  PisteHub,
  type PisteAction,
  type PisteHubOptions,
} from '../cyrano/pisteHub';

export interface CyranoHandlersContext {
  cyranoServer: CyranoServer;
  pisteHub: PisteHub;
}

export function registerCyranoHandlers(ctx: CyranoHandlersContext): void {
  const { cyranoServer, pisteHub } = ctx;

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
