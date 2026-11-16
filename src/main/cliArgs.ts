/**
 * BellePoule Modern - Arguments de ligne de commande du process main (#1880, lot 0)
 * Licensed under GPL-3.0
 */

export interface CliOptions {
  /** Process main sans fenêtre : base, autosave et serveurs, sans écran */
  headless: boolean;
}

/** Lit argv (et BELLEPOULE_HEADLESS=1) ; arguments inconnus ignorés (Chromium en ajoute) */
export function parseCliArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {}
): CliOptions {
  return {
    headless: argv.includes('--headless') || env.BELLEPOULE_HEADLESS === '1',
  };
}
