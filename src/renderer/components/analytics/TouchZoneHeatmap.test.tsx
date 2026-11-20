// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TouchZoneHeatmap, zoneShade } from './TouchZoneHeatmap';

describe('zoneShade', () => {
  it('foncé = plus sollicitée, moyen = intermédiaire, clair = plus faible', () => {
    const counts = [2, 7, 4];
    expect(zoneShade(7, counts)).toBe('dark');
    expect(zoneShade(4, counts)).toBe('medium');
    expect(zoneShade(2, counts)).toBe('light');
  });
  it('zone sans touche = none ; deux zones touchées = foncé / clair', () => {
    expect(zoneShade(0, [0, 3, 1])).toBe('none');
    expect(zoneShade(3, [0, 3, 1])).toBe('dark');
    expect(zoneShade(1, [0, 3, 1])).toBe('light');
  });
});

describe('TouchZoneHeatmap', () => {
  it('affiche les trois zones, dont C, avec leur classe de rang', () => {
    const { container } = render(<TouchZoneHeatmap zoneA={1} zoneB={2} zoneC={5} />);
    const legend = [...container.querySelectorAll('.zone-legend')].map(e => e.className);
    expect(legend).toEqual([
      'zone-legend zone-legend--a-light',
      'zone-legend zone-legend--b-medium',
      'zone-legend zone-legend--c-dark',
    ]);
    expect(container.querySelector('.zone-legend--c-dark')?.textContent).toContain('5');
  });
});
