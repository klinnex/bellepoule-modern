#!/usr/bin/env node
/**
 * Régénère la référence des outils MCP dans docs/MCP.md depuis leurs schémas (#1880).
 *
 *   node scripts/generate-mcp-doc.js          → réécrit la section générée de docs/MCP.md
 *   node scripts/generate-mcp-doc.js --check  → échoue (exit 1) si elle n'est plus à jour
 *
 * Les schémas sont en TypeScript (src/main/mcp/*Tools.ts) : le rendu passe par le test
 * src/main/mcp/mcpDoc.test.ts, qui écrit le fichier quand UPDATE_MCP_DOC=1. Le contrôle
 * tourne aussi dans `npm run test:run` (CI).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const check = process.argv.includes('--check');
const vitest = path.join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [vitest, 'run', 'src/main/mcp/mcpDoc.test.ts'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, UPDATE_MCP_DOC: check ? '' : '1' },
});
process.exit(result.status ?? 1);
