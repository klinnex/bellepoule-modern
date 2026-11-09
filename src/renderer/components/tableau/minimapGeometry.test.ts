import { describe, it, expect } from 'vitest';
import { computeMinimap, panForMinimapPoint } from './minimapGeometry';

const base = {
  contentW: 2000,
  contentH: 1000,
  viewW: 1000,
  viewH: 500,
  zoom: 1,
  pan: { x: 0, y: 0 },
  mapW: 200,
};

describe('minimapGeometry', () => {
  it('entrées invalides : null', () => {
    expect(computeMinimap({ ...base, contentW: 0 })).toBeNull();
    expect(computeMinimap({ ...base, zoom: 0 })).toBeNull();
  });

  it("rectangle visible à l'origine", () => {
    const m = computeMinimap(base)!;
    expect(m.scale).toBe(0.1);
    expect(m.mapH).toBe(100);
    expect(m.view).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(m.fullyVisible).toBe(false);
  });

  it('pan et zoom déplacent / réduisent le rectangle', () => {
    const m = computeMinimap({ ...base, zoom: 2, pan: { x: -400, y: -200 } })!;
    expect(m.view).toEqual({ x: 20, y: 10, w: 50, h: 25 });
  });

  it('tout visible quand le bracket tient dans la vue', () => {
    expect(computeMinimap({ ...base, zoom: 0.5 })!.fullyVisible).toBe(true);
  });

  it('clic minimap : centre la vue (aller-retour)', () => {
    const m = computeMinimap(base)!;
    const pan = panForMinimapPoint(100, 50, base, m.scale);
    const m2 = computeMinimap({ ...base, pan })!;
    expect(m2.view.x + m2.view.w / 2).toBeCloseTo(100);
    expect(m2.view.y + m2.view.h / 2).toBeCloseTo(50);
  });
});
