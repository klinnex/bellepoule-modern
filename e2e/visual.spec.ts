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
  // Tailles de référence (#1541) : aucun débordement horizontal inattendu + capture par taille
  const SIZES = [
    { name: '1024x768', width: 1024, height: 768 },
    { name: '1280x800', width: 1280, height: 800 },
    { name: '1920x1080', width: 1920, height: 1080 },
  ];

  for (const size of SIZES) {
    test(`accueil sans débordement horizontal (${size.name})`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page).toHaveScreenshot(`accueil-${size.name}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
