// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { findNeighbourCell, isArrowKey } from './poolMatrixNav';

/** Grille 3x3 : diagonale vide, en-tête + nom en début de ligne. */
function buildGrid(): HTMLElement[][] {
  document.body.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'pool-grid';
  const cells: HTMLElement[][] = [];
  for (let r = 0; r < 3; r++) {
    const row = document.createElement('div');
    row.className = 'pool-row';
    const name = document.createElement('div');
    name.className = 'pool-cell pool-cell-header pool-cell-name';
    row.appendChild(name);
    cells[r] = [];
    for (let c = 0; c < 3; c++) {
      const el = document.createElement('div');
      if (r === c) {
        el.className = 'pool-cell pool-cell-diagonal';
      } else {
        el.className = 'pool-cell';
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
      }
      row.appendChild(el);
      cells[r][c] = el;
    }
    grid.appendChild(row);
  }
  document.body.appendChild(grid);
  return cells;
}

describe('poolMatrixNav', () => {
  let cells: HTMLElement[][];
  beforeEach(() => {
    cells = buildGrid();
  });

  it('reconnaît les flèches', () => {
    expect(isArrowKey('ArrowUp')).toBe(true);
    expect(isArrowKey('Enter')).toBe(false);
  });

  it('droite/gauche : saute la diagonale', () => {
    expect(findNeighbourCell(cells[0][1], 'ArrowRight')).toBe(cells[0][2]);
    expect(findNeighbourCell(cells[1][0], 'ArrowRight')).toBe(cells[1][2]);
    expect(findNeighbourCell(cells[1][2], 'ArrowLeft')).toBe(cells[1][0]);
  });

  it('bas/haut : saute la diagonale', () => {
    expect(findNeighbourCell(cells[0][1], 'ArrowDown')).toBe(cells[2][1]);
    expect(findNeighbourCell(cells[2][1], 'ArrowUp')).toBe(cells[0][1]);
  });

  it('bords : null', () => {
    expect(findNeighbourCell(cells[0][2], 'ArrowRight')).toBeNull();
    expect(findNeighbourCell(cells[1][0], 'ArrowLeft')).toBeNull();
    expect(findNeighbourCell(cells[0][1], 'ArrowUp')).toBeNull();
    expect(findNeighbourCell(cells[2][0], 'ArrowDown')).toBeNull();
  });

  it('touche non fléchée : null', () => {
    expect(findNeighbourCell(cells[0][1], 'a')).toBeNull();
  });
});
