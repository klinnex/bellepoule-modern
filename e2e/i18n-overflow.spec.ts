import { test, expect } from '@playwright/test';

// Débordements de libellés par langue (#1543) : accueil à 1024x768 (taille minimale
// de la fenêtre), avec et sans pseudo-localisation (+40 %).
const LANGUAGES = ['fr', 'en', 'de', 'ru', 'br', 'ca', 'es', 'it', 'pt', 'zh-HK'];

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
      });
    }
  }
});
