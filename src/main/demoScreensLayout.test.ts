import { describe, it, expect } from 'vitest';
import { demoScreens, tileLayout } from './demoScreensLayout';

describe('demoScreens', () => {
  it('liste arènes, tablette arbitre et affichage du tournoi', () => {
    const urls = demoScreens('http://192.168.1.2:8066/', 2).map(s => s.url);
    expect(urls).toEqual([
      'http://192.168.1.2:8066/arene1',
      'http://192.168.1.2:8066/arene2',
      'http://192.168.1.2:8066/arene1/arbitre?demo=1',
      'http://192.168.1.2:8066/demo',
    ]);
  });

  it('borne le nombre d’écrans d’arène entre 1 et 2', () => {
    expect(demoScreens('http://h:1', 0)).toHaveLength(3);
    expect(demoScreens('http://h:1', 8)).toHaveLength(4);
  });
});

describe('tileLayout', () => {
  const area = { x: 10, y: 20, width: 1000, height: 800 };

  it('vide si aucun écran', () => {
    expect(tileLayout(0, area)).toEqual([]);
  });

  it('une fenêtre occupe toute la zone', () => {
    expect(tileLayout(1, area)).toEqual([area]);
  });

  it('mosaïque 2 colonnes', () => {
    expect(tileLayout(3, area)).toEqual([
      { x: 10, y: 20, width: 500, height: 400 },
      { x: 510, y: 20, width: 500, height: 400 },
      { x: 10, y: 420, width: 500, height: 400 },
    ]);
  });
});
