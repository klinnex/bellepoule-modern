// @vitest-environment jsdom
/**
 * Tests de la mémorisation du zoom du tableau (#1542)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { clampBracketPan, loadBracketZoom, saveBracketZoom } from './useBracketZoomPan';

describe('zoom mémorisé du tableau', () => {
  beforeEach(() => localStorage.clear());

  it('renvoie 1 par défaut', () => {
    expect(loadBracketZoom('c1')).toBe(1);
    expect(loadBracketZoom(undefined)).toBe(1);
  });

  it('restitue le zoom par compétition', () => {
    saveBracketZoom('c1', 1.4);
    saveBracketZoom('c2', 0.6);
    expect(loadBracketZoom('c1')).toBe(1.4);
    expect(loadBracketZoom('c2')).toBe(0.6);
  });

  it('ignore une valeur invalide ou hors bornes', () => {
    localStorage.setItem('bp_bracket_zoom_c1', 'abc');
    expect(loadBracketZoom('c1')).toBe(1);
    localStorage.setItem('bp_bracket_zoom_c1', '9');
    expect(loadBracketZoom('c1')).toBe(1);
  });

  it('supprime l entrée quand le zoom revient à 1', () => {
    saveBracketZoom('c1', 1.2);
    saveBracketZoom('c1', 1);
    expect(localStorage.getItem('bp_bracket_zoom_c1')).toBeNull();
  });
});

describe('pan borné du tableau', () => {
  const view = { w: 800, h: 600 };
  const content = { w: 2000, h: 1500 };

  it('bloque le défilement au-dessus / à gauche du bracket', () => {
    expect(clampBracketPan({ x: 300, y: 500 }, 1, content, view)).toEqual({ x: 0, y: 0 });
  });

  it('bloque le défilement au-delà du bas / de la droite', () => {
    expect(clampBracketPan({ x: -5000, y: -5000 }, 1, content, view)).toEqual({
      x: -1200,
      y: -900,
    });
  });

  it('tient compte du zoom', () => {
    expect(clampBracketPan({ x: -5000, y: -5000 }, 0.5, content, view)).toEqual({
      x: -200,
      y: -150,
    });
  });

  it('contenu plus petit que la vue : reste visible', () => {
    const small = { w: 400, h: 300 };
    expect(clampBracketPan({ x: -50, y: 900 }, 1, small, view)).toEqual({ x: 0, y: 300 });
    expect(clampBracketPan({ x: 100, y: 100 }, 1, small, view)).toEqual({ x: 100, y: 100 });
  });

  it('laisse un pan valide inchangé', () => {
    expect(clampBracketPan({ x: -100, y: -200 }, 1, content, view)).toEqual({ x: -100, y: -200 });
  });
});
