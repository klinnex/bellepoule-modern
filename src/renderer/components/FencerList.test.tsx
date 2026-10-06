// @vitest-environment jsdom
/**
 * Tests de composant - FencerList
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('./ConfirmDialog', () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));

import FencerList from './FencerList';
import { Fencer, Gender, FencerStatus } from '../../shared/types';

const fencer = (id: string, last: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: last,
  firstName: 'Prenom',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.NOT_CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const setup = (over: Partial<Record<string, any>> = {}) => {
  const onAddFencer = vi.fn();
  const onCheckIn = vi.fn();
  render(
    <FencerList
      fencers={[fencer('1', 'Dupont'), fencer('2', 'Martin')]}
      onCheckIn={onCheckIn}
      onAddFencer={onAddFencer}
      {...(over as any)}
    />
  );
  return { onAddFencer, onCheckIn };
};

describe('FencerList', () => {
  it('affiche les tireurs', () => {
    setup();
    expect(screen.getByText('Dupont')).toBeInTheDocument();
    expect(screen.getByText('Martin')).toBeInTheDocument();
  });

  it('filtre via la recherche (debounce)', async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('Rechercher un tireur…'), {
      target: { value: 'martin' },
    });
    await waitFor(() => expect(screen.queryByText('Dupont')).not.toBeInTheDocument());
    expect(screen.getByText('Martin')).toBeInTheDocument();
  });

  it('le bouton ajouter déclenche onAddFencer', () => {
    const { onAddFencer } = setup();
    fireEvent.click(screen.getByRole('button', { name: /fencer\.add/ }));
    expect(onAddFencer).toHaveBeenCalled();
  });
});
