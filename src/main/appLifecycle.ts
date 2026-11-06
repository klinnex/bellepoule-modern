/**
 * BellePoule Modern - Cycle de vie de l'application : fermeture des fenêtres et arrêt de la base.
 * Licensed under GPL-3.0
 */

export interface LifecycleDb {
  isOpen(): boolean;
  saveSync(): void;
  close(): void;
}

/** Ferme la base si elle est ouverte (checkpoint WAL puis fermeture). Idempotent. */
export function shutdownDb(db: LifecycleDb): void {
  if (!db.isOpen()) return;
  db.saveSync();
  db.close();
}

/**
 * Toutes les fenêtres fermées.
 * Sous macOS, l'application reste active (Dock) et `activate` recrée une fenêtre sur la
 * MÊME base, qui n'est jamais rouverte : la fermer ici rendrait toute écriture impossible
 * jusqu'au redémarrage (« Database not open ») — la compétition créée disparaît alors.
 * La base reste donc ouverte ; elle n'est fermée qu'au vrai arrêt (before-quit).
 */
export function handleAllWindowsClosed(
  platform: NodeJS.Platform,
  db: LifecycleDb,
  quit: () => void
): void {
  if (platform === 'darwin') {
    db.saveSync();
    return;
  }
  shutdownDb(db);
  quit();
}
