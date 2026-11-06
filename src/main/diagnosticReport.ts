/**
 * BellePoule Modern - Rapport de diagnostic (fichier JSON, sans port réseau) (#1326)
 * Liste blanche de champs techniques : aucun nom de tireur, mot de passe, jeton ni chemin de données.
 * Licensed under GPL-3.0
 */

export interface DiagnosticInput {
  appVersion: string;
  build: number;
  channel: string;
  platform: string;
  arch: string;
  osRelease: string;
  locale: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  uptimeSeconds: number;
  memoryRssMb: number;
  activeRemoteServers: number;
  generatedAt: Date;
}

export interface DiagnosticReport {
  schemaVersion: 1;
  generatedAt: string;
  app: { version: string; build: number; channel: string };
  system: { platform: string; arch: string; osRelease: string; locale: string };
  runtime: {
    electron: string;
    chrome: string;
    node: string;
    uptimeSeconds: number;
    memoryRssMb: number;
    activeRemoteServers: number;
  };
}

/** Ne copie que les champs listés : toute donnée ajoutée plus tard reste hors du rapport tant qu'on ne la liste pas */
export function buildDiagnosticReport(input: DiagnosticInput): DiagnosticReport {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt.toISOString(),
    app: { version: input.appVersion, build: input.build, channel: input.channel },
    system: {
      platform: input.platform,
      arch: input.arch,
      osRelease: input.osRelease,
      locale: input.locale,
    },
    runtime: {
      electron: input.electronVersion,
      chrome: input.chromeVersion,
      node: input.nodeVersion,
      uptimeSeconds: input.uptimeSeconds,
      memoryRssMb: input.memoryRssMb,
      activeRemoteServers: input.activeRemoteServers,
    },
  };
}

/** Nom de fichier sûr, horodaté à la seconde : bellepoule-diagnostic-20261030T192800.json */
export function diagnosticFileName(generatedAt: string): string {
  const stamp = generatedAt.replace(/\.\d{3}Z$/, '').replace(/[-:]/g, '');
  return `bellepoule-diagnostic-${stamp}.json`;
}
