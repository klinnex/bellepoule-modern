/**
 * BellePoule Modern - Canaux IPC webhook : `remote:setWebhookUrl`, `remote:testWebhook` (#1269)
 * Le test part du main : la CSP du renderer bloque les hôtes externes.
 * Licensed under GPL-3.0
 */
import { ipcMain } from 'electron';
import { remoteServers } from '../remoteRegistry';
import { postWebhook } from '../webhook';

export function registerWebhookHandlers(): void {
  ipcMain.handle('remote:setWebhookUrl', async (_, url: string | null) => {
    try {
      for (const { server } of remoteServers.values()) {
        server.setWebhookUrl(url);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  });

  ipcMain.handle('remote:testWebhook', async (_, url: unknown) => {
    if (typeof url !== 'string') return { success: false, error: 'invalid_url' };
    return postWebhook(url, { text: '✅ BellePoule Modern — test de notification webhook' });
  });
}
