// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubTour } from './ClubTour';
import { CLUB_TOUR_KEY, restartClubTour } from './clubTourFlags';

const empty = { hasName: false, hasLogo: false, membersCount: 0, cardsPrinted: false };

beforeEach(() => localStorage.clear());

describe('ClubTour', () => {
  it('attend le chargement avant de démarrer', () => {
    render(<ClubTour ready={false} {...empty} />);
    expect(screen.queryByText('Bienvenue dans le Mode Club')).toBeNull();
  });

  it('démarre seul sur un club vide, met en évidence le nom', () => {
    const target = document.createElement('label');
    target.setAttribute('data-tour', 'club-name');
    document.body.appendChild(target);
    render(<ClubTour ready {...empty} />);
    expect(screen.getByText('Bienvenue dans le Mode Club')).toBeInTheDocument();
    expect(screen.getByText('Nommer le club').closest('li')).toHaveAttribute(
      'aria-current',
      'step'
    );
    expect(target).toHaveClass('tour-halo');
    expect(localStorage.getItem(CLUB_TOUR_KEY)).toBe('active');
    target.remove();
  });

  it('suit l’état réel, Suivant / Retour, passer', () => {
    const { rerender } = render(<ClubTour ready {...empty} />);
    rerender(<ClubTour ready {...empty} hasName />);
    expect(screen.getByText('Ajouter le logo (facultatif)').closest('li')).toHaveAttribute(
      'aria-current',
      'step'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('Ajouter les membres').closest('li')).toHaveAttribute(
      'aria-current',
      'step'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByText('Ajouter le logo (facultatif)').closest('li')).toHaveAttribute(
      'aria-current',
      'step'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Passer le guide' }));
    expect(screen.queryByText('Bienvenue dans le Mode Club')).toBeNull();
    expect(localStorage.getItem(CLUB_TOUR_KEY)).toBe('done');
  });

  it('terminé puis relancé par le bouton Guide', () => {
    localStorage.setItem(CLUB_TOUR_KEY, 'done');
    render(<ClubTour ready hasName hasLogo membersCount={2} cardsPrinted />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => restartClubTour());
    expect(screen.getByText('Votre club est prêt !')).toBeInTheDocument();
  });
});
