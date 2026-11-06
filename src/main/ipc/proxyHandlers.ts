/**
 * BellePoule Modern - Handlers IPC `proxy:*` : proxy réseau (Paramètres → Réseau)
 * Licensed under GPL-3.0
 */
import { app, ipcMain, session } from 'electron';
import {
  readProxySettings,
  sanitizeProxySettings,
  toElectronProxyConfig,
  writeProxySettings,
  type ProxySettings,
} from '../proxySettings';
import { getJson } from '../updateHttp';
import { logger, LogCategory, toError } from '../../shared/services/logger';

const TEST_URL = 'https://api.github.com/repos/klinnex/bellepoule-modern';

/** Applique le proxy à la session par défaut et coupe les connexions ouvertes. */
export async function applyProxySettings(settings: ProxySettings): Promise<void> {
  const ses = session.defaultSession;
  await ses.setProxy(toElectronProxyConfig(settings));
  await ses.closeAllConnections();
  logger.info(
    LogCategory.SYSTEM,
    `[Proxy] ${settings.mode}${settings.server ? ` ${settings.server}` : ''}`
  );
}

/** Au démarrage (après app.whenReady), avant le premier accès réseau. */
export async function applyStoredProxySettings(): Promise<void> {
  try {
    await applyProxySettings(readProxySettings(app.getPath('userData')));
  } catch (e) {
    logger.error(LogCategory.SYSTEM, '[Proxy] application impossible', toError(e));
  }
}

export function registerProxyHandlers(): void {
  ipcMain.handle('proxy:get', async () => readProxySettings(app.getPath('userData')));

  ipcMain.handle('proxy:set', async (_, input: unknown) => {
    const settings = sanitizeProxySettings(input);
    if (!settings) return { success: false, error: 'invalid_proxy' };
    await applyProxySettings(settings);
    writeProxySettings(app.getPath('userData'), settings);
    return { success: true, settings };
  });

  // Test : proxy effectivement résolu pour GitHub + requête réelle
  ipcMain.handle('proxy:test', async () => {
    const resolved = await session.defaultSession.resolveProxy(TEST_URL);
    const ok = (await getJson(TEST_URL, 8000)) !== null;
    return { ok, resolved };
  });
}
