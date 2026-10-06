// @vitest-environment jsdom
/**
 * Tests unitaires - CommandPalette
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

beforeEach(() => {
  // jsdom n'implémente pas scrollIntoView
  (Element.prototype as any).scrollIntoView = vi.fn();
});

vi.mock('../contexts/TranslationContext', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import CommandPalette from './CommandPalette';
import { Competition } from '../../shared/types';

const comp = (id: string, title: string): Competition =>
  ({ id, title, weapon: 'E', category: 'SENIOR', fencers: [] }) as unknown as Competition;

const setup = (over: Partial<Record<string, any>> = {}) => {
  const props = {
    competitions: [comp('1', 'Coupe Alpha'), comp('2', 'Trophée Beta')],
    onClose: vi.fn(),
    onSelectCompetition: vi.fn(),
    onNewCompetition: vi.fn(),
    onOpenSettings: vi.fn(),
    ...over,
  };
  render(<CommandPalette {...(props as any)} />);
  return props;
};

describe('CommandPalette', () => {
  it('affiche les compétitions et les actions statiques', () => {
    setup();
    expect(screen.getByText('Coupe Alpha')).toBeInTheDocument();
    expect(screen.getByText('Trophée Beta')).toBeInTheDocument();
    expect(screen.getByText('menu.new_competition')).toBeInTheDocument();
    expect(screen.getByText('settings.title')).toBeInTheDocument();
  });

  it('filtre selon la requête', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'beta' } });
    expect(screen.getByText('Trophée Beta')).toBeInTheDocument();
    expect(screen.queryByText('Coupe Alpha')).not.toBeInTheDocument();
  });

  it('affiche un message si aucun résultat', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search commands'), {
      target: { value: 'zzz-introuvable' },
    });
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });

  it('clic sur une compétition déclenche la sélection', () => {
    const props = setup();
    fireEvent.click(screen.getByText('Coupe Alpha'));
    expect(props.onSelectCompetition).toHaveBeenCalledWith('1');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Échap ferme la palette', () => {
    const props = setup();
    fireEvent.keyDown(screen.getByLabelText('Search commands'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clic sur l’action « nouvelle compétition »', () => {
    const props = setup();
    fireEvent.click(screen.getByText('menu.new_competition'));
    expect(props.onNewCompetition).toHaveBeenCalled();
  });
});
