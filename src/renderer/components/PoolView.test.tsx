// @vitest-environment jsdom
/**
 * Tests de composant - PoolView
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PoolView from './PoolView';
import { Pool, Fencer, Match, MatchStatus, Gender, FencerStatus } from '../../shared/types';

const fencer = (id: string, last: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: last,
  firstName: 'F',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const f1 = fencer('1', 'Dupont');
const f2 = fencer('2', 'Martin');

const finishedMatch: Match = {
  id: 'm',
  number: 1,
  fencerA: f1,
  fencerB: f2,
  scoreA: { value: 5, isVictory: true } as any,
  scoreB: { value: 2, isVictory: false } as any,
  status: MatchStatus.FINISHED,
  maxScore: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testPool: Pool = {
  id: 'p1',
  number: 1,
  phaseId: 'ph',
  fencers: [f1, f2],
  matches: [finishedMatch],
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PoolView - saisie simplifiée : suppression au survol', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      db: {
        getPoolSignatures: vi.fn().mockResolvedValue([]),
      },
      onPoolSignatureUpdated: vi.fn().mockReturnValue(() => {}),
    };
    localStorage.setItem('bellepoule-simplified-input-mode', 'true');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('survoler une case scorée puis appuyer sur Suppr efface le score du match', () => {
    const onMatchReset = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} onMatchReset={onMatchReset} />);

    const cell = screen.getByLabelText(/Dupont F contre Martin F/i);
    fireEvent.mouseEnter(cell);
    fireEvent.keyDown(document, { key: 'Delete' });

    expect(onMatchReset).toHaveBeenCalledTimes(1);
    expect(onMatchReset).toHaveBeenCalledWith(0);
  });

  it("n'efface rien si la souris ne survole aucune case", () => {
    const onMatchReset = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} onMatchReset={onMatchReset} />);

    fireEvent.keyDown(document, { key: 'Delete' });

    expect(onMatchReset).not.toHaveBeenCalled();
  });

  it('Suppr est sans effet hors saisie simplifiée', () => {
    localStorage.setItem('bellepoule-simplified-input-mode', 'false');
    const onMatchReset = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} onMatchReset={onMatchReset} />);

    const cell = screen.getByLabelText(/Dupont F contre Martin F/i);
    fireEvent.mouseEnter(cell);
    fireEvent.keyDown(document, { key: 'Delete' });

    expect(onMatchReset).not.toHaveBeenCalled();
  });
});

describe("PoolView - saisie simplifiée : correction d'un score enregistré (#1046)", () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      db: {
        getPoolSignatures: vi.fn().mockResolvedValue([]),
      },
      onPoolSignatureUpdated: vi.fn().mockReturnValue(() => {}),
    };
    localStorage.setItem('bellepoule-simplified-input-mode', 'true');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('préremplit la case avec le score enregistré', () => {
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/Martin F contre Dupont F/i));

    expect(screen.getByRole('spinbutton')).toHaveValue(2);
  });

  it("Entrée enregistre le nouveau score en gardant celui de l'adversaire", () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Martin F contre Dupont F/i));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onScoreUpdate).toHaveBeenCalledWith(0, 5, 3);
  });
});

describe('PoolView - couverture saisie, matrice et statuts (#1084)', () => {
  const pendingMatch: Match = {
    ...finishedMatch,
    id: 'm2',
    scoreA: undefined as any,
    scoreB: undefined as any,
    status: MatchStatus.NOT_STARTED,
  };
  const pendingPool: Pool = { ...testPool, matches: [pendingMatch] };

  // Après Entrée, la case miroir s'ouvre automatiquement : on saisit dans le champ ouvert.
  const typeScore = (value: string) => {
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };
  const enterBoth = (first: string, second: string) => {
    fireEvent.click(screen.getByLabelText(/Dupont F contre Martin F/i));
    typeScore(first);
    typeScore(second);
  };

  beforeEach(() => {
    (window as any).electronAPI = {
      db: { getPoolSignatures: vi.fn().mockResolvedValue([]) },
      onPoolSignatureUpdated: vi.fn().mockReturnValue(() => {}),
    };
    localStorage.setItem('bellepoule-simplified-input-mode', 'true');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('matrice : affiche victoire/défaite dans les cases du match terminé', () => {
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} />);

    expect(screen.getByLabelText(/Dupont F contre Martin F : victoire 5/i)).toHaveTextContent('V5');
    expect(screen.getByLabelText(/Martin F contre Dupont F : défaite 2/i)).toHaveTextContent('2');
  });

  it('matrice : case non saisie proposée à la saisie', () => {
    render(<PoolView pool={pendingPool} onScoreUpdate={vi.fn()} />);

    expect(screen.getAllByLabelText(/saisir le score/i)).toHaveLength(2);
  });

  it("en-tête : indique l'avancement puis « Terminée » selon pool.isComplete", () => {
    const { rerender } = render(<PoolView pool={pendingPool} onScoreUpdate={vi.fn()} />);
    expect(screen.getAllByText('0/1').length).toBeGreaterThan(0);

    rerender(<PoolView pool={{ ...testPool, isComplete: true }} onScoreUpdate={vi.fn()} />);
    expect(screen.getByText('Terminée')).toBeInTheDocument();
  });

  it("saisie des deux cases d'un match neuf : un seul onScoreUpdate avec les deux scores", () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Dupont F contre Martin F/i));
    typeScore('5');
    expect(onScoreUpdate).not.toHaveBeenCalled();

    typeScore('3');
    expect(onScoreUpdate).toHaveBeenCalledTimes(1);
    expect(onScoreUpdate).toHaveBeenCalledWith(0, 5, 3);
  });

  it('refuse un match nul', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    enterBoth('4', '4');

    expect(onScoreUpdate).not.toHaveBeenCalled();
  });

  it('refuse un score supérieur au maximum', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    enterBoth('9', '2');

    expect(onScoreUpdate).not.toHaveBeenCalled();
  });

  it('bouton « Annuler ce résultat » : déclenche onMatchReset sans ouvrir la saisie', () => {
    const onMatchReset = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} onMatchReset={onMatchReset} />);

    fireEvent.click(screen.getAllByLabelText('Annuler ce résultat')[0]);

    expect(onMatchReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('feuille signée par tous : bandeau de verrouillage et saisie bloquée', async () => {
    (window as any).electronAPI.db.getPoolSignatures = vi.fn().mockResolvedValue([
      { fencerId: '1', signature: 'x' },
      { fencerId: '2', signature: 'x' },
    ]);
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    expect(await screen.findByText(/scores verrouillés/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText(/saisir le score/i)[0]);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('tireur abandonné : case de la matrice marquée comme statut spécial', () => {
    const abandoned = { ...f2, status: FencerStatus.ABANDONED };
    const pool: Pool = {
      ...pendingPool,
      fencers: [f1, abandoned],
      matches: [{ ...pendingMatch, fencerB: abandoned }],
    };
    const { container } = render(<PoolView pool={pool} onScoreUpdate={vi.fn()} />);

    expect(container.querySelectorAll('.pool-cell').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Martin/).length).toBeGreaterThan(0);
  });
});
