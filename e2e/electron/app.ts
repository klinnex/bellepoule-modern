/**
 * BellePoule Modern - E2E sur l'application Electron réelle (#2045)
 * Les parcours qui écrivent en base (créer, supprimer une épreuve, poules, scores) ne
 * peuvent pas tourner dans le navigateur : sans process principal, window.electronAPI
 * n'existe pas. Chaque test lance l'application construite (dist/) avec un profil
 * vierge (--user-data-dir temporaire) : la vraie base de l'utilisateur n'est jamais ouverte.
 *
 * Prérequis : npm run build (fait par « pretest:e2e ») ; sous Linux sans écran,
 * lancer sous xvfb-run (xvfb-run -a npm run test:e2e).
 */
import {
  test as base,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const MAIN = path.join(ROOT, 'dist/main/main.js');

export const test = base.extend<{ app: ElectronApplication; win: Page }>({
  // Playwright exige une déstructuration en premier paramètre d'une fixture
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, provide, testInfo) => {
    testInfo.skip(!fs.existsSync(MAIN), 'Application non construite : npm run build');
    testInfo.skip(
      process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY,
      'Pas d’écran : lancer sous xvfb-run -a'
    );
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-e2e-'));
    const env = { ...process.env } as Record<string, string>;
    // Une session qui exporte ELECTRON_RUN_AS_NODE ferait tourner Electron comme Node
    delete env.ELECTRON_RUN_AS_NODE;
    // CI (runner Ubuntu) : le bac à sable de Chromium exige des espaces de noms non accordés
    const sandbox = process.env.CI ? ['--no-sandbox'] : [];
    const app = await _electron.launch({
      args: [ROOT, `--user-data-dir=${userData}`, ...sandbox],
      env,
    });
    await provide(app);
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  },

  win: async ({ app }, provide) => {
    const win = await mainWindow(app);
    // Parcours guidé terminé : son panneau masquerait des boutons
    await win.evaluate(() => localStorage.setItem('bellepoule-guided-tour', 'done'));
    await win.reload();
    await win.waitForLoadState('domcontentloaded');
    await provide(win);
  },
});

/** Fenêtre principale (URL du renderer), après validation de l'écran de démarrage */
async function mainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      if (/splash/.test(w.url())) {
        const ok = w.locator('#confirm-btn');
        if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
      }
      if (/renderer/.test(w.url())) {
        await w.waitForLoadState('domcontentloaded');
        return w;
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Fenêtre principale introuvable');
}

/** Crée une épreuve depuis l'accueil ; l'onglet de l'épreuve s'ouvre */
export async function createCompetition(win: Page, title: string): Promise<void> {
  await win
    .getByRole('button', { name: /nouvelle comp[eé]tition/i })
    .first()
    .click();
  await win.getByLabel('Titre').fill(title);
  await win.getByRole('button', { name: /cr[eé]er la comp[eé]tition/i }).click();
  await expect(win.getByRole('heading', { name: 'Appel' })).toBeVisible();
}

/** Ajoute des tireurs (clubs alternés) depuis l'appel, puis ferme la fenêtre */
export async function addFencers(win: Page, count: number): Promise<void> {
  await win
    .getByRole('button', { name: /ajouter un tireur/i })
    .last()
    .click();
  for (let i = 0; i < count; i++) {
    await win.getByPlaceholder('DUPONT').fill(`TIREUR${i}`);
    await win.getByPlaceholder('Jean').fill(`P${i}`);
    await win.getByPlaceholder('PARIS USM').fill(`CLUB ${'ABC'[i % 3]}`);
    await win.getByRole('button', { name: /^Ajouter$/ }).click();
    await expect(win.getByText(`TIREUR${i}`, { exact: true })).toBeVisible();
  }
  await win.keyboard.press('Escape');
  await expect(win.getByRole('button', { name: /^Ajouter et fermer$/ })).toBeHidden();
}

export { expect };
