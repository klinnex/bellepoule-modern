#!/usr/bin/env node
/**
 * Captures d'écran de la documentation (docs/SCREENSHOTS.md).
 *
 * Lance l'application Electron (dist/ doit être construit : npm run build) avec
 * un profil vierge, crée une compétition de démonstration puis photographie
 * chaque menu dans docs/screenshots/.
 *
 * Usage : npm run docs:screenshots
 * Linux sans écran : xvfb-run -a npm run docs:screenshots
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const VIEWPORT = { width: 1400, height: 860 };

// Tireurs fictifs de la compétition de démonstration
const FENCERS = [
  ['MARTIN', 'Lucas', 'Paris Escrime'],
  ['BERNARD', 'Emma', 'CE Lyon'],
  ['DUBOIS', 'Hugo', 'Bordeaux EC'],
  ['THOMAS', 'Léa', 'Lille Escrime'],
  ['ROBERT', 'Louis', 'Marseille CE'],
  ['RICHARD', 'Chloé', 'Paris Escrime'],
  ['PETIT', 'Jules', 'CE Lyon'],
  ['DURAND', 'Manon', 'Nantes Escrime'],
  ['LEROY', 'Gabriel', 'Bordeaux EC'],
  ['MOREAU', 'Camille', 'Toulouse EC'],
  ['SIMON', 'Arthur', 'Lille Escrime'],
  ['LAURENT', 'Inès', 'Marseille CE'],
  ['LEFEBVRE', 'Raphaël', 'Nantes Escrime'],
  ['MICHEL', 'Sarah', 'Toulouse EC'],
  ['GARCIA', 'Nathan', 'Rennes Escrime'],
  ['DAVID', 'Jade', 'Rennes Escrime'],
  ['BERTRAND', 'Tom', 'Paris Escrime'],
  ['ROUX', 'Lina', 'CE Lyon'],
];

const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-screens-'));
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${userData}`, '--lang=fr'],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
  });

  try {
    // Splash → fenêtre principale
    await app.firstWindow();
    await wait(1500);
    const splash = app.windows().find(w => w.url().includes('splash'));
    if (splash) await splash.click('text=Entrer dans BellePoule').catch(() => {});
    let win;
    for (let i = 0; i < 40 && !win; i++) {
      win = app.windows().find(w => !w.url().includes('splash'));
      if (!win) await wait(500);
    }
    if (!win) throw new Error('Fenêtre principale introuvable');
    await win.setViewportSize(VIEWPORT);
    await win.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await win.waitForTimeout(2500);

    const click = sel => win.locator(sel).first().click({ timeout: 10000 });
    const confirm = () => click('.modal-footer .btn-primary');
    const phase = label => click(`.phase-step:has-text("${label}")`);
    const shot = async name => {
      await win.waitForTimeout(1200);
      // Masque toasts et confettis
      await win.evaluate(() =>
        document
          .querySelectorAll('[role="status"][aria-live], canvas')
          .forEach(el => (el.style.display = 'none'))
      );
      await win.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log(`✓ ${name}.png`);
    };

    await shot('01-accueil');

    await click('button:has-text("Nouvelle compétition")');
    await shot('02-nouvelle-competition');
    await click('.btn-close');

    // Compétition de démonstration
    await win.evaluate(async fencers => {
      const db = window.electronAPI.db;
      const c = await db.createCompetition({
        title: 'Challenge de la Ville — Épée Senior',
        date: new Date('2026-11-14'),
        location: 'Gymnase Jean Moulin',
        weapon: 'E',
        gender: 'X',
        category: 'SEN',
        color: '#3b5bdb',
        settings: {
          defaultPoolMaxScore: 5,
          defaultTableMaxScore: 15,
          defaultPoolTimerSeconds: 180,
          defaultTableTimerSeconds: 180,
          poolRounds: 1,
          hasDirectElimination: true,
          thirdPlaceMatch: true,
          manualRanking: false,
          defaultRanking: 9999,
          randomScore: false,
          minTeamSize: 3,
        },
      });
      let i = 0;
      for (const [lastName, firstName, club] of fencers) {
        i++;
        await db.addFencer(c.id, {
          lastName,
          firstName,
          club,
          gender: i % 2 ? 'M' : 'F',
          nationality: 'FRA',
          ranking: i,
          status: 'N',
        });
      }
    }, FENCERS);
    await win.reload();
    await win.waitForTimeout(2500);

    await click('text=Ouvrir →');
    await win.waitForTimeout(1500);
    await click('text=✓ Tout pointer');
    await shot('04-appel');

    await click('button:has-text("Générer les poules")');
    await shot('05-preparation');

    await click('button:has-text("Lancer les poules")');
    await win.waitForTimeout(1500);
    const autofill = win.locator('[title="Remplir automatiquement les scores (test)"]');
    const pools = await autofill.count();
    for (let i = 0; i < pools; i++) {
      await autofill.nth(i).click();
      await confirm();
      await win.waitForTimeout(800);
    }
    await win.evaluate(() => window.scrollTo(0, 0));
    await win.locator('.phase-nav').scrollIntoViewIfNeeded();
    await shot('06-poules');

    await phase('Classement');
    await shot('07-classement');

    await click('button:has-text("Passer au tableau")');
    await win.waitForTimeout(1500);
    await click('button:has-text("Oui")');
    await win.waitForTimeout(1500);
    await click('.tableau-fab-trigger');
    await click('.tableau-fab-item:has-text("Remplir auto")');
    await confirm();
    await phase('Tableau');
    await shot('08-tableau');

    await phase('Résultats');
    await shot('09-resultats');

    await phase('Saisie distante');
    await shot('10-saisie-distante');

    await phase('Historique');
    await shot('11-historique');

    await click('[title="Actions"]');
    await shot('12-menu-actions');
    await win.keyboard.press('Escape');
    await win.mouse.click(10, VIEWPORT.height - 10);

    await click('button:has-text("Outils")');
    await shot('13-menu-outils');
    await win.keyboard.press('Escape');
    await win.mouse.click(10, VIEWPORT.height - 10);

    await click('button:has-text("Paramètres")');
    await shot('14-parametres');
    await win.keyboard.press('Escape');

    await click('button:has-text("Entraînement")');
    await shot('15-entrainement');
    await click('.modal-footer .btn-secondary, button:has-text("Annuler")');

    await win.keyboard.press('Control+k');
    await shot('16-palette-commandes');
    await win.keyboard.press('Escape');

    // Liste en fin de parcours : compteurs de tireurs à jour
    await click('button:has-text("Général")');
    await shot('03-competitions');
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
