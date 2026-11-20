import { test, expect } from '@playwright/test';

test.describe('Application Launch', () => {
  test('should display the main window', async ({ page }) => {
    await page.goto('/');

    // Titre de l'en-tête (le nom figure aussi dans le message d'accueil)
    await expect(page.locator('.header-title-text')).toHaveText('BellePoule Modern');
  });

  test('should display competition list or empty state', async ({ page }) => {
    await page.goto('/');

    // Liste des compétitions (cartes) ou accueil vide (étapes du parcours)
    await expect(page.locator('.competition-card, ol[aria-label]').first()).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('should navigate to new competition modal', async ({ page }) => {
    await page.goto('/');

    // Click on new competition button
    await page
      .getByRole('button', { name: /nouvelle comp[eé]tition|new competition/i })
      .first()
      .click();
    await expect(page.getByLabel(/^(Titre|Title)$/)).toBeVisible();
  });
});
