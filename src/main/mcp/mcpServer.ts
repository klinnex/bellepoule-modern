/**
 * BellePoule Modern - Serveur MCP intégré (#1880, lot 1)
 * Transport « Streamable HTTP » (réponses JSON) sur 127.0.0.1 uniquement, jeton Bearer
 * obligatoire, contrôle Host / Origin contre le DNS rebinding. Désactivé par défaut.
 * Méthodes : initialize, ping, tools/list, tools/call (outils en lecture, mcpTools.ts).
 * Licensed under GPL-3.0
 */

import * as http from 'http';
import { timingSafeEqual } from 'crypto';
import { MCP_TOOLS, McpToolError, type McpTool } from './mcpTools';
import { MCP_WRITE_TOOLS, type McpWriteDeps, type McpWriteTool } from './mcpWriteTools';
import { MCP_SPORT_READ_TOOLS, MCP_SPORT_TOOLS } from './mcpSportTools';
import { MCP_ADMIN_READ_TOOLS, MCP_ADMIN_TOOLS } from './mcpAdminTools';
import { MCP_CLUB_READ_TOOLS, MCP_CLUB_TOOLS } from './mcpClubTools';
import { CONTRACT_MCP_TOOLS } from '../engine/api/mcpAdapter';
import { logger, LogCategory } from '../../shared/services/logger';
import type { McpLogEntry } from '../../shared/types/mcp';

export type { McpLogEntry };

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 1_000_000;
const MAX_BATCH = 20;

/** Outils en lecture : lot 1, matchs (lot 3), paramétrage du poste, séances du club */
export const READ_TOOLS: McpTool[] = [
  ...MCP_TOOLS,
  ...MCP_SPORT_READ_TOOLS,
  ...MCP_ADMIN_READ_TOOLS,
  ...MCP_CLUB_READ_TOOLS,
  ...CONTRACT_MCP_TOOLS.read,
];
/** Outils d'écriture (sur autorisation) : lot 2, compléments, orchestration sportive (lot 3) */
export const WRITE_TOOLS: McpWriteTool[] = [
  ...MCP_WRITE_TOOLS,
  ...MCP_ADMIN_TOOLS,
  ...MCP_SPORT_TOOLS,
  ...MCP_CLUB_TOOLS,
  ...CONTRACT_MCP_TOOLS.write,
];
const LOG_MAX = 200;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const rpcError = (id: JsonRpcRequest['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

/** Comparaison du jeton à temps constant */
export function tokenMatches(header: string | undefined, token: string): boolean {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  if (!m || !token) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Host et Origin limités à la boucle locale (protection contre le DNS rebinding) */
export function isLocalRequest(host: string | undefined, origin: string | undefined): boolean {
  const hostOk = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host ?? '');
  const originOk = !origin || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin);
  return hostOk && originOk;
}

/** Traite un message JSON-RPC ; `null` pour une notification (pas de réponse) */
export async function handleMcpMessage(
  msg: JsonRpcRequest,
  deps: McpWriteDeps,
  version: string,
  log?: (e: McpLogEntry) => void,
  /** Outils d'écriture proposés (Paramètres → « Autoriser l'écriture », lot 2) */
  allowWrite = false
): Promise<object | null> {
  const tools = [...READ_TOOLS, ...(allowWrite ? WRITE_TOOLS : [])];
  const started = Date.now();
  const isNotification = msg.id === undefined;
  const method = typeof msg.method === 'string' ? msg.method : '';
  const done = (ok: boolean, tool?: string) =>
    log?.({ at: new Date().toISOString(), method, tool, ok, ms: Date.now() - started });

  if (msg.jsonrpc !== '2.0' || !method) {
    return isNotification ? null : rpcError(msg.id, -32600, 'Invalid Request');
  }
  if (isNotification) return null; // notifications/initialized, notifications/cancelled…

  switch (method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      done(true);
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'bellepoule-modern', title: 'BellePoule Modern', version },
          instructions:
            'Base BellePoule Modern du poste DT : épreuves, tireurs, poules, tableau, arbitres, ' +
            'journée multi-épreuves, pistes, serveur distant, appareils Cyrano. Commencer par ' +
            'list_competitions ou day_overview.' +
            (allowWrite
              ? ' Écriture autorisée (import_day, create_competition, import_fencers, check_in, ' +
                'generate_pools, record_score, build_bracket…) : utiliser dryRun: true puis ' +
                'confirmer avec le DT avant d’écrire.'
              : ''),
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    case 'tools/list':
      done(true);
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations,
          })),
        },
      };
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        if (WRITE_TOOLS.some(t => t.name === name)) {
          done(false, name);
          return rpcError(msg.id, -32602, `Écriture désactivée dans BellePoule Modern : ${name}`);
        }
        done(false, name);
        return rpcError(msg.id, -32602, `Outil inconnu : ${name}`);
      }
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await (tool.run as (d: McpWriteDeps, a: Record<string, unknown>) => unknown)(
          deps,
          args && typeof args === 'object' ? args : {}
        );
        done(true, name);
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: { result: data },
          },
        };
      } catch (e) {
        done(false, name);
        const text = e instanceof McpToolError ? e.message : 'Erreur interne';
        if (!(e instanceof McpToolError)) {
          logger.error(LogCategory.SYSTEM, `[MCP] ${name}`, e instanceof Error ? e : undefined);
        }
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text }], isError: true },
        };
      }
    }
    default:
      done(false);
      return rpcError(msg.id, -32601, `Méthode inconnue : ${method}`);
  }
}

export interface McpServerOptions {
  port: number;
  token: string;
  version: string;
  deps: McpWriteDeps;
  allowWrite?: boolean;
}

export class McpServer {
  private server: http.Server | null = null;
  private readonly logEntries: McpLogEntry[] = [];
  port = 0;

  getLog(): McpLogEntry[] {
    return [...this.logEntries];
  }

  get running(): boolean {
    return this.server !== null;
  }

  async start({
    port,
    token,
    version,
    deps,
    allowWrite = false,
  }: McpServerOptions): Promise<number> {
    await this.stop();
    const log = (e: McpLogEntry) => {
      this.logEntries.push(e);
      if (this.logEntries.length > LOG_MAX) this.logEntries.shift();
    };
    const server = http.createServer((req, res) => {
      const send = (status: number, body?: object) => {
        res.writeHead(status, body ? { 'Content-Type': 'application/json' } : {});
        res.end(body ? JSON.stringify(body) : undefined);
      };
      if (!isLocalRequest(req.headers.host, req.headers.origin)) return send(403);
      if ((req.url ?? '').split('?')[0] !== '/mcp') return send(404);
      if (!tokenMatches(req.headers.authorization, token)) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        return send(401, rpcError(null, -32001, 'Jeton invalide'));
      }
      if (req.method === 'DELETE') return send(204);
      if (req.method !== 'POST') return send(405);
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) req.destroy();
        else chunks.push(c);
      });
      req.on('end', () => {
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, rpcError(null, -32700, 'Parse error'));
        }
        const messages = (Array.isArray(body) ? body : [body]) as JsonRpcRequest[];
        // Lots (retirés de la spécification MCP depuis 2025-06-18) : bornés et traités l'un
        // après l'autre, pour qu'un seul envoi ne lance pas des milliers d'imports à la fois
        if (messages.length === 0 || messages.length > MAX_BATCH) {
          return send(400, rpcError(null, -32600, `Lot JSON-RPC : 1 à ${MAX_BATCH} messages`));
        }
        void (async () => {
          const replies: object[] = [];
          for (const m of messages) {
            const r = await handleMcpMessage(m ?? {}, deps, version, log, allowWrite);
            if (r !== null) replies.push(r);
          }
          if (replies.length === 0) return send(202);
          send(200, Array.isArray(body) ? replies : replies[0]);
        })();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });
    this.server = server;
    const addr = server.address();
    this.port = typeof addr === 'object' && addr ? addr.port : port;
    logger.info(LogCategory.SYSTEM, `[MCP] Serveur sur http://127.0.0.1:${this.port}/mcp`);
    return this.port;
  }

  async stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>(resolve => s.close(() => resolve()));
  }
}
