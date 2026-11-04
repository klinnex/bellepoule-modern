import { test, expect } from '@playwright/test';

test.describe('Pool Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Open first competition or create one
    const hasCompetition = await page
      .locator('.competition-item')
      .first()
      .isVisible()
      .catch(() => false);

    if (hasCompetition) {
      await page.locator('.competition-item').first().click();
    } else {
      // Create a competition first
      await page.click('text=Nouvelle compétition');
      await page.fill('[placeholder="Titre"]', 'Pool Test');
      await page.selectOption('select[name="weapon"]', 'FOIL');
      await page.selectOption('select[name="gender"]', 'M');
      await page.selectOption('select[name="category"]', 'senior');
      await page.click('button[type="submit"]');
    }

    // Navigate to pools phase
    await page.click('text=Poules, text=Pools');
  });

  test('should generate pools', async ({ page }) => {
    // Add some fencers first
    for (let i = 0; i < 6; i++) {
      await page.click('text=Ajouter un tireur, text=Add Fencer');
      await page.fill('[name="lastName"]', `Fencer${i}`);
      await page.fill('[name="firstName"]', `First${i}`);
      await page.selectOption('[name="gender"]', 'M');
      await page.click('button[type="submit"]');
    }

    // Check in fencers
    await page.locator('.fencer-checkbox').first().check();

    // Generate pools
    await page.click('text=Préparer les poules, text=Prepare pools');

    // Verify pools were created
    await expect(page.locator('.pool')).toBeVisible();
  });

  test('should update pool scores', async ({ page }) => {
    // Wait for pools to be visible
    await page.waitForSelector('.pool', { timeout: 10000 });

    // Click on first match
    await page.locator('.match').first().click();

    // Update scores
    await page.fill('[name="scoreA"]', '5');
    await page.fill('[name="scoreB"]', '3');

    // Save
    await page.click('text=Sauvegarder, text=Save');

    // Verify scores are displayed
    await expect(page.locator('text=5')).toBeVisible();
    await expect(page.locator('text=3')).toBeVisible();
  });
});
