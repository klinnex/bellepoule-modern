/**
 * docs/MCP.md : référence des outils à jour avec leurs schémas (#1880).
 * Régénération : `npm run docs:mcp` (UPDATE_MCP_DOC=1).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DOC_BEGIN, withToolReference } from './mcpDoc';
import { READ_TOOLS, WRITE_TOOLS } from './mcpServer';

const DOC = path.join(__dirname, '..', '..', '..', 'docs', 'MCP.md');

describe('docs/MCP.md', () => {
  it('chaque outil : titre, description, schéma objet, nom unique', () => {
    const all = [...READ_TOOLS, ...WRITE_TOOLS];
    expect(new Set(all.map(t => t.name)).size).toBe(all.length);
    for (const t of all) {
      expect(t.title && t.description, t.name).toBeTruthy();
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('référence des outils générée depuis les schémas (npm run docs:mcp)', () => {
    const current = fs.readFileSync(DOC, 'utf-8');
    const expected = withToolReference(current);
    if (process.env.UPDATE_MCP_DOC === '1') fs.writeFileSync(DOC, expected, 'utf-8');
    expect(fs.readFileSync(DOC, 'utf-8')).toContain(DOC_BEGIN);
    expect(fs.readFileSync(DOC, 'utf-8')).toBe(expected);
  });
});
