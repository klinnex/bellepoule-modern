import type { Page } from '@playwright/test';
import { test, expect, createCompetition, addFencers } from './app';

/**
 * Retrait et réintégration d'un tireur depuis l'appel, poules lancées (docs/adr/0016) :
 * le moteur perd ses matchs non disputés, l'écran les affiche, le journal les attribue à
 * l'écran ; la réactivation rend les matchs.
 */
const TITLE = 'E2E Retrait';

async function journalTypes(win: Page): Promise<string[]> {
  return win.evaluate(async title => {
    const comps = await window.electronAPI.db.getAllCompetitions();
    const id = comps.find(c => c.title === title)!.id;
    const env = await window.electronAPI.api.invoke('getCompetitionEvents', {
      competitionId: id,
      since: 0,
    });
    return (env as { data: { events: Array<{ type: string; source: string }> } }).data.events
      .filter(e => e.source === 'screen')
      .map(e => e.type);
  }, TITLE);
}

test('sortie médicale depuis l’appel puis réactivation : matchs perdus puis rendus', async ({
  win,
}) => {
  await createCompetition(win, TITLE);
  await addFencers(win, 5);
  await win.getByRole('button', { name: /tout pointer/i }).click();
  await win.getByRole('button', { name: /pr[eé]parer les poules/i }).click();
  await win.getByRole('button', { name: /lancer les poules/i }).click();
  const toPlay = win.getByLabel(/contre .*, saisir le score/);
  await expect(toPlay).toHaveCount(20); // poule de 5 : 10 matchs, 2 cases chacun

  // Appel : sortie médicale de TIREUR0
  await win
    .getByRole('button', { name: /^appel/i })
    .first()
    .click();
  const row = win.getByRole('row').filter({ hasText: 'TIREUR0' });
  await row.getByRole('button', { name: 'Sortie médicale' }).click();
  await expect(row.getByRole('button', { name: 'Réactiver' })).toBeVisible();

  await win
    .getByRole('button', { name: /^poules/i })
    .first()
    .click();
  await expect(toPlay).toHaveCount(12); // ses 4 matchs perdus
  await expect.poll(() => journalTypes(win)).toContain('FencerWithdrawn');

  // Réactivation : les 4 matchs reviennent à jouer
  await win
    .getByRole('button', { name: /^appel/i })
    .first()
    .click();
  await row.getByRole('button', { name: 'Réactiver' }).click();
  await expect(row.getByRole('button', { name: 'Sortie médicale' })).toBeVisible();
  await win
    .getByRole('button', { name: /^poules/i })
    .first()
    .click();
  await expect(toPlay).toHaveCount(20);
  await expect.poll(() => journalTypes(win)).toContain('FencerReinstated');
});
