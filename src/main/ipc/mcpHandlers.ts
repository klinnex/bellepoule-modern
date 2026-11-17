/**
 * BellePoule Modern - IPC mcp:* (#1880) : activation du serveur MCP, jeton, journal des appels.
 * Licensed under GPL-3.0
 */

import { ipcMain } from 'electron';
import { McpServer } from '../mcp/mcpServer';
import type { McpDeps } from '../mcp/mcpTools';
import {
  getMcpToken,
  readMcpSettings,
  regenerateMcpToken,
  sanitizeMcpSettings,
  writeMcpSettings,
  type SecretBox,
} from '../mcp/mcpSettings';
import { logger, LogCategory, toError } from '../../shared/services/logger';
import type { McpStatus } from '../../shared/types/mcp';

export interface McpHandlersContext {
  deps: McpDeps;
  userDataDir: () => string;
  secretBox: SecretBox;
  version: string;
}

export function createMcpController({ deps, userDataDir, secretBox, version }: McpHandlersContext) {
  const server = new McpServer();
  let lastError: string | undefined;

  const status = (): McpStatus => {
    const s = readMcpSettings(userDataDir());
    return {
      enabled: s.enabled,
      running: server.running,
      port: server.running ? server.port : s.port,
      url: server.running ? `http://127.0.0.1:${server.port}/mcp` : null,
      token: getMcpToken(userDataDir(), secretBox),
      ...(lastError ? { error: lastError } : {}),
    };
  };

  /** Applique les réglages : démarre, redémarre ou arrête le serveur */
  const apply = async (): Promise<McpStatus> => {
    const s = readMcpSettings(userDataDir());
    lastError = undefined;
    try {
      if (!s.enabled) await server.stop();
      else
        await server.start({
          port: s.port,
          token: getMcpToken(userDataDir(), secretBox),
          version,
          deps,
        });
    } catch (e) {
      lastError = toError(e).message;
      logger.error(LogCategory.SYSTEM, '[MCP] Démarrage impossible', toError(e));
      await server.stop();
    }
    return status();
  };

  const register = (): void => {
    ipcMain.handle('mcp:getStatus', () => status());
    ipcMain.handle('mcp:setSettings', async (_, input: unknown) => {
      const current = readMcpSettings(userDataDir());
      const next = sanitizeMcpSettings({
        ...current,
        ...(input && typeof input === 'object' ? (input as Record<string, unknown>) : {}),
      });
      writeMcpSettings(userDataDir(), next);
      return apply();
    });
    ipcMain.handle('mcp:regenerateToken', async () => {
      regenerateMcpToken(userDataDir(), secretBox);
      return apply();
    });
    ipcMain.handle('mcp:getLog', () => server.getLog());
  };

  return { register, apply, stop: () => server.stop() };
}
