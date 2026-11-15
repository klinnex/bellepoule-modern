/**
 * Saisie enchaînée des scores de poule : ordre de visite des cases de la matrice.
 * Ligne par ligne, de gauche à droite, au-dessus de la diagonale uniquement
 * (chaque match n'est proposé qu'une fois). Les matchs déjà saisis sont aussi visités.
 */

export interface ChainedPair {
  /** Index du tireur en ligne (dans pool.fencers) */
  rowIdx: number;
  /** Index du tireur en colonne (dans pool.fencers), toujours > rowIdx */
  colIdx: number;
}

/**
 * Case suivant `from` dans l'ordre de la matrice, ou null en fin de poule.
 * `isPlayable` écarte les matchs non jouables (annulés, tireur abandonné, etc.).
 */
export function nextChainedPair(
  count: number,
  from: ChainedPair,
  isPlayable: (pair: ChainedPair) => boolean
): ChainedPair | null {
  for (let r = from.rowIdx; r < count; r++) {
    const firstCol = r === from.rowIdx ? from.colIdx + 1 : r + 1;
    for (let c = Math.max(firstCol, r + 1); c < count; c++) {
      const pair = { rowIdx: r, colIdx: c };
      if (isPlayable(pair)) return pair;
    }
  }
  return null;
}
