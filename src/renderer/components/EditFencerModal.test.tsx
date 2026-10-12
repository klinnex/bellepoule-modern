// @vitest-environment jsdom
/**
 * Tests de composant - EditFencerModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EditFencerModal from './EditFencerModal';
import { Fencer, Gender, FencerStatus } from '../../shared/types';

const fencer: Fencer = {
  id: 'f1',
  ref: 1,
  lastName: 'Dupont',
  firstName: 'Jean',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  club: 'CEP',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const setup = () => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const { container } = render(
    <EditFencerModal fencer={fencer} onSave={onSave} onClose={onClose} />
  );
  return { onSave, onClose, container };
};

describe('EditFencerModal', () => {
  it('préremplit les champs depuis le tireur', () => {
    setup();
    expect(screen.getByDisplayValue('Dupont')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Jean')).toBeInTheDocument();
  });

  it('enregistre les modifications (nom en majuscules) puis ferme', () => {
    const { onSave, onClose, container } = setup();
    fireEvent.change(screen.getByDisplayValue('Dupont'), { target: { value: 'martin' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toBe('f1');
    expect(onSave.mock.calls[0][1].lastName).toBe('MARTIN');
    expect(onSave.mock.calls[0][1].firstName).toBe('Jean');
    expect(onClose).toHaveBeenCalled();
  });

  it('le bouton fermer ferme la modale', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });
});
