import { test, expect, createCompetition, addFencers } from './app';

// Poules sur l'application réelle (remplace e2e/pools.spec.ts, #2045)
test.describe('Poules (application Electron)', () => {
  test.beforeEach(async ({ win }) => {
    await createCompetition(win, 'E2E Poules');
    await addFencers(win, 6);
    await win.getByRole('button', { name: /tout pointer/i }).click();
    await win.getByRole('button', { name: /pr[eé]parer les poules/i }).click();
    await win.getByRole('button', { name: /lancer les poules/i }).click();
  });

  test('six tireurs pointés : une poule de 15 matchs', async ({ win }) => {
    // Matrice : deux cases par match (A contre B, B contre A)
    await expect(win.getByLabel(/contre .*, saisir le score/)).toHaveCount(30);
  });

  test('lancement par le moteur : PoolsGenerated au journal, source écran (#1980)', async ({
    win,
  }) => {
    await expect(win.getByLabel(/contre .*, saisir le score/)).toHaveCount(30);
    const events = await win.evaluate(async () => {
      const comps = await window.electronAPI.db.getAllCompetitions();
      const id = comps.find(c => c.title === 'E2E Poules')!.id;
      const env = await window.electronAPI.api.invoke('getCompetitionEvents', {
        competitionId: id,
        since: 0,
      });
      return (env as { data: { events: Array<{ type: string; source: string }> } }).data.events;
    });
    expect(events.filter(e => e.type === 'PoolsGenerated')).toEqual([
      expect.objectContaining({ source: 'screen' }),
    ]);
  });

  test('saisir un score de poule l’inscrit dans la matrice', async ({ win }) => {
    const cell = win.getByLabel(/contre .*, saisir le score/).first();
    const match = (await cell.getAttribute('aria-label'))!.split(',')[0];
    await cell.click();
    const [a, b] = await win.getByRole('spinbutton').all();
    await a.fill('5');
    await b.fill('3');
    await win.getByRole('button', { name: /^valider$/i }).click();
    await expect(win.getByLabel(`${match} : victoire 5`)).toBeVisible();
    await expect(win.getByLabel(/contre .*, saisir le score/)).toHaveCount(28);
  });
});
