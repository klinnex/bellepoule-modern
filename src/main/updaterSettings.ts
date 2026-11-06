/**
 * BellePoule Modern - Préférences de l'updater (persistées côté main)
 * Licensed under GPL-3.0
 *
 * Fichier `<userData>/updater-settings.json`, lu au démarrage avant le premier check.
 */

import fs from 'fs';
import path from 'path';

export interface UpdaterSettings {
  /** Vérification automatique (démarrage + périodique). Le menu reste toujours disponible. */
  autoCheck: boolean;
}

const FILE = 'updater-settings.json';
const DEFAULTS: UpdaterSettings = { autoCheck: true };

export function readUpdaterSettings(userDataDir: string): UpdaterSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(userDataDir, FILE), 'utf8'));
    return {
      autoCheck: typeof raw?.autoCheck === 'boolean' ? raw.autoCheck : DEFAULTS.autoCheck,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeUpdaterSettings(userDataDir: string, settings: UpdaterSettings): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, FILE),
    JSON.stringify({ autoCheck: settings.autoCheck === true }, null, 2)
  );
}
