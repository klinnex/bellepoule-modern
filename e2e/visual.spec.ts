import { test, expect } from '@playwright/test';

// Non-régression visuelle (#1157) : écrans clés en clair et sombre.
// Références par plateforme ; absentes → créées au premier passage (updateSnapshots: 'missing').
test.describe('Visual regression', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'références Chromium uniquement');

  for (const scheme of ['light', 'dark'] as const) {
    test(`accueil (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await expect(page).toHaveScreenshot(`accueil-${scheme}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
      });
    });

    test(`nouvelle compétition (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const create = page.locator('text=Nouvelle compétition').first();
      test.skip(!(await create.isVisible().catch(() => false)), 'bouton absent');
      await create.click();
      await expect(page).toHaveScreenshot(`nouvelle-competition-${scheme}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
