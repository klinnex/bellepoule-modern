import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './cliArgs';

describe('parseCliArgs', () => {
  it('sans option : mode fenêtré', () => {
    expect(parseCliArgs(['electron', '.'])).toEqual({
      headless: false,
      batchImport: null,
      dryRun: false,
      mcp: false,
      mcpPort: null,
      mcpWrite: false,
      mcpPrintConfig: false,
      mcpNewToken: false,
    });
  });

  it('--headless', () => {
    expect(parseCliArgs(['electron', '.', '--headless']).headless).toBe(true);
  });

  it('BELLEPOULE_HEADLESS=1', () => {
    expect(parseCliArgs(['electron', '.'], { BELLEPOULE_HEADLESS: '1' }).headless).toBe(true);
  });

  it('arguments inconnus ignorés', () => {
    expect(parseCliArgs(['app', '--no-sandbox', '--headlessly']).headless).toBe(false);
  });

  it('--batch-import <manifeste> implique --headless', () => {
    const o = parseCliArgs(['app', '--batch-import', '/tmp/j.json', '--dry-run']);
    expect(o).toMatchObject({ headless: true, batchImport: '/tmp/j.json', dryRun: true });
  });

  it('--batch-import=<manifeste>', () => {
    expect(parseCliArgs(['app', '--batch-import=/tmp/j.json']).batchImport).toBe('/tmp/j.json');
  });

  it('--mcp : serveur MCP activé pour cette exécution, port facultatif', () => {
    expect(parseCliArgs(['app', '--headless', '--mcp'])).toMatchObject({
      headless: true,
      mcp: true,
      mcpPort: null,
    });
    expect(parseCliArgs(['app', '--mcp-port=18067'])).toMatchObject({ mcp: true, mcpPort: 18067 });
    // Port hors bornes : ignoré, le MCP n'est pas activé par cette seule option
    expect(parseCliArgs(['app', '--mcp-port=80'])).toMatchObject({ mcp: false, mcpPort: null });
    expect(parseCliArgs(['app', '--mcpx']).mcp).toBe(false);
    expect(parseCliArgs(['app', '--mcp', '--mcp-write']).mcpWrite).toBe(true);
  });

  it('--mcp-print-config implique --headless', () => {
    expect(parseCliArgs(['app', '--mcp-print-config'])).toMatchObject({
      headless: true,
      mcpPrintConfig: true,
      mcp: false,
    });
  });

  it('--mcp-new-token : régénère puis affiche la configuration', () => {
    expect(parseCliArgs(['app', '--mcp-new-token'])).toMatchObject({
      headless: true,
      mcpPrintConfig: true,
      mcpNewToken: true,
    });
  });

  it('--batch-import sans valeur : ignoré', () => {
    expect(parseCliArgs(['app', '--batch-import', '--headless']).batchImport).toBeNull();
  });
});
