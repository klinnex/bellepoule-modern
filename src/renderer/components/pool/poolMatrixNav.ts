/**
 * Navigation clavier dans la matrice de poule (#1542) :
 * flèches = cellule de score voisine (la diagonale est ignorée).
 */

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;

export const isArrowKey = (key: string): boolean => (ARROWS as readonly string[]).includes(key);

const isScoreCell = (el: Element | null | undefined): el is HTMLElement =>
  !!el &&
  el.classList.contains('pool-cell') &&
  el.getAttribute('role') === 'button' &&
  el.getAttribute('tabindex') !== '-1';

/** Cellule de score voisine de `current` dans la direction de `key`, ou null. */
export function findNeighbourCell(current: HTMLElement, key: string): HTMLElement | null {
  const row = current.parentElement;
  if (!row || !isArrowKey(key)) return null;
  const idx = Array.prototype.indexOf.call(row.children, current) as number;

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const step = key === 'ArrowLeft' ? -1 : 1;
    for (let i = idx + step; i >= 0 && i < row.children.length; i += step) {
      const el = row.children[i];
      if (isScoreCell(el)) return el;
      if (el.classList.contains('pool-cell-diagonal')) continue;
      return null; // en-tête ou colonne de statistiques : fin de la zone de scores
    }
    return null;
  }

  const step = key === 'ArrowUp' ? -1 : 1;
  let targetRow = step < 0 ? row.previousElementSibling : row.nextElementSibling;
  while (targetRow) {
    const el = targetRow.children[idx];
    if (isScoreCell(el)) return el;
    if (el && !el.classList.contains('pool-cell-diagonal')) return null;
    targetRow = step < 0 ? targetRow.previousElementSibling : targetRow.nextElementSibling;
  }
  return null;
}
