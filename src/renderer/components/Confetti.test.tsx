// @vitest-environment jsdom
/**
 * Tests de composant - Confetti
 * BellePoule Modern
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import Confetti, { CONFETTI_DISABLED_KEY } from './Confetti';

describe('Confetti', () => {
  it('ne rend rien quand inactif', () => {
    const { container } = render(<Confetti active={false} />);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('rend un canvas plein écran quand actif', () => {
    const { container } = render(<Confetti active={true} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.style.position).toBe('fixed');
    expect(canvas?.style.pointerEvents).toBe('none');
  });

  it('ne rend rien quand désactivé dans les paramètres', () => {
    localStorage.setItem(CONFETTI_DISABLED_KEY, 'true');
    try {
      const { container } = render(<Confetti active={true} />);
      expect(container.querySelector('canvas')).toBeNull();
    } finally {
      localStorage.removeItem(CONFETTI_DISABLED_KEY);
    }
  });

  it('ne rend rien quand le système demande de réduire les animations', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('reduce'), media: query }))
    );
    try {
      const { container } = render(<Confetti active={true} />);
      expect(container.querySelector('canvas')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
