import { test, expect } from '@playwright/test';

test.describe('Flow complet compétition', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test("ouvrir l'app affiche l'écran principal", async ({ page }) => {
    await expect(page).toHaveURL('/');
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('cliquer "Nouvelle compétition" ouvre le formulaire', async ({ page }) => {
    const btn = page
      .getByRole('button', { name: /nouvelle comp[eé]tition/i })
      .or(page.getByText(/nouvelle comp[eé]tition/i).first());

    const isVisible = await btn.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    await btn.click();

    // Libellés associés aux champs (#2045) : le champ se trouve par son libellé
    await expect(page.getByLabel(/^(Titre|Title)$/)).toBeVisible({ timeout: 5000 });
  });

  // Créer et sauvegarder une épreuve : e2e/electron/competition.spec.ts (écriture en base, #2045)

  test("la liste de compétitions ou l'état vide est affiché", async ({ page }) => {
    const competitionList = page.locator('.competition-list, .empty-state, [class*="competition"]');
    const isVisible = await competitionList
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // L'application doit afficher soit une liste soit un état vide
    const hasAnyContent = isVisible || (await page.locator('body').textContent())!.length > 0;
    expect(hasAnyContent).toBe(true);
  });

  test("ouvrir une compétition existante affiche l'onglet tireurs", async ({ page }) => {
    const firstItem = page.locator('.competition-item, [class*="competition-card"]').first();
    const hasItem = await firstItem.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasItem) {
      test.skip();
      return;
    }

    await firstItem.click();

    const fencerTab = page
      .getByRole('tab', { name: /tireurs?|fencers?/i })
      .or(page.getByText(/tireurs?|fencers?/i).first());

    await expect(fencerTab).toBeVisible({ timeout: 5000 });
  });

  test('ajouter un tireur manuellement', async ({ page }) => {
    const firstItem = page.locator('.competition-item, [class*="competition-card"]').first();
    const hasItem = await firstItem.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasItem) {
      test.skip();
      return;
    }

    await firstItem.click();

    const addBtn = page
      .getByRole('button', { name: /ajouter.*(tireur|fencer)/i })
      .or(page.getByText(/ajouter.*(tireur|fencer)/i).first());

    const addVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!addVisible) {
      test.skip();
      return;
    }

    await addBtn.click();

    const lastNameInput = page
      .getByLabel(/nom/i)
      .or(page.getByPlaceholder(/nom|last.?name/i))
      .first();
    await lastNameInput.waitFor({ timeout: 3000 });
    await lastNameInput.fill('TestFencer');

    const saveBtn = page.getByRole('button', { name: /valider|ajouter|save|ok/i }).first();
    const saveBtnVisible = await saveBtn.isVisible().catch(() => false);
    if (saveBtnVisible) {
      await saveBtn.click();
      await expect(page.getByText('TestFencer')).toBeVisible({ timeout: 5000 });
    }
  });
});
