// @vitest-environment jsdom
/**
 * Tests de composant - NewCompetitionModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import NewCompetitionModal from './NewCompetitionModal';
import { Weapon } from '../../shared/types';

const setup = () => {
  const onCreate = vi.fn();
  const onClose = vi.fn();
  const { container } = render(<NewCompetitionModal onCreate={onCreate} onClose={onClose} />);
  return { onCreate, onClose, container };
};

describe('NewCompetitionModal', () => {
  it('crée une compétition avec le titre saisi', () => {
    const { onCreate, container } = setup();
    fireEvent.change(screen.getByPlaceholderText('newCompetition.title_ph'), {
      target: { value: 'Mon Open' },
    });
    fireEvent.submit(container.querySelector('form')!);
    expect(onCreate).toHaveBeenCalledTimes(1);
    const data = onCreate.mock.calls[0][0];
    expect(data.title).toBe('Mon Open');
    expect(data.weapon).toBe(Weapon.EPEE);
    expect(data.date).toBeInstanceOf(Date);
  });

  it('génère un titre par défaut si vide', () => {
    const { onCreate, container } = setup();
    fireEvent.submit(container.querySelector('form')!);
    expect(onCreate.mock.calls[0][0].title).toMatch(/^Compétition du/);
  });

  it('le bouton annuler ferme la modale', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('actions.cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
