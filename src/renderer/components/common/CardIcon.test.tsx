// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardIcon } from './CardIcon';

describe('CardIcon', () => {
  it('est décorative par défaut et porte la couleur du carton', () => {
    const { container } = render(<CardIcon type="YELLOW" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('class')).toContain('card-icon-yellow');
  });

  it('expose un nom accessible quand elle est seule', () => {
    render(<CardIcon type="red" label="Cartons rouges" />);
    expect(screen.getByRole('img', { name: 'Cartons rouges' })).toBeTruthy();
  });
});
