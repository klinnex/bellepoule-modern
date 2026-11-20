/** Types d'entraînement partagés entre le process principal et le renderer (extraits de preload.ts, plafond 1500 lignes) */

export interface TrainingCustomRules {
  matchDurationSeconds: number;
  allowedZones: string[];
  disableSuddenDeath: boolean;
  /** Mode démo : matchs aléatoires joués automatiquement */
  demo?: boolean;
}

export interface TrainingMatchRecord {
  id: string;
  arenaId: string;
  arenaNumber: number;
  weapon: string;
  scoreA: number;
  scoreB: number;
  durationSec: number;
  finishedAt: string;
}

/** Coordonnées du serveur d'entraînement renvoyées au renderer */
export interface TrainingServerInfo {
  url: string;
  ip: string;
  port: number;
  useHttps: boolean;
  certFingerprint?: string;
}
