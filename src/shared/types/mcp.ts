/**
 * BellePoule Modern - Types du serveur MCP intégré (#1880)
 * Licensed under GPL-3.0
 */

/**
 * Événements du bus `competition:event` émis après une écriture de l'agent :
 * liste ou réglages des épreuves modifiés, état de session réécrit (poules, scores, tableau).
 */
export type McpScreenEvent = 'competitions:changed' | 'session:changed';

export interface McpStatus {
  /** Activé dans les Paramètres (désactivé par défaut) */
  enabled: boolean;
  /** Outils d'écriture administrative autorisés (lot 2) */
  allowWrite: boolean;
  running: boolean;
  port: number;
  /** http://127.0.0.1:<port>/mcp quand le serveur tourne */
  url: string | null;
  /** Jeton Bearer à déclarer dans le client MCP (.mcp.json du plugin) */
  token: string;
  /** Message du démarrage, ou `token_unreadable` (jeton indéchiffrable dans ce contexte) */
  error?: string;
}

export interface McpLogEntry {
  at: string;
  method: string;
  tool?: string;
  ok: boolean;
  ms: number;
}

export interface McpAPI {
  getStatus: () => Promise<McpStatus>;
  setSettings: (settings: {
    enabled?: boolean;
    port?: number;
    allowWrite?: boolean;
  }) => Promise<McpStatus>;
  regenerateToken: () => Promise<McpStatus>;
  getLog: () => Promise<McpLogEntry[]>;
}
