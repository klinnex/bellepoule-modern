/**
 * BellePoule Modern - Types IPC « réglages système » : proxy réseau, dossiers de sauvegarde
 * Licensed under GPL-3.0
 * Extraits de preload.ts (plafond de longueur, cf. scripts/check-quality-ratchet.js).
 */

/** Proxy réseau (Paramètres → Réseau) */
export interface ProxySettingsDTO {
  mode: 'system' | 'direct' | 'manual';
  server?: string;
  bypass?: string;
}

/** Dossier de sauvegarde par défaut (Paramètres → Sauvegarde) */
export interface BackupDirDTO {
  dir: string;
  /** true : pas de réglage, dossier `<Documents>/BellePoule` */
  isDefault: boolean;
}

export interface BackupAPI {
  get: () => Promise<BackupDirDTO>;
  /** Ouvre le sélecteur de dossier natif ; annulation = dossier inchangé */
  chooseDir: () => Promise<BackupDirDTO>;
  resetDir: () => Promise<BackupDirDTO>;
  /** Dossier dédié à une compétition (sélecteur natif, sans enregistrer) ; null si annulé */
  pickCompetitionDir: () => Promise<string | null>;
}

export interface ProxyAPI {
  get: () => Promise<ProxySettingsDTO>;
  set: (
    settings: ProxySettingsDTO
  ) => Promise<{ success: boolean; settings?: ProxySettingsDTO; error?: string }>;
  /** Proxy résolu pour GitHub (« DIRECT », « PROXY hôte:port »…) + requête réelle */
  test: () => Promise<{ ok: boolean; resolved: string }>;
}
