/**
 * Plugin Claude Code « bellepoule » (#1880, lot 4) : manifestes valides, serveur MCP local
 * à jeton, et chaque outil cité par la skill ou les commandes existe vraiment.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { READ_TOOLS, WRITE_TOOLS } from './mcpServer';

const ROOT = path.join(__dirname, '..', '..', '..');
const PLUGIN = path.join(ROOT, 'plugins', 'bellepoule');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

describe('plugin bellepoule', () => {
  it('manifestes : plugin, marketplace, serveur MCP local à jeton', () => {
    expect(readJson(path.join(PLUGIN, '.claude-plugin', 'plugin.json')).name).toBe('bellepoule');
    const market = readJson(path.join(ROOT, '.claude-plugin', 'marketplace.json'));
    expect(market.plugins[0]).toMatchObject({ name: 'bellepoule', source: './plugins/bellepoule' });
    const server = readJson(path.join(PLUGIN, '.mcp.json')).mcpServers.bellepoule;
    expect(server.type).toBe('http');
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(server.url).toBe('http://127.0.0.1:${user_config.mcp_port}/mcp');
    expect(server.headers.Authorization).toBe('Bearer ${user_config.mcp_token}');
  });

  it("userConfig : jeton sensible, repli sur les variables d'environnement (#1947)", () => {
    const { userConfig } = readJson(path.join(PLUGIN, '.claude-plugin', 'plugin.json'));
    expect(userConfig.mcp_token).toMatchObject({
      type: 'string',
      sensitive: true,
      required: false,
      default: '${BELLEPOULE_MCP_TOKEN:-}',
    });
    expect(userConfig.mcp_port).toMatchObject({
      sensitive: false,
      required: false,
      default: '${BELLEPOULE_MCP_PORT:-8067}',
    });
  });

  it('commandes : description en en-tête', () => {
    for (const f of fs.readdirSync(path.join(PLUGIN, 'commands'))) {
      const text = fs.readFileSync(path.join(PLUGIN, 'commands', f), 'utf-8');
      expect(text, f).toMatch(/^---\ndescription: .+\n/);
    }
  });

  it('outils cités dans la skill et les commandes : tous publiés', () => {
    const names = new Set([...READ_TOOLS, ...WRITE_TOOLS].map(t => t.name));
    const files = [
      path.join(PLUGIN, 'skills', 'bellepoule', 'SKILL.md'),
      ...fs.readdirSync(path.join(PLUGIN, 'commands')).map(f => path.join(PLUGIN, 'commands', f)),
    ];
    const cited = new Set<string>();
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf-8').matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
        cited.add(m[1]);
      }
    }
    // Codes d'erreur et valeurs citées entre accents graves, pas des outils
    const notTools = new Set([
      'pools_have_scores',
      'score_above_max',
      'unsupported_format',
      'token_unreadable',
    ]);
    const unknown = [...cited].filter(n => !names.has(n) && !notTools.has(n));
    expect(unknown).toEqual([]);
    expect(cited.size).toBeGreaterThan(15);
  });
});
