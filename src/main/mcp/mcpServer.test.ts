/**
 * Serveur MCP intégré (#1880) : protocole JSON-RPC, sécurité HTTP (jeton, boucle locale),
 * outils en lecture.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'http';
import { McpServer, handleMcpMessage, isLocalRequest, tokenMatches } from './mcpServer';
import type { McpWriteDeps } from './mcpWriteTools';
import { FencerStatus } from '../../shared/types';

const deps = {
  db: {
    getAllCompetitions: () => [
      {
        id: 'c1',
        title: 'Open',
        date: '2026-12-06',
        weapon: 'E',
        gender: 'M',
        category: 'SENIOR',
        phases: [],
        currentPhaseIndex: 0,
      },
    ],
    getCompetition: (id: string) => (id === 'c1' ? { id: 'c1', title: 'Open' } : null),
    getFencersByCompetition: () => [
      {
        id: 'f1',
        ref: 1,
        lastName: 'DUPONT',
        firstName: 'Léa',
        club: 'CE',
        status: FencerStatus.CHECKED_IN,
        birthDate: '2008-01-01',
        license: '123',
      },
    ],
    getCompetitionPools: () => [],
    eventDays: { getCompetitionDayId: () => null, listDays: () => [] },
  },
  remoteServers: () => [],
  cyranoStatus: () => ({ running: false }),
  notify: () => {},
} as unknown as McpWriteDeps;

const call = (method: string, params?: Record<string, unknown>, id: number | undefined = 1) =>
  handleMcpMessage({ jsonrpc: '2.0', id, method, params }, deps, '1.2.3');

describe('handleMcpMessage', () => {
  it('initialize : version négociée, capacité outils', async () => {
    const r = (await call('initialize', { protocolVersion: '2025-03-26' })) as {
      result: { protocolVersion: string; capabilities: object; serverInfo: { version: string } };
    };
    expect(r.result.protocolVersion).toBe('2025-03-26');
    expect(r.result.capabilities).toHaveProperty('tools');
    expect(r.result.serverInfo.version).toBe('1.2.3');
  });

  it('notification : pas de réponse', async () => {
    expect(
      await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps, '1')
    ).toBeNull();
  });

  it('tools/list : outils en lecture uniquement', async () => {
    const r = (await call('tools/list')) as {
      result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> };
    };
    const names = r.result.tools.map(t => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_competitions',
        'list_fencers',
        'get_pool_ranking',
        'day_overview',
        'server_status',
      ])
    );
    expect(r.result.tools.every(t => t.annotations.readOnlyHint)).toBe(true);
  });

  it('tools/call : données sans date de naissance ni licence', async () => {
    const r = (await call('tools/call', {
      name: 'list_fencers',
      arguments: { competitionId: 'c1' },
    })) as { result: { content: Array<{ text: string }> } };
    const text = r.result.content[0].text;
    expect(text).toContain('DUPONT');
    expect(text).not.toContain('2008-01-01');
    expect(text).not.toContain('"license"');
  });

  it('tools/call : argument manquant ou compétition inconnue → isError', async () => {
    const r = (await call('tools/call', { name: 'list_fencers', arguments: {} })) as {
      result: { isError: boolean };
    };
    expect(r.result.isError).toBe(true);
    const r2 = (await call('tools/call', {
      name: 'list_fencers',
      arguments: { competitionId: 'zz' },
    })) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(r2.result.content[0].text).toContain('inconnue');
  });

  it('méthode ou outil inconnu → erreur JSON-RPC', async () => {
    expect(await call('resources/list')).toMatchObject({ error: { code: -32601 } });
    expect(await call('tools/call', { name: 'drop_table' })).toMatchObject({
      error: { code: -32602 },
    });
  });
});

describe('sécurité', () => {
  it('jeton comparé exactement', () => {
    expect(tokenMatches('Bearer abc', 'abc')).toBe(true);
    expect(tokenMatches('Bearer abd', 'abc')).toBe(false);
    expect(tokenMatches('abc', 'abc')).toBe(false);
    expect(tokenMatches(undefined, 'abc')).toBe(false);
    expect(tokenMatches('Bearer ', '')).toBe(false);
  });

  it('Host / Origin limités à la boucle locale', () => {
    expect(isLocalRequest('127.0.0.1:8067', undefined)).toBe(true);
    expect(isLocalRequest('localhost:8067', 'http://localhost:3000')).toBe(true);
    expect(isLocalRequest('evil.example:8067', undefined)).toBe(false);
    expect(isLocalRequest('127.0.0.1:8067', 'https://evil.example')).toBe(false);
  });
});

describe('McpServer (HTTP réel)', () => {
  const server = new McpServer();
  afterEach(() => server.stop());

  const post = (port: number, body: string, headers: Record<string, string>) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
        },
        res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        }
      );
      req.on('error', reject);
      req.end(body);
    });

  it('401 sans jeton, 200 avec, 403 hors boucle locale', async () => {
    const port = await server.start({ port: 0, token: 'secret', version: '1', deps });
    const ping = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect((await post(port, ping, {})).status).toBe(401);
    const ok = await post(port, ping, { Authorization: 'Bearer secret' });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(
      (await post(port, ping, { Authorization: 'Bearer secret', Origin: 'https://evil.example' }))
        .status
    ).toBe(403);
    const notif = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect((await post(port, notif, { Authorization: 'Bearer secret' })).status).toBe(202);
  });

  it('lots JSON-RPC : 20 messages au plus, traités l’un après l’autre', async () => {
    const port = await server.start({ port: 0, token: 'secret', version: '1', deps });
    const auth = { Authorization: 'Bearer secret' };
    const ping = (id: number) => ({ jsonrpc: '2.0', id, method: 'ping' });
    const ok = await post(port, JSON.stringify([ping(1), ping(2)]), auth);
    expect(JSON.parse(ok.body)).toHaveLength(2);
    const big = JSON.stringify(Array.from({ length: 21 }, (_, i) => ping(i)));
    expect((await post(port, big, auth)).status).toBe(400);
    expect((await post(port, '[]', auth)).status).toBe(400);
  });
});
