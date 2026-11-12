/**
 * BellePoule Modern - Handlers IPC Cyrano (#1720)
 * Configuration et supervision du serveur UDP Cyrano et du PisteHub.
 * Canaux : cyrano:start, cyrano:stop, cyrano:isRunning, cyrano:setPistes,
 *          cyrano:getStatus, cyrano:getLog, cyrano:setOptions
 * Licensed under GPL-3.0
 */

import { ipcMain } from 'electron';
import { CyranoServer, type CyranoPisteConfig } from '../cyrano/server';
import { PisteHub, type PisteHubOptions } from '../cyrano/pisteHub';

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
      try {
        const port = await cyranoServer.start();
        pisteHub.attach();
        return { success: true, port };
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'start_failed' };
      }
    }
  );

  ipcMain.handle('cyrano:stop', async (): Promise<void> => {
    pisteHub.detach();
    await cyranoServer.stop();
  });

  ipcMain.handle('cyrano:isRunning', (): boolean => cyranoServer.running);

  ipcMain.handle(
    'cyrano:setPistes',
    (_, pistes: CyranoPisteConfig[]): void => {
      if (!Array.isArray(pistes)) return;
      cyranoServer.setPistes(pistes);
    }
  );

  ipcMain.handle('cyrano:getStatus', () => ({
    running: cyranoServer.running,
    port: cyranoServer.port,
    pistes: cyranoServer.getStatuses(),
  }));

  ipcMain.handle('cyrano:getLog', () => cyranoServer.getLog());

  ipcMain.handle(
    'cyrano:setOptions',
    (_, opts: PisteHubOptions): void => {
      pisteHub.setOptions(opts);
      if (opts.international !== undefined || opts.natSource !== undefined) {
        cyranoServer.getStatuses().forEach(p => pisteHub.clearDispCache(p.piste));
      }
    }
  );
}
