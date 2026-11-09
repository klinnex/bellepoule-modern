/**
 * Navigation aux flèches entre cartes de match du tableau (#1542).
 * Géométrique : indépendante de la structure DOM (colonnes de tours, consolantes).
 */

export type NavRect = { left: number; right: number; top: number; bottom: number };
export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export const isNavKey = (key: string): key is NavKey =>
  key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';

/**
 * Index de la carte voisine de `from` dans la direction `key`, ou -1.
 * Critère : carte strictement au-delà dans l'axe, la plus proche (distance
 * dans l'axe, puis décalage transversal).
 */
export function pickNeighbour(from: NavRect, others: NavRect[], key: NavKey): number {
  const cx = (from.left + from.right) / 2;
  const cy = (from.top + from.bottom) / 2;
  let best = -1;
  let bestScore = Infinity;
  others.forEach((r, i) => {
    const rx = (r.left + r.right) / 2;
    const ry = (r.top + r.bottom) / 2;
    let axis: number;
    let cross: number;
    switch (key) {
      case 'ArrowRight':
        axis = rx - cx;
        cross = Math.abs(ry - cy);
        break;
      case 'ArrowLeft':
        axis = cx - rx;
        cross = Math.abs(ry - cy);
        break;
      case 'ArrowDown':
        axis = ry - cy;
        cross = Math.abs(rx - cx);
        break;
      default:
        axis = cy - ry;
        cross = Math.abs(rx - cx);
    }
    if (axis <= 1) return;
    // Pondère le décalage transversal pour rester dans la même colonne / ligne
    const score = axis + cross * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Déplace le focus vers la carte voisine ; true si le focus a bougé. */
export function focusNeighbourCard(current: HTMLElement, key: NavKey): boolean {
  const root = current.closest('.bracket-container, .tableau-view, body') ?? document.body;
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.match-card[tabindex="0"]')).filter(
    el => el !== current
  );
  const rect = (el: HTMLElement): NavRect => el.getBoundingClientRect();
  const idx = pickNeighbour(rect(current), cards.map(rect), key);
  if (idx < 0) return false;
  cards[idx].focus();
  cards[idx].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}
