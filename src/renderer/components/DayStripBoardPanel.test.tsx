// @vitest-environment jsdom
/**
 * Pistes d'une journée en temps réel (#1878) : proposition d'une piste libérée, affectation,
 * réservation, affichage sans saisie distante ouverte.
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
import { DayStripBoardPanel } from './DayStripBoardPanel';
import { DEFAULT_STRIP_RULE } from '../../shared/utils/stripRules';
import type { DayStripBoard } from '../../shared/types/eventDay';

const competitions = [
  { id: 'c1', title: 'M15 Fleuret' },
  { id: 'c2', title: 'M17 Épée' },
];

const liveBoard: DayStripBoard = {
  live: true,
  autoAssign: false,
  strips: [
    {
      strip: 1,
      competitionId: 'c1',
      competitionTitle: 'M15 Fleuret',
      rule: DEFAULT_STRIP_RULE,
      candidates: [],
    },
    {
      strip: 2,
      competitionId: null,
      competitionTitle: null,
      rule: { ...DEFAULT_STRIP_RULE, pools: false, tableauMax: 8 },
      candidates: [
        {
          key: 'c2|match:8-1',
          competitionId: 'c2',
          competitionTitle: 'M17 Épée',
          kind: 'match',
          number: 1,
          tableauSize: 8,
          fencers: 'A – B',
          fromStrip: 1,
        },
      ],
    },
  ],
};

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    getStripBoard: vi.fn().mockResolvedValue(liveBoard),
    assignStrip: vi.fn().mockResolvedValue(true),
    setStripRule: vi.fn().mockResolvedValue(true),
    setAutoAssign: vi.fn().mockResolvedValue(true),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { eventDay: api };
});

describe('DayStripBoardPanel (#1878)', () => {
  it('piste occupée, piste libre avec proposition, réservation résumée', async () => {
    render(<DayStripBoardPanel dayId="d1" competitions={competitions} occupation={[]} />);
    expect(await screen.findByText('M15 Fleuret')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Travail en attente pour la piste 2' })
    ).toHaveValue('c2|match:8-1');
    expect(screen.getByText(/^Réservée :/)).toBeInTheDocument();
  });

  it('piste occupée : détail lu en base (poule en cours) quand il concerne la même épreuve', async () => {
    render(
      <DayStripBoardPanel
        dayId="d1"
        competitions={competitions}
        occupation={[
          {
            strip: 1,
            free: false,
            competitionId: 'c1',
            competitionTitle: 'M15 Fleuret',
            kind: 'pool',
            number: 2,
          },
        ]}
      />
    );
    expect(await screen.findByText('Poule 2 · M15 Fleuret')).toBeInTheDocument();
  });

  it('Affecter : la piste libre reçoit le travail choisi', async () => {
    render(<DayStripBoardPanel dayId="d1" competitions={competitions} occupation={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Affecter' }));
    await waitFor(() => expect(api.assignStrip).toHaveBeenCalledWith('d1', 2, 'c2|match:8-1'));
  });

  it('réservation : tableau de 8 enregistré pour une seule épreuve', async () => {
    render(<DayStripBoardPanel dayId="d1" competitions={competitions} occupation={[]} />);
    const buttons = await screen.findAllByRole('button', { name: 'Réservation' });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'M15 Fleuret' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Taille maximale du tableau' }), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(api.setStripRule).toHaveBeenCalledWith('d1', 1, {
        competitions: ['c2'],
        pools: true,
        tableau: true,
        tableauMax: 8,
      })
    );
  });

  it('affectation automatique activée depuis la case', async () => {
    render(<DayStripBoardPanel dayId="d1" competitions={competitions} occupation={[]} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Affecter automatiquement les pistes libérées' })
    );
    await waitFor(() => expect(api.setAutoAssign).toHaveBeenCalledWith('d1', true));
  });

  it('sans saisie distante : occupation prévue en base, sans proposition', async () => {
    api.getStripBoard.mockResolvedValue({
      live: false,
      autoAssign: false,
      strips: [{ ...liveBoard.strips[1], competitionId: null, candidates: [] }],
    });
    render(
      <DayStripBoardPanel
        dayId="d1"
        competitions={competitions}
        occupation={[
          {
            strip: 2,
            free: false,
            competitionId: 'c1',
            competitionTitle: 'M15 Fleuret',
            kind: 'pool',
            number: 3,
          },
        ]}
      />
    );
    expect(await screen.findByText(/^Aucune saisie distante ouverte/)).toBeInTheDocument();
    expect(screen.getByText('Poule 3 · M15 Fleuret')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Affecter' })).toBeNull();
  });
});
