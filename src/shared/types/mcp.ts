/**
 * BellePoule Modern - Types du serveur MCP intégré (#1880)
 * Licensed under GPL-3.0
 */

export interface McpStatus {
  /** Activé dans les Paramètres (désactivé par défaut) */
  enabled: boolean;
  running: boolean;
  port: number;
  /** http://127.0.0.1:<port>/mcp quand le serveur tourne */
  url: string | null;
  /** Jeton Bearer à déclarer dans le client MCP (.mcp.json du plugin) */
  token: string;
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
  setSettings: (settings: { enabled?: boolean; port?: number }) => Promise<McpStatus>;
  regenerateToken: () => Promise<McpStatus>;
  getLog: () => Promise<McpLogEntry[]>;
}
