/**
 * BellePoule Modern - Réglages du serveur MCP (#1880) : <userData>/mcp-settings.json
 * (activé, port) et jeton d'accès chiffré par safeStorage (<userData>/mcp-token.bin).
 * Désactivé par défaut.
 * Licensed under GPL-3.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export interface McpSettings {
  enabled: boolean;
  port: number;
  /** Outils d'écriture administrative (création, import, pointage) ; désactivé par défaut */
  allowWrite: boolean;
}

export const DEFAULT_MCP_SETTINGS: McpSettings = { enabled: false, port: 8067, allowWrite: false };

/** Chiffrement du système (Electron safeStorage), injecté pour les tests */
export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(data: Buffer): string;
}

const settingsFile = (dir: string) => path.join(dir, 'mcp-settings.json');
const tokenFile = (dir: string) => path.join(dir, 'mcp-token.bin');

export function readMcpSettings(dir: string): McpSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(dir), 'utf8')) as Partial<McpSettings>;
    return sanitizeMcpSettings(raw);
  } catch {
    return { ...DEFAULT_MCP_SETTINGS };
  }
}

export function sanitizeMcpSettings(input: Partial<McpSettings> | null | undefined): McpSettings {
  const port = Number(input?.port);
  return {
    enabled: input?.enabled === true,
    allowWrite: input?.allowWrite === true,
    port:
      Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_MCP_SETTINGS.port,
  };
}

export function writeMcpSettings(dir: string, settings: McpSettings): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsFile(dir), JSON.stringify(sanitizeMcpSettings(settings), null, 2));
}

/** Nouveau jeton (256 bits), enregistré chiffré si le système le permet */
export function regenerateMcpToken(dir: string, box: SecretBox): string {
  const token = randomBytes(32).toString('base64url');
  fs.mkdirSync(dir, { recursive: true });
  const data = box.isEncryptionAvailable()
    ? Buffer.concat([Buffer.from('ENC1'), box.encryptString(token)])
    : Buffer.from(`RAW1${token}`);
  fs.writeFileSync(tokenFile(dir), data, { mode: 0o600 });
  return token;
}

/** Jeton enregistré mais indéchiffrable dans ce contexte (trousseau différent ou verrouillé) */
export class McpTokenUnreadableError extends Error {
  public readonly code = 'token_unreadable';
  constructor() {
    super('Jeton MCP illisible dans ce contexte : le régénérer (Paramètres ou --mcp-new-token)');
    this.name = 'McpTokenUnreadableError';
  }
}

/**
 * Jeton existant, sinon créé. Un jeton enregistré mais illisible (autre trousseau : service,
 * SSH, session sans bureau) n'est jamais remplacé en silence : les clients déjà configurés
 * seraient refusés sans explication. L'opérateur le régénère explicitement.
 */
export function getMcpToken(dir: string, box: SecretBox): string {
  let data: Buffer;
  try {
    data = fs.readFileSync(tokenFile(dir));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return regenerateMcpToken(dir, box);
    throw new McpTokenUnreadableError();
  }
  const tag = data.subarray(0, 4).toString();
  if (tag === 'RAW1' && data.length > 4) return data.subarray(4).toString();
  if (tag === 'ENC1' && box.isEncryptionAvailable()) {
    try {
      const token = box.decryptString(data.subarray(4));
      if (token) return token;
    } catch {
      /* indéchiffrable dans ce contexte */
    }
  }
  throw new McpTokenUnreadableError();
}
