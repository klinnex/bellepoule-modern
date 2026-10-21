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

  it('le bouton annuler ferme la modale', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('actions.cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
