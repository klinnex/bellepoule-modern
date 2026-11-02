import type { BrowserWindow } from 'electron';

/**
 * Référence typée vers la fenêtre principale, partagée avec le serveur distant.
 * Remplace l'ancienne globale non typée `global.mainWindow`.
 */
let mainWindowRef: BrowserWindow | null = null;

export function setSharedMainWindow(win: BrowserWindow | null): void {
  mainWindowRef = win;
}

/** Fenêtre principale, ou null si absente / détruite. */
export function getSharedMainWindow(): BrowserWindow | null {
  return mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;
}
