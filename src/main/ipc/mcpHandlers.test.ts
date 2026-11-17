/**
 * Contrôleur du serveur MCP (#1880) : options de ligne de commande (--mcp, --mcp-port,
 * --mcp-write) sans modifier les réglages enregistrés, jeton illisible, configuration du client.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { createMcpController } from './mcpHandlers';
import type { McpWriteDeps } from '../mcp/mcpWriteTools';
import { getMcpToken, readMcpSettings, type SecretBox } from '../mcp/mcpSettings';

const box = (available: boolean): SecretBox => ({
  isEncryptionAvailable: () => available,
  encryptString: s => Buffer.from(s.split('').reverse().join('')),
  decryptString: b => b.toString().split('').reverse().join(''),
});
const deps = {
  db: {},
  notify: vi.fn(),
  remoteServers: () => [],
  cyranoStatus: () => null,
} as unknown as McpWriteDeps;
const freePort = async (): Promise<number> => {
  const probe = http.createServer();
  await new Promise<void>(r => probe.listen(0, '127.0.0.1', () => r()));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>(r => probe.close(() => r()));
  return port;
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-ctl-'));

describe('contrôleur MCP', () => {
  it('désactivé par défaut ; --mcp l’active sans toucher aux réglages enregistrés', async () => {
    const dir = tmp();
    const base = { deps, userDataDir: () => dir, secretBox: box(true), version: '1' };
    expect(await createMcpController(base).apply()).toMatchObject({
      enabled: false,
      running: false,
    });

    const port = await freePort();
    const mcp = createMcpController({
      ...base,
      override: { enabled: true, port, allowWrite: true },
    });
    const status = await mcp.apply();
    expect(status).toMatchObject({ enabled: true, allowWrite: true, running: true, port });
    expect(readMcpSettings(dir)).toEqual({ enabled: false, port: 8067, allowWrite: false });
    expect(mcp.clientConfig()).toEqual({
      mcpServers: {
        bellepoule: {
          type: 'http',
          url: `http://127.0.0.1:${port}/mcp`,
          headers: { Authorization: `Bearer ${getMcpToken(dir, box(true))}` },
        },
      },
    });
    await mcp.stop();
  });

  it('jeton illisible : serveur non démarré, erreur token_unreadable, puis régénération', async () => {
    const dir = tmp();
    getMcpToken(dir, box(true)); // jeton chiffré par le trousseau de la session
    const port = await freePort();
    // Autre contexte : trousseau indisponible
    const mcp = createMcpController({
      deps,
      userDataDir: () => dir,
      secretBox: box(false),
      version: '1',
      override: { enabled: true, port },
    });
    expect(await mcp.apply()).toMatchObject({
      running: false,
      token: '',
      error: 'token_unreadable',
    });
    expect(() => mcp.clientConfig()).toThrow(/illisible/);
    mcp.regenerateToken();
    const status = await mcp.apply();
    expect(status.running).toBe(true);
    expect(status.error).toBeUndefined();
    await mcp.stop();
  });
});
