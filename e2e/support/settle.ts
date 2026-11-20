import type { Page } from '@playwright/test';

/**
 * Attend la fin des animations finies (apparition de l'accueil, ouverture d'une fenêtre).
 * Pendant un fondu, axe mesure une couleur mélangée au fond et les bords d'une fenêtre en
 * zoom dépassent : mesures fausses au premier passage, justes au second (#2045).
 * Les animations infinies (indicateurs de chargement) sont ignorées.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => undefined))
    )
  );
}
