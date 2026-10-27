// @vitest-environment jsdom
/**
 * Tests de composant - PoolSpecialStatusModal (#1241)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));

import PoolSpecialStatusModal from './PoolSpecialStatusModal';

const left = { id: 'a', lastName: 'Dupont', firstName: 'Jean' } as any;
const right = { id: 'b', lastName: 'Martin', firstName: 'Marie' } as any;

describe('PoolSpecialStatusModal', () => {
  it('médical : titre et choix du tireur', () => {
    const onPick = vi.fn();
    render(
      <PoolSpecialStatusModal
        status="abandon"
        fencerLeft={left}
        fencerRight={right}
        onPick={onPick}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/sorti pour raison médicale/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Martin Marie'));
    expect(onPick).toHaveBeenCalledWith('right');
  });

  it('Annuler appelle onCancel ; tireur absent affiché « — »', () => {
    const onCancel = vi.fn();
    render(
      <PoolSpecialStatusModal
        status="exclusion"
        fencerLeft={left}
        fencerRight={null}
        onPick={vi.fn()}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Annuler'));
    expect(onCancel).toHaveBeenCalled();
  });
});
