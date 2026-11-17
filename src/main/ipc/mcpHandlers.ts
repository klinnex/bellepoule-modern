/**
 * BellePoule Modern - IPC mcp:* (#1880) : activation du serveur MCP, jeton, journal des appels.
 * Licensed under GPL-3.0
 */

import { ipcMain } from 'electron';
import { McpServer } from '../mcp/mcpServer';
import type { McpWriteDeps } from '../mcp/mcpWriteTools';
import {
  getMcpToken,
  McpTokenUnreadableError,
  readMcpSettings,
  regenerateMcpToken,
  sanitizeMcpSettings,
  writeMcpSettings,
  type SecretBox,
} from '../mcp/mcpSettings';
import { logger, LogCategory, toError } from '../../shared/services/logger';
import type { McpStatus } from '../../shared/types/mcp';

export interface McpHandlersContext {
  deps: McpWriteDeps;
  userDataDir: () => string;
  secretBox: SecretBox;
  version: string;
  /**
   * Ligne de commande (--mcp, --mcp-port, --mcp-write) : prime sur les réglages enregistrés,
   * sans les modifier. Permet d'utiliser le serveur sans écran.
   */
  override?: { enabled?: boolean; port?: number | null; allowWrite?: boolean };
}

export function createMcpController({
  deps,
  userDataDir,
  secretBox,
  version,
  override,
}: McpHandlersContext) {
  const server = new McpServer();
  let lastError: string | undefined;

  /** Réglages effectifs : ligne de commande, sinon fichier */
  const settings = () => {
    const s = readMcpSettings(userDataDir());
    return {
      enabled: override?.enabled || s.enabled,
      allowWrite: override?.allowWrite || s.allowWrite,
      port: override?.port ?? s.port,
    };
  };

  /** Jeton, ou chaîne vide s'il est illisible dans ce contexte (erreur token_unreadable) */
  const tokenOrEmpty = (): string => {
    try {
      return getMcpToken(userDataDir(), secretBox);
    } catch {
      return '';
    }
  };

  const status = (): McpStatus => {
    const s = settings();
    const token = tokenOrEmpty();
    const error = token ? lastError : 'token_unreadable';
    return {
      enabled: s.enabled,
      allowWrite: s.allowWrite,
      running: server.running,
      port: server.running ? server.port : s.port,
      url: server.running ? `http://127.0.0.1:${server.port}/mcp` : null,
      token,
      ...(error ? { error } : {}),
    };
  };

  /** Applique les réglages : démarre, redémarre ou arrête le serveur */
  const apply = async (): Promise<McpStatus> => {
    const s = settings();
    lastError = undefined;
    try {
      if (!s.enabled) await server.stop();
      else
        await server.start({
          port: s.port,
          token: getMcpToken(userDataDir(), secretBox),
          version,
          deps,
          allowWrite: s.allowWrite,
        });
    } catch (e) {
      // Jeton illisible : pas d'écoute plutôt qu'un jeton remplacé en silence
      lastError = e instanceof McpTokenUnreadableError ? e.code : toError(e).message;
      logger.error(LogCategory.SYSTEM, '[MCP] Démarrage impossible', toError(e));
      await server.stop();
    }
    return status();
  };

  /** Bloc `.mcp.json` du client (URL, jeton) ; lève McpTokenUnreadableError si le jeton est illisible */
  const clientConfig = (): Record<string, unknown> => ({
    mcpServers: {
      bellepoule: {
        type: 'http',
        url: `http://127.0.0.1:${settings().port}/mcp`,
        headers: { Authorization: `Bearer ${getMcpToken(userDataDir(), secretBox)}` },
      },
    },
  });

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

  return {
    register,
    apply,
    stop: () => server.stop(),
    clientConfig,
    regenerateToken: () => regenerateMcpToken(userDataDir(), secretBox),
  };
}
