// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GuidedTour from './GuidedTour';
import { readTourFlag, writeTourFlag, restartGuidedTour } from './guidedTourFlags';

const t = (k: string) => k;
const base = {
  t,
  onHighlightPhase: () => {},
  fencersCount: 0,
  checkedInCount: 0,
  pools: [],
  tableauMatchesCount: 0,
};

describe('GuidedTour', () => {
  beforeEach(() => localStorage.clear());

  it('se propose une fois sur une compétition vide', () => {
    render(<GuidedTour {...base} />);
    expect(screen.getByText('tour.hint_fencers')).toBeTruthy();
    expect(readTourFlag()).toBe('active');
  });

  it('ne se propose pas sur une compétition déjà remplie', () => {
    render(<GuidedTour {...base} fencersCount={10} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('passer le parcours le masque et ne le refait pas apparaître', () => {
    const { unmount } = render(<GuidedTour {...base} />);
    fireEvent.click(screen.getByText('tour.skip'));
    expect(screen.queryByRole('status')).toBeNull();
    unmount();
    render(<GuidedTour {...base} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('se relance depuis les paramètres', () => {
    writeTourFlag('done');
    render(<GuidedTour {...base} />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => restartGuidedTour());
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('met en évidence la phase de l’étape en cours', () => {
    writeTourFlag('active');
    const onHighlight = vi.fn();
    render(<GuidedTour {...base} onHighlightPhase={onHighlight} fencersCount={5} />);
    expect(onHighlight).toHaveBeenCalledWith('checkin');
  });
});
