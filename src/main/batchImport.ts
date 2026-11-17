/**
 * BellePoule Modern - Import d'une journée en ligne de commande (#1880, lot 0)
 *   bellepoule-modern --batch-import journee.json [--dry-run]
 * Le manifeste a la forme des arguments de l'outil MCP `import_day` (docs/MCP.md) : même
 * logique, mêmes garanties (rejouable sans doublon). Les chemins `fencersFile` et
 * `refereesFile` peuvent être relatifs au manifeste. Rapport JSON sur la sortie standard,
 * code de sortie 0 (succès) ou 1 (échec).
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { MCP_WRITE_TOOLS, type McpWriteDeps } from './mcp/mcpWriteTools';

export interface BatchImportResult {
  exitCode: 0 | 1;
  report?: unknown;
  error?: { message: string };
}

const MAX_MANIFEST_BYTES = 1024 * 1024;

/** Chemins relatifs du manifeste résolus par rapport à son dossier */
export function resolveManifestPaths(manifest: unknown, baseDir: string): Record<string, unknown> {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Manifeste : objet JSON attendu');
  }
  const abs = (v: unknown): unknown =>
    typeof v === 'string' && v && !path.isAbsolute(v) ? path.resolve(baseDir, v) : v;
  const m = manifest as Record<string, unknown>;
  return {
    ...m,
    ...(m.refereesFile !== undefined ? { refereesFile: abs(m.refereesFile) } : {}),
    competitions: Array.isArray(m.competitions)
      ? m.competitions.map((c: unknown) =>
          c && typeof c === 'object' && 'fencersFile' in c
            ? { ...c, fencersFile: abs((c as { fencersFile: unknown }).fencersFile) }
            : c
        )
      : m.competitions,
  };
}

export async function runBatchImport(
  deps: McpWriteDeps,
  manifestPath: string,
  dryRun: boolean
): Promise<BatchImportResult> {
  try {
    const file = path.resolve(manifestPath);
    if (fs.statSync(file).size > MAX_MANIFEST_BYTES) throw new Error('Manifeste trop volumineux');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, ''));
    const importDay = MCP_WRITE_TOOLS.find(t => t.name === 'import_day')!;
    // Lancé par l'opérateur : pas de restriction aux dossiers de l'agent
    const report = await importDay.run(
      { ...deps, allowedRoots: undefined },
      { ...resolveManifestPaths(manifest, path.dirname(file)), dryRun }
    );
    return { exitCode: 0, report };
  } catch (e) {
    return { exitCode: 1, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
