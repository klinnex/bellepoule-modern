// @vitest-environment jsdom
/**
 * Tests CoachMark : aide ponctuelle avec « Ne plus afficher » (#1536).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import CoachMark from './CoachMark';

describe('CoachMark', () => {
  beforeEach(() => localStorage.clear());

  it('affiche l’aide à la première apparition puis la masque définitivement', () => {
    const { unmount } = render(
      <CoachMark id="demo" dismissLabel="Fermer" message="Astuce">
        <button>ok</button>
      </CoachMark>
    );
    expect(screen.getByText('Astuce')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fermer'));
    expect(screen.queryByText('Astuce')).toBeNull();
    unmount();
    render(
      <CoachMark id="demo" dismissLabel="Fermer" message="Astuce">
        <button>ok</button>
      </CoachMark>
    );
    expect(screen.queryByText('Astuce')).toBeNull();
  });

  it('reste disponible au survol après fermeture, sans bouton de fermeture', () => {
    localStorage.setItem('bp_coach_demo', '1');
    render(
      <CoachMark id="demo" dismissLabel="Fermer" message="Astuce">
        <button>ok</button>
      </CoachMark>
    );
    fireEvent.mouseEnter(screen.getByText('ok').parentElement as HTMLElement);
    expect(screen.getByText('Astuce')).toBeInTheDocument();
    expect(screen.queryByText('Fermer')).toBeNull();
  });
});
