// @vitest-environment jsdom
/**
 * Tests CoachMark : aide ponctuelle avec « Ne plus afficher » (#1536).
 */
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
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

  it('garde la bulle dans la fenêtre quand l’ancre est au bord droit (#1543)', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 40,
      left: window.innerWidth - 60,
      right: window.innerWidth - 10,
      width: 50,
      height: 30,
      x: window.innerWidth - 60,
      y: 10,
      toJSON: () => ({}),
    });
    try {
      render(
        <CoachMark id="edge" dismissLabel="Fermer" message="Astuce">
          <button>ok</button>
        </CoachMark>
      );
      const tip = screen.getByText('Astuce') as HTMLElement;
      // Centre de l'ancre - moitié de la bulle + décalage : bord droit à 8 px de la fenêtre
      const left = parseFloat(tip.style.left);
      expect(left - 150 + 300).toBeLessThanOrEqual(window.innerWidth - 8);
      expect(left - 150).toBeGreaterThanOrEqual(8);
    } finally {
      width.mockRestore();
      rect.mockRestore();
    }
  });
});
