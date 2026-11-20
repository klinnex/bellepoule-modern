#!/usr/bin/env node
/**
 * Captures de vérification i18n (#1543) : dix langues × écrans clés, fenêtre à la
 * taille minimale (1024×768), contrôle automatique des débordements.
 *
 * Lance l'application Electron (dist/ construit : npm run build) avec un profil
 * vierge, prépare une compétition de démonstration (appel, poules remplies,
 * tableau rempli) puis, pour chaque langue, recharge l'interface et photographie
 * l'accueil, la modale « nouvelle compétition », chaque phase, le menu Outils et
 * les paramètres.
 *
 * Sorties (dossier test-results/i18n-captures, ou celui passé en argument) :
 *   <langue>/<écran>.png  et  report.json (débordements relevés par écran).
 * Code de sortie 1 si un débordement est relevé.
 *
 * Usage : npm run check:i18n-visual [-- --pseudo] [-- --lang=de,ru] [-- <dossier>]
 * Linux sans écran : xvfb-run -a npm run check:i18n-visual
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const PSEUDO = args.includes('--pseudo');
const langArg = args.find(a => a.startsWith('--lang='));
const OUT = path.resolve(
  args.find(a => !a.startsWith('--')) ||
    path.join(ROOT, 'test-results', PSEUDO ? 'i18n-captures-pseudo' : 'i18n-captures')
);
const VIEWPORT = { width: 1024, height: 768 };
const LANGUAGES = langArg
  ? langArg.slice('--lang='.length).split(',')
  : ['fr', 'en', 'de', 'ru', 'br', 'ca', 'es', 'it', 'pt', 'zh-HK'];

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
];

const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * Débordements visibles : défilement horizontal de la page, texte rogné sans
 * ellipse ni infobulle, élément interactif ou de modale qui sort de la fenêtre.
 * Exécuté dans la page.
 */
function detectOverflow() {
  const issues = [];
  const label = el =>
    (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName)
      .toString()
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60);
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  // Conteneur à défilement horizontal voulu (onglets, tableaux larges) : non signalé.
  const inScroller = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      // Barre de défilement masquée : le contenu hors champ est introuvable, donc signalé.
      if (cs.scrollbarWidth === 'none') continue;
      const ox = cs.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };

  const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (page > 1) issues.push({ kind: 'page-scroll', text: `+${page}px` });

  document
    .querySelectorAll('button, a, .btn, .tab, th, label, .phase-step-label, .comp-pill')
    .forEach(el => {
      if (!visible(el)) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      if (!(el.textContent || '').trim()) return; // bouton icône : rien à lire
      const cs = getComputedStyle(el);
      const clipped = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      if (!clipped) {
        // Texte qui déborde de sa boîte sans être coupé : chevauchement visible.
        if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 4 && !inScroller(el))
          issues.push({ kind: 'text-overlap', text: label(el) });
        return;
      }
      const hint = el.title || el.getAttribute('aria-label') || el.closest('[title]');
      if (cs.textOverflow !== 'ellipsis' || !hint)
        issues.push({ kind: 'clipped', text: label(el) });
    });

  // Élément visible qui sort de la fenêtre (modale, bouton, bulle d'aide, menu).
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || inScroller(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right <= window.innerWidth + 1 || r.left >= window.innerWidth) return;
    // Seul l'élément le plus haut est signalé, pas toute sa descendance.
    const parent = el.parentElement;
    if (
      parent &&
      parent !== document.body &&
      parent.getBoundingClientRect().right > window.innerWidth + 1
    )
      return;
    // Rogné par un ancêtre (overflow hidden) : invisible au-delà du bord, pas un débordement.
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' && p.getBoundingClientRect().right <= window.innerWidth + 1)
        return;
    }
    issues.push({ kind: 'off-screen', text: label(el) });
  });

  // Mot coupé en plusieurs lignes (bouton écrasé : « Gé/né/ral »).
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const host = node.parentElement;
    if (!host || !visible(host) || host.closest('script, style, svg, kbd, textarea')) continue;
    const text = node.textContent || '';
    const re = /[^\s\u00a0/—–…-]{2,}/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      // Écritures sans espaces (chinois) : la coupure entre idéogrammes est normale.
      if (/[\u3000-\u9fff\uf900-\ufaff]/.test(m[0])) continue;
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const tops = new Set(Array.from(range.getClientRects(), r => Math.round(r.top)));
      if (tops.size > 1) {
        issues.push({ kind: 'broken-word', text: `${m[0]} (${label(host)})` });
        break;
      }
    }
  }

  // Doublons (élément parent + enfant) : une seule entrée par libellé.
  const seen = new Set();
  return issues.filter(i => {
    const k = `${i.kind}|${i.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-i18n-'));
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${userData}`, '--lang=fr'],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  const report = { viewport: VIEWPORT, pseudo: PSEUDO, languages: {} };
  let total = 0;

  try {
    await app.firstWindow();
    await wait(1500);
    const splash = app.windows().find(w => w.url().includes('splash'));
    if (splash) await splash.click('#confirm-btn').catch(() => {});
    let win;
    for (let i = 0; i < 40 && !win; i++) {
      win = app.windows().find(w => !w.url().includes('splash'));
      if (!win) await wait(500);
    }
    if (!win) throw new Error('Fenêtre principale introuvable');
    win.on('pageerror', e => console.error('[pageerror]', e.message));
    win.on(
      'console',
      m => m.type() === 'error' && console.error('[console]', m.text().slice(0, 300))
    );
    await win.setViewportSize(VIEWPORT);
    await win.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await win.evaluate(() => {
      localStorage.setItem('bellepoule-language', 'fr');
      localStorage.setItem('bellepoule-onboarding-done', '1');
      localStorage.removeItem('bellepoule-pseudo-locale');
    });
    await win.reload();
    await win.waitForTimeout(2500);

    const click = sel => win.locator(sel).first().click({ timeout: 10000 });
    const confirm = () => click('.modal-footer .btn-primary');
    const phase = n => click(`.phase-step >> nth=${n}`);
    const closeOverlays = async () => {
      await win.keyboard.press('Escape');
      await win.mouse.click(5, VIEWPORT.height - 5);
      await win.waitForTimeout(300);
    };

    // ── Compétition de démonstration (préparée en français) ──
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
    await click('.competition-card');
    await win.waitForTimeout(1500);
    await click('text=Tout pointer');
    await click('button:has-text("Préparer les poules")');
    await click('button:has-text("Lancer les poules")');
    await win.waitForTimeout(1500);
    const autofill = win.locator('[title="Remplir automatiquement les scores (test)"]');
    const pools = await autofill.count();
    for (let i = 0; i < pools; i++) {
      await autofill.nth(i).click();
      await confirm();
      await win.waitForTimeout(800);
    }
    await click('.phase-step:has-text("Classement")');
    await click('button:has-text("Passer au tableau")');
    await win.waitForTimeout(1500);
    await click('button:has-text("Oui")');
    await win.waitForTimeout(1500);
    await click('.tableau-fab-trigger');
    await click('.tableau-fab-item:has-text("Remplir auto")');
    await confirm();
    await win.waitForTimeout(1000);

    // ── Boucle des langues ──
    for (const lang of LANGUAGES) {
      const dir = path.join(OUT, lang);
      fs.mkdirSync(dir, { recursive: true });
      const screens = {};
      report.languages[lang] = screens;

      // Pseudo-localisation lue au chargement ; la langue, elle, est imposée par le
      // splash (--initial-lang) à chaque rechargement : on la change donc à chaud,
      // par le sélecteur des Paramètres, comme un utilisateur.
      await win.evaluate(p => {
        if (p) localStorage.setItem('bellepoule-pseudo-locale', '1');
        else localStorage.removeItem('bellepoule-pseudo-locale');
      }, PSEUDO);
      await win.reload();
      await win.waitForTimeout(2500);
      await click('header button:has(.lucide-settings)');
      await win.locator('select:has(option[value="zh-HK"])').first().selectOption(lang);
      await confirm();
      await win.waitForTimeout(1200);
      await closeOverlays();
      const htmlLang = await win.evaluate(() => localStorage.getItem('bellepoule-language'));
      if (htmlLang !== lang)
        throw new Error(`Langue non appliquée : ${htmlLang} au lieu de ${lang}`);

      const shot = async name => {
        await win.waitForTimeout(700);
        await win.evaluate(() =>
          document
            .querySelectorAll('[role="status"][aria-live], canvas')
            .forEach(el => (el.style.display = 'none'))
        );
        const issues = await win.evaluate(detectOverflow);
        screens[name] = issues;
        total += issues.length;
        await win.screenshot({ path: path.join(dir, `${name}.png`) });
        console.log(
          `${issues.length ? '✗' : '✓'} ${lang}/${name}${issues.length ? ` (${issues.length})` : ''}`
        );
        for (const i of issues) console.log(`    ${i.kind}: ${i.text}`);
      };
      const tryShot = async (name, fn) => {
        try {
          await fn();
          await shot(name);
        } catch (err) {
          console.log(`- ${lang}/${name} ignoré : ${err.message.split('\n')[0]}`);
        }
      };

      await tryShot('01-accueil', async () => {
        const home = win.locator('.tab').first();
        if (await home.isVisible().catch(() => false)) await home.click();
      });
      await tryShot('02-nouvelle-competition', () => click('button.btn-primary.btn-icon-label'));
      await closeOverlays();
      await click('.btn-close').catch(() => {});

      await click('.competition-card');
      await win.waitForTimeout(1500);
      const steps = await win.locator('.phase-step').count();
      for (let i = 0; i < steps; i++) {
        const disabled = await win
          .locator('.phase-step')
          .nth(i)
          .evaluate(el => el.classList.contains('phase-step-disabled'));
        if (disabled) continue;
        await tryShot(`phase-${String(i + 1).padStart(2, '0')}`, async () => {
          await phase(i);
          await win.evaluate(() => window.scrollTo(0, 0));
        });
      }

      await tryShot('menu-outils', () => click('button[aria-haspopup="true"]:has(.lucide-wrench)'));
      await closeOverlays();
      await tryShot('parametres', () => click('header button:has(.lucide-settings)'));
      await closeOverlays();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    const last = app.windows().find(w => !w.url().includes('splash'));
    if (process.exitCode || !Object.keys(report.languages).length)
      await last?.screenshot({ path: path.join(OUT, 'last.png') }).catch(() => {});
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }

  console.log(`\n${total} débordement(s) — captures : ${path.relative(ROOT, OUT)}`);
  if (total > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
