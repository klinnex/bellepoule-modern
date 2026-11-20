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

vi.mock('../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

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

    const cell = screen.getByLabelText(/Dupont F poolView.cell_vs Martin F/i);
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

    const cell = screen.getByLabelText(/Dupont F poolView.cell_vs Martin F/i);
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

    fireEvent.click(screen.getByLabelText(/Martin F poolView.cell_vs Dupont F/i));

    expect(screen.getByRole('textbox')).toHaveValue('2');
  });

  it("Entrée enregistre le nouveau score en gardant celui de l'adversaire", () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Martin F poolView.cell_vs Dupont F/i));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onScoreUpdate).toHaveBeenCalledWith(0, 5, 3);
  });

  it('victoire au score max préremplie en « V » (#1990)', () => {
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/Dupont F poolView.cell_vs Martin F/i));

    expect(screen.getByRole('textbox')).toHaveValue('V');
  });

  it('Tab sur une case enregistrée non modifiée : case suivante, sans réenregistrer (#1990)', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Dupont F poolView.cell_vs Martin F/i));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });

    expect(onScoreUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('2');
  });

  it('Maj+Tab : case précédente (#1990)', () => {
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/Martin F poolView.cell_vs Dupont F/i));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab', shiftKey: true });

    expect(screen.getByRole('textbox')).toHaveValue('V');
  });

  it('chiffre sans ambiguïté : enregistré sans Entrée ni Tab (#1990)', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Martin F poolView.cell_vs Dupont F/i));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '4' } });

    expect(onScoreUpdate).toHaveBeenCalledWith(0, 5, 4);
  });

  it('égalité au score max refusée (#1990)', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Martin F poolView.cell_vs Dupont F/i));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'W5' } });

    expect(onScoreUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('');
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
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };
  const enterBoth = (first: string, second: string) => {
    fireEvent.click(screen.getByLabelText(/Dupont F poolView.cell_vs Martin F/i));
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

    expect(
      screen.getByLabelText(/Dupont F poolView.cell_vs Martin F : poolView.cell_victory 5/i)
    ).toHaveTextContent(/^V$/);
    expect(
      screen.getByLabelText(/Martin F poolView.cell_vs Dupont F : poolView.cell_defeat 2/i)
    ).toHaveTextContent('2');
  });

  it('matrice : case non saisie proposée à la saisie', () => {
    render(<PoolView pool={pendingPool} onScoreUpdate={vi.fn()} />);

    expect(screen.getAllByLabelText(/poolView.cell_enter/i)).toHaveLength(2);
  });

  it("en-tête : indique l'avancement puis « Terminée » selon pool.isComplete", () => {
    const { rerender } = render(<PoolView pool={pendingPool} onScoreUpdate={vi.fn()} />);
    expect(screen.getAllByText('0/1').length).toBeGreaterThan(0);

    rerender(<PoolView pool={{ ...testPool, isComplete: true }} onScoreUpdate={vi.fn()} />);
    expect(screen.getByText('poolView.finished')).toBeInTheDocument();
  });

  it("saisie des deux cases d'un match neuf : un seul onScoreUpdate avec les deux scores", () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Dupont F poolView.cell_vs Martin F/i));
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

  it('V = victoire au score maximum', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    enterBoth('v', '3');

    expect(onScoreUpdate).toHaveBeenCalledWith(0, 5, 3);
  });

  it('W+chiffre désigne le vainqueur d’une égalité (case saisie en premier)', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} tieBreakByVictory />);

    enterBoth('W4', '4');

    expect(onScoreUpdate).toHaveBeenCalledWith(0, 4, 4, 'A');
  });

  it('W+chiffre désigne le vainqueur d’une égalité (case miroir)', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} tieBreakByVictory />);

    enterBoth('4', 'W4');

    expect(onScoreUpdate).toHaveBeenCalledWith(0, 4, 4, 'B');
  });

  it('W refusé hors égalité', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} tieBreakByVictory />);

    enterBoth('W4', '2');

    expect(onScoreUpdate).not.toHaveBeenCalled();
  });

  it('W refusé si le départage par victoire est inactif', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    fireEvent.click(screen.getByLabelText(/Dupont F poolView.cell_vs Martin F/i));
    typeScore('W4');

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

    fireEvent.click(screen.getAllByLabelText('poolMatrix.reset')[0]);

    expect(onMatchReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('feuille signée par tous : bandeau de verrouillage et saisie bloquée', async () => {
    (window as any).electronAPI.db.getPoolSignatures = vi.fn().mockResolvedValue([
      { fencerId: '1', signature: 'x' },
      { fencerId: '2', signature: 'x' },
    ]);
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} />);

    expect(await screen.findByText('poolView.locked')).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText(/poolView.cell_enter/i)[0]);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
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

describe('PoolView - poule figée par le tableau (#1996)', () => {
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

  const freeze = (correcting: boolean) => ({
    correcting,
    onStartCorrection: vi.fn(),
    onEndCorrection: vi.fn(),
  });

  it('tableau tiré : bandeau, cases verrouillées, pas de saisie', () => {
    const f = freeze(false);
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} tableauFreeze={f} />);
    expect(screen.getByText('poolView.tableau_locked')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Martin F poolView.cell_vs Dupont F/i));
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByText('poolView.tableau_correction_start'));
    expect(f.onStartCorrection).toHaveBeenCalled();
  });

  it('mode correction : saisie possible, transmise pour vérification', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={onScoreUpdate} tableauFreeze={freeze(true)} />);
    expect(screen.getByText('poolView.tableau_correcting')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Martin F poolView.cell_vs Dupont F/i));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '4' } });
    expect(onScoreUpdate).toHaveBeenCalledWith(0, 5, 4);
  });
});

describe('PoolView - fenêtre de saisie du score (validatePoolScore, #1979 lot 4b)', () => {
  const pendingMatch: Match = {
    ...finishedMatch,
    id: 'm3',
    scoreA: undefined as any,
    scoreB: undefined as any,
    status: MatchStatus.NOT_STARTED,
  };
  const pendingPool: Pool = { ...testPool, matches: [pendingMatch] };

  /** Ouvre la fenêtre depuis la case (ligne, colonne), saisit gauche / droite, valide */
  const submit = (cell: RegExp, left: string, right: string, victory?: 'left' | 'right') => {
    fireEvent.click(screen.getByLabelText(cell));
    expect(screen.getByText('poolView.quick_score')).toBeInTheDocument();
    const [a, b] = screen.getAllByRole('spinbutton');
    fireEvent.change(a, { target: { value: left } });
    fireEvent.change(b, { target: { value: right } });
    if (victory) {
      const buttons = screen.getAllByRole('button', { name: 'V' });
      fireEvent.click(buttons[victory === 'left' ? 0 : 1]);
    }
    fireEvent.click(screen.getByRole('button', { name: 'actions.validate' }));
  };
  const DUPONT_VS_MARTIN = /Dupont F poolView.cell_vs Martin F/i;
  const MARTIN_VS_DUPONT = /Martin F poolView.cell_vs Dupont F/i;
  const args = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0];

  beforeEach(() => {
    (window as any).electronAPI = {
      db: { getPoolSignatures: vi.fn().mockResolvedValue([]) },
      onPoolSignatureUpdated: vi.fn().mockReturnValue(() => {}),
    };
    localStorage.setItem('bellepoule-simplified-input-mode', 'false');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('score valide : enregistré, sans vainqueur imposé', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} maxScore={5} />);
    submit(DUPONT_VS_MARTIN, '5', '3');
    expect(args(onScoreUpdate)).toEqual([0, 5, 3, undefined]);
  });

  it('vue inversée : scores remis dans l’ordre du match', () => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} maxScore={5} />);
    submit(MARTIN_VS_DUPONT, '5', '3');
    expect(args(onScoreUpdate)).toEqual([0, 3, 5, undefined]);
  });

  it.each([
    ['au-delà du score max', '6', '2'],
    ['égalité au score max (o.17)', '5', '5'],
    ['score négatif', '-1', '3'],
    ['égalité sans départage par victoire', '3', '3'],
  ])('refusé : %s', (_label, left, right) => {
    const onScoreUpdate = vi.fn();
    render(<PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} maxScore={5} />);
    submit(DUPONT_VS_MARTIN, left, right);
    expect(onScoreUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('poolView.quick_score')).toBeInTheDocument();
  });

  it('égalité + V à gauche : vainqueur A', () => {
    const onScoreUpdate = vi.fn();
    render(
      <PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} maxScore={5} tieBreakByVictory />
    );
    submit(DUPONT_VS_MARTIN, '3', '3', 'left');
    expect(args(onScoreUpdate)).toEqual([0, 3, 3, 'A']);
  });

  it('vue inversée, égalité + V à gauche : vainqueur B (tireur affiché à gauche)', () => {
    const onScoreUpdate = vi.fn();
    render(
      <PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} maxScore={5} tieBreakByVictory />
    );
    submit(MARTIN_VS_DUPONT, '3', '3', 'left');
    expect(args(onScoreUpdate)).toEqual([0, 3, 3, 'B']);
  });

  it('égalité sans V, départage actif : choix du vainqueur proposé, rien enregistré', () => {
    const onScoreUpdate = vi.fn();
    render(
      <PoolView pool={pendingPool} onScoreUpdate={onScoreUpdate} maxScore={5} tieBreakByVictory />
    );
    submit(DUPONT_VS_MARTIN, '3', '3');
    expect(screen.getByText('poolView.tie_choose_winner')).toBeInTheDocument();
    expect(onScoreUpdate).not.toHaveBeenCalled();
  });
});
