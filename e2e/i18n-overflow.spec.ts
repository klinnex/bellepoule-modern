import { test, expect, type Page } from '@playwright/test';

// Débordements de libellés par langue (#1543) : accueil à 1024x768 (taille minimale
// de la fenêtre) et modale « nouvelle compétition », avec et sans pseudo-localisation (+40 %).
const LANGUAGES = ['fr', 'en', 'de', 'ru', 'br', 'ca', 'es', 'it', 'pt', 'zh-HK'];

async function expectNoOverflow(page: Page) {
  const horizontal = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(horizontal).toBeLessThanOrEqual(1);

  // Texte tronqué sans ellipse ni infobulle = débordement silencieux.
  const clipped = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll<HTMLElement>('button, a, .btn, .tab, th').forEach(el => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const cs = getComputedStyle(el);
      const hidden = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      if (!hidden) return;
      const hasHint = !!(el.title || el.getAttribute('aria-label'));
      if (cs.textOverflow !== 'ellipsis' || !hasHint) bad.push(el.textContent?.trim() ?? '');
    });
    return bad;
  });
  expect(clipped).toEqual([]);
}

test.describe('i18n : pas de débordement de libellés', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium uniquement');

  for (const lang of LANGUAGES) {
    for (const pseudo of [false, true]) {
      test(`accueil ${lang}${pseudo ? ' (pseudo-localisation)' : ''}`, async ({ page }) => {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.addInitScript(
          ({ l, p }) => {
            try {
              localStorage.setItem('bellepoule-language', l);
              if (p) localStorage.setItem('bellepoule-pseudo-locale', '1');
            } catch {
              /* stockage indisponible */
            }
          },
          { l: lang, p: pseudo }
        );
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expectNoOverflow(page);
      });

      test(`nouvelle compétition ${lang}${pseudo ? ' (pseudo-localisation)' : ''}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.addInitScript(
          ({ l, p }) => {
            try {
              localStorage.setItem('bellepoule-language', l);
              if (p) localStorage.setItem('bellepoule-pseudo-locale', '1');
            } catch {
              /* stockage indisponible */
            }
          },
          { l: lang, p: pseudo }
        );
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        const create = page.locator('button.btn-primary.btn-icon-label').first();
        test.skip(!(await create.isVisible().catch(() => false)), 'bouton absent');
        await create.click();
        await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
        await expectNoOverflow(page);
        // Aucun contrôle de la modale ne dépasse le bord droit de la fenêtre.
        const outside = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] *, .modal *'))
            .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
            .map(el => el.textContent?.trim().slice(0, 40) ?? '')
        );
        expect(outside).toEqual([]);
      });
    }
  }
});
