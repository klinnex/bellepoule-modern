/**
 * BellePoule Modern - Mode Club (#1872) : paramètres de la saisie distante du club
 * (serveur du mode entraînement) : interface, port, HTTPS, thème des écrans.
 * Mémorisés par poste ; le mot de passe des pistes reste en mémoire, jamais stocké.
 * Licensed under GPL-3.0
 */
import { isTrainingTheme, type TrainingTheme } from '../../../shared/utils/trainingThemes';

/** Identifiant du serveur d'entraînement côté main (TRAINING_ID, ipc/trainingHandlers.ts) */
export const TRAINING_SERVER_ID = '__training__';
export const ALL_INTERFACES = '0.0.0.0';
export const DEFAULT_REMOTE_PORT = 8066;
/** Longueur minimale d'un mot de passe de piste (PASSWORD_MIN_LENGTH, remote/network.ts) */
export const ARENA_PASSWORD_MIN = 8;

export interface ClubRemoteSettings {
  iface: string;
  port: number;
  https: boolean;
  theme: TrainingTheme;
}

/** Interface réseau mémorisée (partagée avec le mode entraînement) */
const INTERFACE_KEY = 'bellepoule-training-interface';
const SETTINGS_KEY = 'bellepoule-club-remote';

export const DEFAULT_CLUB_REMOTE: ClubRemoteSettings = {
  iface: ALL_INTERFACES,
  port: DEFAULT_REMOTE_PORT,
  https: true,
  theme: 'dark',
};

export const isValidPort = (p: unknown): p is number =>
  typeof p === 'number' && Number.isInteger(p) && p >= 1 && p <= 65535;

export const isValidArenaPassword = (pwd: string): boolean =>
  pwd === '' || pwd.length >= ARENA_PASSWORD_MIN;

export function parseClubRemoteSettings(raw: unknown, iface?: string | null): ClubRemoteSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    iface: typeof iface === 'string' && iface ? iface : DEFAULT_CLUB_REMOTE.iface,
    port: isValidPort(o.port) ? o.port : DEFAULT_CLUB_REMOTE.port,
    https: typeof o.https === 'boolean' ? o.https : DEFAULT_CLUB_REMOTE.https,
    theme: isTrainingTheme(o.theme) ? o.theme : DEFAULT_CLUB_REMOTE.theme,
  };
}

export function loadClubRemoteSettings(): ClubRemoteSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return parseClubRemoteSettings(
      raw ? JSON.parse(raw) : null,
      localStorage.getItem(INTERFACE_KEY)
    );
  } catch {
    return { ...DEFAULT_CLUB_REMOTE };
  }
}

export function saveClubRemoteSettings(s: ClubRemoteSettings): void {
  try {
    localStorage.setItem(INTERFACE_KEY, s.iface);
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ port: s.port, https: s.https, theme: s.theme })
    );
  } catch {
    /* stockage indisponible */
  }
}

/** Réglages réseau modifiés : il faut redémarrer la saisie distante pour les appliquer */
export const networkChanged = (a: ClubRemoteSettings, b: ClubRemoteSettings): boolean =>
  a.iface !== b.iface || a.port !== b.port || a.https !== b.https;
