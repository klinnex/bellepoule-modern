import { chromium, type Page } from '@playwright/test';
import { test, expect, createCompetition, addFencers } from './app';
// Appareil de piste simulé (même code que npm run cyrano:sim / cyrano:remote)
const { CyranoDevice } = require('../../scripts/lib/cyranoDevice');

/**
 * Saisie distante sur l'application réelle (#1980, ADR-0005) : une tablette d'arbitre
 * (referee.html dans Chromium) sur la piste 1 et un appareil Cyrano simulé (UDP) sur la
 * piste 2 terminent chacun un match de poule. Les deux scores passent par recordScore :
 * l'écran les affiche dans la matrice et le journal de l'épreuve les attribue à leur source.
 * Un score refusé par la commande (6 touches en poule de 5) vaut NAK à l'appareil.
 */
const TITLE = 'E2E Distant';

type Journal = {
  events: Array<{ type: string; source: string; payload: Record<string, unknown> }>;
};

async function competitionId(win: Page): Promise<string> {
  return win.evaluate(async title => {
    const comps = await window.electronAPI.db.getAllCompetitions();
    return comps.find(c => c.title === title)!.id;
  }, TITLE);
}

async function journal(win: Page, id: string): Promise<Journal> {
  return win.evaluate(async cid => {
    const env = await window.electronAPI.api.invoke('getCompetitionEvents', {
      competitionId: cid,
      since: 0,
    });
    return (env as { data: Journal }).data;
  }, id);
}

/** Attente bornée, avec le nom de l'étape en cas d'échec */
const within = <T>(p: Promise<T>, label: string, ms = 15_000) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`délai : ${label}`)), ms)),
  ]);

/** État et score de l'arène tels que le logiciel les a reçus de l'appareil (« in_progress a-b ») */
async function arenaScore(win: Page, cid: string, arenaId: string): Promise<string> {
  return win.evaluate(
    async ({ cid, arenaId }) => {
      const res = await window.electronAPI.remote.getArenas(cid);
      const arena = res.arenas?.find(a => a.id === arenaId);
      const m = arena?.currentMatch;
      return m ? `${arena.status} ${m.scoreA}-${m.scoreB}` : '';
    },
    { cid, arenaId }
  );
}

const scoresOf = (journalData: Journal, source: string) =>
  journalData.events
    .filter(e => e.type === 'ScoreRecorded' && e.source === source)
    .map(e => [e.payload.scoreA, e.payload.scoreB].sort().join('-'));

test('tablette (piste 1) et appareil Cyrano (piste 2) : scores par le moteur, affichés à l’écran', async ({
  win,
}, testInfo) => {
  test.setTimeout(120_000);
  // Ports propres au processus de test (le serveur de dev occupe 8066)
  const base = 18000 + (testInfo.workerIndex % 50) * 20;
  const remotePort = base;
  const cyranoPort = base + 1;
  const devicePort = base + 2;

  await createCompetition(win, TITLE);
  await addFencers(win, 10);
  await win.getByRole('button', { name: /tout pointer/i }).click();
  await win.getByRole('button', { name: /pr[eé]parer les poules/i }).click();
  await win.getByRole('button', { name: /lancer les poules/i }).click();
  await expect(win.getByLabel(/contre .*, saisir le score/)).toHaveCount(40); // 2 poules de 5

  // Réglages : port de la saisie distante, appareil Cyrano maître sur la piste 2, démarrage
  // automatique avec la séance
  const id = await competitionId(win);
  await win.evaluate(
    async ({ cid, remotePort, cyranoPort, devicePort }) => {
      localStorage.setItem(`bellepoule-remote-port-${cid}`, String(remotePort));
      localStorage.setItem('bellepoule-cyrano-port', String(cyranoPort));
      localStorage.setItem('bellepoule-cyrano-autostart', 'true');
      await window.electronAPI.cyrano.savePistes(cid, [
        {
          piste: '2',
          ip: '127.0.0.3',
          port: devicePort,
          arena: 2,
          protocol: 'EFP1.1',
          mode: 'master',
        },
      ]);
    },
    { cid: id, remotePort, cyranoPort, devicePort }
  );

  const device = new CyranoDevice({
    piste: '2',
    port: devicePort,
    bind: '127.0.0.3',
    serverPort: cyranoPort,
  });
  await device.start();
  const deviceLog: string[] = [];
  device.on('log', (l: { dir: string; text: string }) => deviceLog.push(`${l.dir} ${l.text}`));
  const browser = await chromium.launch();
  try {
    await win
      .getByRole('button', { name: /saisie distante/i })
      .first()
      .click();
    await win.getByLabel(/activer https/i).uncheck();
    await win.getByRole('button', { name: /d[eé]marrer la saisie distante/i }).click();
    await expect(win.getByRole('button', { name: /arr[eê]ter la saisie distante/i })).toBeVisible();

    // ── Tablette, piste 1 : 5-2 ──────────────────────────────────────────────
    const tablet = await browser.newPage();
    await tablet.goto(`http://127.0.0.1:${remotePort}/arene1/arbitre`);
    await tablet
      .getByText(/TIREUR\d+ vs TIREUR\d+/)
      .first()
      .click();
    await tablet.locator('#btn-start').click();
    for (let i = 0; i < 2; i++) await tablet.locator('#score-b').click();
    for (let i = 0; i < 5; i++) await tablet.locator('#score-a').click();
    const confirm = tablet.locator('#finish-modal .modal-btn-confirm');
    // Score maximum atteint : la fenêtre de fin s'ouvre seule (sinon : Terminer)
    await tablet.waitForTimeout(500);
    if (!(await confirm.isVisible())) await tablet.locator('#btn-finish').click();
    await confirm.click();

    // Retour à l'onglet Poules de l'écran : la matrice affiche le score de la tablette
    await win
      .getByRole('button', { name: /^poules/i })
      .first()
      .click();
    await expect(win.getByLabel(/ : victoire 5$/)).toHaveCount(1);
    await expect.poll(async () => scoresOf(await journal(win, id), 'tablet')).toEqual(['2-5']);

    // ── Appareil Cyrano, piste 2 : 5-1 ───────────────────────────────────────
    // L'appareil s'annonce ; le logiciel lui envoie le match de l'arène 2 (DISP)
    device.sendInfo();
    await expect.poll(() => device.s.right.name, { timeout: 20_000 }).not.toBe('');
    const reply = (kind: 'ACK' | 'NAK') =>
      new Promise<void>(resolve =>
        device.on('log', (l: { dir: string; text: string }) => {
          if (l.dir === 'in' && l.text.includes(`|${kind}|`)) resolve();
        })
      );
    // 6 touches en poule de 5 : score refusé par recordScore, l'appareil reçoit NAK
    const nak = reply('NAK');
    device.command('begin');
    // Match lancé côté logiciel (et son DISP de démarrage reçu) avant les touches
    await expect.poll(() => arenaScore(win, id, 'arena2')).toBe('in_progress 0-0');
    await new Promise(r => setTimeout(r, 300));
    for (let i = 0; i < 6; i++) device.command('r+');
    device.command('l+');
    // Comme sur une vraie piste, la fin n'est validée qu'une fois le score reçu par le logiciel
    await expect.poll(() => arenaScore(win, id, 'arena2')).toMatch(/ (6-1|1-6)$/);
    device.command('validate');
    await within(nak, 'NAK de la fin refusée');
    await expect(win.getByLabel(/ : victoire 5$/)).toHaveCount(1);
    // L'arbitre corrige (5-1) et valide : ACK
    const ack = reply('ACK');
    device.command('r-');
    await expect.poll(() => arenaScore(win, id, 'arena2')).toMatch(/ (5-1|1-5)$/);
    device.command('validate');
    await within(ack, 'ACK de la fin corrigée');

    await expect(win.getByLabel(/ : victoire 5$/)).toHaveCount(2);
    const final = await journal(win, id);
    expect(scoresOf(final, 'cyrano')).toEqual(['1-5']);
    expect(scoresOf(final, 'tablet')).toEqual(['2-5']);
  } catch (e) {
    console.log('DEVICE LOG\n' + deviceLog.slice(-25).join('\n'));
    console.log(
      'HUB LOG\n' +
        JSON.stringify(await win.evaluate(() => window.electronAPI.cyrano.getLog())).slice(-3000)
    );
    throw e;
  } finally {
    device.stop();
    await browser.close();
  }
});
