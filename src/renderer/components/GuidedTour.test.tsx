// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MatchStatus } from '../../shared/types';
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
  tableauFinishedMatches: 0,
  remoteActive: false,
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
    fireEvent.click(screen.getByLabelText('tour.skip'));
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

  it('propose la saisie distante après la génération des poules', () => {
    writeTourFlag('active');
    render(<GuidedTour {...base} fencersCount={8} checkedInCount={8} pools={[{ matches: [] }]} />);
    expect(screen.getByText('tour.hint_remote')).toBeTruthy();
    expect(screen.getByText('tour.remote_explain')).toBeTruthy();
    expect(screen.getByText('tour.remote_mock_validate')).toBeTruthy();
  });

  it('met en évidence la phase de l’étape en cours', () => {
    writeTourFlag('active');
    const onHighlight = vi.fn();
    render(<GuidedTour {...base} onHighlightPhase={onHighlight} fencersCount={5} />);
    expect(onHighlight).toHaveBeenCalledWith('checkin');
  });

  it('revient à l’étape précédente avec le bouton Retour', () => {
    writeTourFlag('active');
    render(<GuidedTour {...base} fencersCount={5} />);
    expect(screen.getByText('tour.hint_checkin')).toBeTruthy();
    fireEvent.click(screen.getByText('tour.back'));
    expect(screen.getByText('tour.hint_fencers')).toBeTruthy();
    expect((screen.getByText('tour.back') as HTMLButtonElement).disabled).toBe(true);
  });

  it('entoure d’un halo les boutons utiles de l’étape', () => {
    writeTourFlag('active');
    document.body.innerHTML = '<button id="b" data-tour="add-fencer">+</button>';
    const { unmount } = render(<GuidedTour {...base} />);
    expect(document.getElementById('b')!.classList.contains('tour-halo')).toBe(true);
    unmount();
    expect(document.getElementById('b')!.classList.contains('tour-halo')).toBe(false);
  });

  it('propose l’édition d’un match de tableau en dernière étape', () => {
    writeTourFlag('active');
    render(
      <GuidedTour
        {...base}
        fencersCount={8}
        checkedInCount={8}
        pools={[{ matches: [{ status: MatchStatus.FINISHED }] }]}
        tableauMatchesCount={7}
      />
    );
    expect(screen.getByText('tour.hint_edit')).toBeTruthy();
  });

  it('Suivant avance d’une étape, Retour revient', () => {
    writeTourFlag('active');
    render(<GuidedTour {...base} fencersCount={5} />);
    fireEvent.click(screen.getByText('tour.next'));
    expect(screen.getByText('tour.hint_pools')).toBeTruthy();
    fireEvent.click(screen.getByText('tour.back'));
    expect(screen.getByText('tour.hint_checkin')).toBeTruthy();
  });

  it('refaire l’action après Retour fait avancer de nouveau', () => {
    writeTourFlag('active');
    const { rerender } = render(<GuidedTour {...base} fencersCount={5} />);
    fireEvent.click(screen.getByText('tour.back'));
    expect(screen.getByText('tour.hint_fencers')).toBeTruthy();
    rerender(<GuidedTour {...base} fencersCount={6} />);
    expect(screen.getByText('tour.hint_checkin')).toBeTruthy();
  });

  it('étape poules : explication glisser-déposer et halo sur Lancer quand la préparation est ouverte', () => {
    writeTourFlag('active');
    document.body.innerHTML = '<button id="l" data-tour="launch-pools">go</button>';
    render(<GuidedTour {...base} fencersCount={8} checkedInCount={8} prepOpen />);
    expect(screen.getByText('tour.hint_launch')).toBeTruthy();
    expect(screen.getByText('tour.prep_explain')).toBeTruthy();
    expect(document.getElementById('l')!.classList.contains('tour-halo-green')).toBe(true);
  });
});
