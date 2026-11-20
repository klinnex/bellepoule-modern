/**
 * BellePoule Modern - API préload OPP2 (#1960) : broker MQTT intégré, pistes OPP2.
 * Licensed under GPL-3.0
 */

/** Piste OPP2 (#1960) : identifiant de piste des sujets MQTT, arène, mode */
export interface Opp2PisteConfigDTO {
  piste: string;
  arena?: number;
  mode?: 'master' | 'display' | 'manual';
}

export interface Opp2StatusDTO {
  running: boolean;
  port: number;
  /** Clients MQTT connectés au broker intégré */
  clients: number;
  /** Pistes vues sur le broker sans être déclarées */
  unknownPistes: string[];
  pistes: (Opp2PisteConfigDTO & {
    mode: 'master' | 'display' | 'manual';
    status: 'online' | 'stale' | 'offline' | 'never';
    device?: string;
    firmware?: string;
    lastSeen: number | null;
    alert: unknown;
  })[];
}

/** Appareils de piste OPP2 (JSON sur MQTT), broker intégré (#1960) */
export interface Opp2API {
  start: (options?: {
    port?: number;
  }) => Promise<{ success: boolean; port?: number; error?: string }>;
  stop: () => Promise<void>;
  isRunning: () => Promise<boolean>;
  setPistes: (pistes: Opp2PisteConfigDTO[]) => Promise<void>;
  getStatus: () => Promise<Opp2StatusDTO>;
}
