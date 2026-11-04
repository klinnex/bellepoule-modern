// @vitest-environment jsdom
/**
 * Tests de composant - AddFencerModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../contexts/TranslationContext', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import AddFencerModal from './AddFencerModal';

const setup = () => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  const { container } = render(<AddFencerModal onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose, container };
};

describe('AddFencerModal', () => {
  it('ajoute un tireur avec nom en majuscules puis ferme', () => {
    const { onAdd, onClose, container } = setup();
    fireEvent.change(screen.getByPlaceholderText('addFencer.last_name_ph'), {
      target: { value: 'dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText('addFencer.first_name_ph'), {
      target: { value: 'Jean' },
    });
    fireEvent.submit(container.querySelector('form')!);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].lastName).toBe('DUPONT');
    expect(onAdd.mock.calls[0][0].firstName).toBe('Jean');
    expect(onClose).toHaveBeenCalled();
  });

  it('ne soumet pas sans nom/prénom', () => {
    const { onAdd, container } = setup();
    fireEvent.submit(container.querySelector('form')!);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('annuler efface les champs sans fermer la modale', () => {
    const { onClose } = setup();
    const input = screen.getByPlaceholderText('addFencer.last_name_ph') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'dupont' } });
    fireEvent.click(screen.getByText('actions.cancel'));
    expect(input.value).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('droitier par défaut, gaucher transmis', () => {
    const { onAdd, container } = setup();
    fireEvent.change(screen.getByPlaceholderText('addFencer.last_name_ph'), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByPlaceholderText('addFencer.first_name_ph'), {
      target: { value: 'b' },
    });
    expect((screen.getByLabelText(/addFencer.right/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText(/addFencer.left/));
    fireEvent.submit(container.querySelector('form')!);
    expect(onAdd.mock.calls[0][0].handedness).toBe('L');
  });

  it('Ajouter garde la modale ouverte et vide le formulaire', () => {
    const { onAdd, onClose } = setup();
    const input = screen.getByPlaceholderText('addFencer.last_name_ph') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(screen.getByPlaceholderText('addFencer.first_name_ph'), {
      target: { value: 'b' },
    });
    fireEvent.click(screen.getByText('addFencer.add'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });
});
