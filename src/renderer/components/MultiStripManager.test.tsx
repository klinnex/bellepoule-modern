// @vitest-environment jsdom
/**
 * Tests de composant - MultiStripManager
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));
import { MultiStripManager } from './MultiStripManager';

const setup = (stripCount = 3) => {
  const onClose = vi.fn();
  const onMatchAssigned = vi.fn();
  render(
    <MultiStripManager
      pools={[]}
      stripCount={stripCount}
      onMatchAssigned={onMatchAssigned}
      onClose={onClose}
    />
  );
  return { onClose, onMatchAssigned };
};

describe('MultiStripManager', () => {
  it('affiche le titre avec le nombre de pistes', () => {
    setup(3);
    expect(screen.getByText('multiStrip.title {"n":3}')).toBeInTheDocument();
  });

  it('rend une carte par piste', () => {
    setup(3);
    expect(screen.getByText('multiStrip.strip_n {"n":1}')).toBeInTheDocument();
    expect(screen.getByText('multiStrip.strip_n {"n":2}')).toBeInTheDocument();
    expect(screen.getByText('multiStrip.strip_n {"n":3}')).toBeInTheDocument();
  });

  it('le bouton fermer déclenche onClose', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });
});
