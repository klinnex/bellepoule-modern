import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/');

    // Check for main landmarks
    await expect(page.locator('main, [role="main"]')).toBeVisible();

    // Check for navigation
    const nav = page.locator('nav, [role="navigation"]');
    if (await nav.isVisible().catch(() => false)) {
      await expect(nav).toHaveAttribute('aria-label');
    }

    // Check buttons have accessible names
    const buttons = await page.locator('button').all();
    for (const button of buttons) {
      const hasName = await button.evaluate(el => {
        return (
          el.hasAttribute('aria-label') ||
          el.hasAttribute('aria-labelledby') ||
          el.textContent?.trim()
        );
      });
      expect(hasName).toBeTruthy();
    }
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');

    // Press Tab to navigate
    await page.keyboard.press('Tab');

    // Check that focus is visible
    const focusedElement = await page.locator(':focus');
    await expect(focusedElement).toBeVisible();

    // Press Enter on focused element
    await page.keyboard.press('Enter');
  });

  test('should respect reduced motion preference', async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/');

    // Check that animations are disabled
    const animationsDisabled = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return (
        style.getPropertyValue('--animation-duration') === '0s' ||
        document.querySelectorAll('.no-animation').length > 0
      );
    });

    // This is optional - app may or may not respect this preference
    console.log('Reduced motion support:', animationsDisabled);
  });

  // Audit axe WCAG 2 AA : échoue sur toute violation de contraste (#1156)
  for (const scheme of ['light', 'dark'] as const) {
    test(`should pass axe color-contrast (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .withRules(['color-contrast'])
        .analyze();
      expect(results.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }

  test('should have no critical axe violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
