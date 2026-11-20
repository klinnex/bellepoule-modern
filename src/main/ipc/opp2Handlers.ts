/**
 * BellePoule Modern - Handlers IPC OPP2 (#1960)
 * Broker MQTT intégré et pilote OPP2 des appareils de piste, à côté de Cyrano.
 * Canaux : opp2:start, opp2:stop, opp2:isRunning, opp2:setPistes, opp2:getStatus
 * Licensed under GPL-3.0
 */

import { ipcMain } from 'electron';
import type { MqttBroker } from '../opp2/mqttBroker';
import type { Opp2PisteConfig, Opp2PisteDriver } from '../opp2/driver';
import type { PisteHub } from '../piste/pisteHub';

export interface Opp2HandlersContext {
  broker: MqttBroker;
  driver: Opp2PisteDriver;
  pisteHub: PisteHub;
  /** Cyrano en service : le PisteHub reste branché à l'arrêt d'OPP2 */
  cyranoRunning: () => boolean;
}

/** Port MQTT standard (spéc. OPP2 § 4.7) */
export const OPP2_DEFAULT_PORT = 1883;

const isPort = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 65535;

export function registerOpp2Handlers(ctx: Opp2HandlersContext): void {
  const { broker, driver, pisteHub } = ctx;

  ipcMain.handle(
    'opp2:start',
    async (
      _,
      options?: { port?: unknown }
    ): Promise<{ success: boolean; port?: number; error?: string }> => {
      if (broker.running) return { success: true, port: broker.port };
      const port = isPort(options?.port) ? options.port : OPP2_DEFAULT_PORT;
      try {
        const bound = await broker.start(port);
        driver.start();
        pisteHub.attach();
        return { success: true, port: bound };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'start_failed' };
      }
    }
  );

  ipcMain.handle('opp2:stop', async (): Promise<void> => {
    driver.stop();
    await broker.stop();
    if (!ctx.cyranoRunning()) pisteHub.detach();
  });

  ipcMain.handle('opp2:isRunning', (): boolean => broker.running);

  ipcMain.handle('opp2:setPistes', (_, pistes: unknown): void => {
    if (!Array.isArray(pistes)) return;
    driver.setPistes(pistes.slice(0, 64) as Opp2PisteConfig[]);
    pisteHub.syncPisteModes();
  });

  ipcMain.handle('opp2:getStatus', () => {
    const alerts = pisteHub.getAlerts();
    return {
      running: broker.running,
      port: broker.port,
      clients: broker.getClients().length,
      unknownPistes: driver.getUnknownPistes(),
      pistes: driver.getStatuses().map(p => ({ ...p, alert: alerts[p.piste] ?? null })),
    };
  });
}
