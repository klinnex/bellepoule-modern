/**
 * BellePoule Modern - Arguments de ligne de commande du process main (#1880, lot 0)
 * Licensed under GPL-3.0
 */

export interface CliOptions {
  /** Process main sans fenêtre : base, autosave et serveurs, sans écran */
  headless: boolean;
  /** Import d'une journée par manifeste JSON, puis arrêt (implique --headless) */
  batchImport: string | null;
  /** Avec --batch-import : rapport seul, rien n'est écrit */
  dryRun: boolean;
  /**
   * Serveur MCP activé pour cette exécution, sans passer par l'écran ni modifier le réglage
   * enregistré (#1880). `--mcp-port=N` : port de cette exécution (implique --mcp).
   */
  mcp: boolean;
  mcpPort: number | null;
  /** Avec --mcp : outils d'écriture autorisés pour cette exécution */
  mcpWrite: boolean;
  /** Affiche la configuration du client MCP (URL et jeton) puis s'arrête (implique --headless) */
  mcpPrintConfig: boolean;
  /** Régénère le jeton MCP avant de l'afficher (implique --mcp-print-config) */
  mcpNewToken: boolean;
}

/** Valeur d'une option : `--opt=valeur` ou `--opt valeur` */
function optionValue(argv: readonly string[], name: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1) || null;
    if (arg === name) {
      const next = argv[i + 1];
      return next && !next.startsWith('--') ? next : null;
    }
  }
  return null;
}

/** Lit argv (et BELLEPOULE_HEADLESS=1) ; arguments inconnus ignorés (Chromium en ajoute) */
export function parseCliArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {}
): CliOptions {
  const batchImport = optionValue(argv, '--batch-import');
  const mcpNewToken = argv.includes('--mcp-new-token');
  const mcpPrintConfig = argv.includes('--mcp-print-config') || mcpNewToken;
  const port = Number(optionValue(argv, '--mcp-port'));
  const mcpPort = Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
  return {
    headless:
      argv.includes('--headless') ||
      env.BELLEPOULE_HEADLESS === '1' ||
      !!batchImport ||
      mcpPrintConfig,
    batchImport,
    dryRun: argv.includes('--dry-run'),
    mcp: argv.includes('--mcp') || mcpPort !== null,
    mcpPort,
    mcpWrite: argv.includes('--mcp-write'),
    mcpPrintConfig,
    mcpNewToken,
  };
}
