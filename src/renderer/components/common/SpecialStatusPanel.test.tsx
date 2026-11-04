// @vitest-environment jsdom
/**
 * Tests de composant - SpecialStatusPanel (#1418)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));

import SpecialStatusPanel from './SpecialStatusPanel';

const a = { id: 'a', name: 'Dupont Jean' };
const b = { id: 'b', name: 'Martin Marie' };

describe('SpecialStatusPanel', () => {
  it('médical : confirme directement, sans question carton noir', () => {
    const onConfirm = vi.fn();
    render(
      <SpecialStatusPanel
        status="abandon"
        fencers={[a, b]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Martin Marie'));
    expect(onConfirm).toHaveBeenCalledWith('b', false);
  });

  it('exclusion : question carton noir, Oui => blackCard true', () => {
    const onConfirm = vi.fn();
    render(
      <SpecialStatusPanel
        status="exclusion"
        fencers={[a, b]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Dupont Jean'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Carton noir \?/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Oui'));
    expect(onConfirm).toHaveBeenCalledWith('a', true);
  });

  it('exclusion : Non => blackCard false', () => {
    const onConfirm = vi.fn();
    render(
      <SpecialStatusPanel
        status="exclusion"
        fencers={[a, b]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Martin Marie'));
    fireEvent.click(screen.getByText('Non'));
    expect(onConfirm).toHaveBeenCalledWith('b', false);
  });

  it('tireur absent désactivé ; Annuler appelle onCancel', () => {
    const onCancel = vi.fn();
    render(
      <SpecialStatusPanel
        status="forfait"
        fencers={[a, null]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText('—')).toBeDisabled();
    fireEvent.click(screen.getByText('Annuler'));
    expect(onCancel).toHaveBeenCalled();
  });
});
