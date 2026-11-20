import { test, expect, createCompetition } from './app';

// Épreuves sur l'application réelle (remplace e2e/competition.spec.ts, #2045)
test.describe('Compétitions (application Electron)', () => {
  test('créer une compétition ouvre son onglet', async ({ win }) => {
    await createCompetition(win, 'E2E Création');
    await expect(win.getByText('E2E Création').first()).toBeVisible();
    await expect(win.getByText('Aucun tireur inscrit')).toBeVisible();
  });

  test('la compétition créée figure sur l’accueil et se rouvre', async ({ win }) => {
    await createCompetition(win, 'E2E Liste');
    await win.getByRole('button', { name: /revenir à la liste des comp/i }).click();
    const card = win.locator('.competition-card', { hasText: 'E2E Liste' });
    await expect(card).toBeVisible();
    await card.click();
    await expect(win.getByRole('heading', { name: 'Appel' })).toBeVisible();
  });

  test('supprimer une compétition la retire de l’accueil', async ({ win }) => {
    await createCompetition(win, 'E2E Suppression');
    await win.getByRole('button', { name: /revenir à la liste des comp/i }).click();
    const card = win.locator('.competition-card', { hasText: 'E2E Suppression' });
    await card.getByRole('button', { name: 'Supprimer' }).click();
    await win.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(card).toHaveCount(0);
  });
});
