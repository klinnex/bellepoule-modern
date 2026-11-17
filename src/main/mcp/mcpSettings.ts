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
}

export const DEFAULT_MCP_SETTINGS: McpSettings = { enabled: false, port: 8067 };

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

/** Jeton existant, sinon créé */
export function getMcpToken(dir: string, box: SecretBox): string {
  try {
    const data = fs.readFileSync(tokenFile(dir));
    const tag = data.subarray(0, 4).toString();
    if (tag === 'ENC1' && box.isEncryptionAvailable()) return box.decryptString(data.subarray(4));
    if (tag === 'RAW1') return data.subarray(4).toString();
  } catch {
    /* absent ou illisible : nouveau jeton */
  }
  return regenerateMcpToken(dir, box);
}
