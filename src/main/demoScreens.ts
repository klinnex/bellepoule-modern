/**
 * BellePoule Modern - Démo autonome : fenêtres d'écrans distants (arènes, tablette arbitre, kiosque)
 * ouvertes sur le serveur d'entraînement en mode démo. L'arbitre virtuel (remote/demoMode.ts)
 * joue les matchs ; ces fenêtres montrent donc la saisie distante en action, sans tablette.
 * Licensed under GPL-3.0
 */
import { BrowserWindow, screen } from 'electron';
import { demoScreens, tileLayout } from './demoScreensLayout';

/** Partition dédiée : pas d'en-têtes CSP de la fenêtre principale (pages servies avec nonce). */
export const DEMO_PARTITION = 'demo-screens';

const openWindows = new Set<BrowserWindow>();

/** Ouvre (ou rouvre) les écrans de la démo ; renvoie le nombre de fenêtres ouvertes. */
export function openDemoScreens(serverUrl: string, strips: number): number {
  closeDemoScreens();
  const origin = new URL(serverUrl).origin;
  const screens = demoScreens(serverUrl, strips);
  const bounds = tileLayout(screens.length, screen.getPrimaryDisplay().workArea);
  screens.forEach((s, i) => {
    const win = new BrowserWindow({
      ...bounds[i],
      title: `BellePoule — ${s.title}`,
      autoHideMenuBar: true,
      webPreferences: {
        partition: DEMO_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.on('page-title-updated', e => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Navigation limitée au serveur de démo (connexion arbitre, retours internes)
    win.webContents.on('will-navigate', (e, url) => {
      try {
        if (new URL(url).origin !== origin) e.preventDefault();
      } catch {
        e.preventDefault();
      }
    });
    win.on('closed', () => openWindows.delete(win));
    openWindows.add(win);
    void win.loadURL(s.url);
  });
  return screens.length;
}

export function closeDemoScreens(): void {
  for (const win of openWindows) {
    if (!win.isDestroyed()) win.close();
  }
  openWindows.clear();
}
