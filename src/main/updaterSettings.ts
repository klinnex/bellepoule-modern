/**
 * BellePoule Modern - Préférences de l'updater (persistées côté main)
 * Licensed under GPL-3.0
 *
 * Fichier `<userData>/updater-settings.json`, lu au démarrage avant le premier check.
 */

import fs from 'fs';
import path from 'path';

export type UpdateChannel = 'stable' | 'dev';

export interface UpdaterSettings {
  /** Vérification automatique (démarrage + périodique). Le menu reste toujours disponible. */
  autoCheck: boolean;
  /** Canal choisi par l'utilisateur ; absent = canal figé au packaging (version.json) */
  channel?: UpdateChannel;
}

const isChannel = (v: unknown): v is UpdateChannel => v === 'stable' || v === 'dev';

/** Canal effectif : choix utilisateur, sinon canal du paquet (dev par défaut hors stable). */
export function resolveChannel(
  settings: UpdaterSettings,
  packaged: string | undefined
): UpdateChannel {
  if (settings.channel) return settings.channel;
  return packaged === 'stable' ? 'stable' : 'dev';
}

const FILE = 'updater-settings.json';
const DEFAULTS: UpdaterSettings = { autoCheck: true };

export function readUpdaterSettings(userDataDir: string): UpdaterSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(userDataDir, FILE), 'utf8'));
    return {
      autoCheck: typeof raw?.autoCheck === 'boolean' ? raw.autoCheck : DEFAULTS.autoCheck,
      ...(isChannel(raw?.channel) ? { channel: raw.channel } : {}),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeUpdaterSettings(userDataDir: string, settings: UpdaterSettings): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, FILE),
    JSON.stringify(
      {
        autoCheck: settings.autoCheck === true,
        ...(isChannel(settings.channel) ? { channel: settings.channel } : {}),
      },
      null,
      2
    )
  );
}
