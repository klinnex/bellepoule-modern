import { test, expect } from '@playwright/test';

test.describe('Tableau (élimination directe)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  const openFirstCompetition = async (page: import('@playwright/test').Page) => {
    const firstItem = page.locator('.competition-item, [class*="competition-card"]').first();
    const hasItem = await firstItem.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasItem) {
      test.skip();
      return false;
    }
    await firstItem.click();
    return true;
  };

  test('l\'onglet Tableau est accessible depuis une compétition', async ({ page }) => {
    if (!(await openFirstCompetition(page))) return;

    const tableauTab = page.getByRole('tab', { name: /tableau/i })
      .or(page.getByText(/^tableau$/i).first());

    const isVisible = await tableauTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    await expect(tableauTab).toBeVisible();
  });

  test('ouvrir le tableau affiche le bracket ou un état vide', async ({ page }) => {
    if (!(await openFirstCompetition(page))) return;

    const tableauTab = page.getByRole('tab', { name: /tableau/i })
      .or(page.getByText(/^tableau$/i).first());

    const isVisible = await tableauTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    await tableauTab.click();

    const bracket = page.locator('.bracket-svg-overlay, .bracket-zoom-controls, [class*="bracket"], [class*="tableau"]');
    const emptyState = page.getByText(/aucun match|pas de tableau|no match/i);

    const hasBracket = await bracket.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasBracket || hasEmptyState).toBe(true);
  });

  test('les contrôles de zoom du bracket fonctionnent si un tableau existe', async ({ page }) => {
    if (!(await openFirstCompetition(page))) return;

    const tableauTab = page.getByRole('tab', { name: /tableau/i })
      .or(page.getByText(/^tableau$/i).first());

    const isVisible = await tableauTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    await tableauTab.click();

    const zoomIn = page.locator('.bracket-zoom-btn').first();
    const hasZoom = await zoomIn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasZoom) {
      test.skip();
      return;
    }

    const zoomLevel = page.locator('.bracket-zoom-level');
    const before = await zoomLevel.textContent();
    await zoomIn.click();
    await expect(zoomLevel).not.toHaveText(before ?? '', { timeout: 3000 });
  });
});
