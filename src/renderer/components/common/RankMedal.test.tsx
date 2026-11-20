// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RankMedal } from './RankMedal';

describe('RankMedal', () => {
  it('affiche une médaille décorative pour les trois premiers rangs', () => {
    for (const rank of [1, 2, 3]) {
      const { container } = render(<RankMedal rank={rank} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('class')).toContain(`rank-medal-${rank}`);
    }
  });

  it('ne rend rien au-delà du 3e rang ni sans rang', () => {
    expect(render(<RankMedal rank={4} />).container.firstChild).toBeNull();
    expect(render(<RankMedal rank={null} />).container.firstChild).toBeNull();
  });
});
