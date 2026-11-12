// @vitest-environment jsdom
/**
 * Tests de composant - EventDayModal (journée multi-épreuves, #1714)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
import { EventDayModal } from './EventDayModal';
import { Weapon, type Competition } from '../../shared/types';

const day = {
  id: 'd1',
  name: 'NEC',
  date: '2026-11-12',
  stripCount: 16,
  competitionIds: ['c1'],
  createdAt: '',
  updatedAt: '',
};
const competitions = [
  { id: 'c1', title: 'M15 Fleuret', weapon: Weapon.FOIL },
  { id: 'c2', title: 'M17 Épée', weapon: Weapon.EPEE },
] as unknown as Competition[];

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    list: vi.fn().mockResolvedValue([day]),
    create: vi.fn().mockResolvedValue({ ...day, id: 'd2', name: 'Autre' }),
    update: vi.fn(),
    delete: vi.fn(),
    setCompetitionDay: vi.fn().mockResolvedValue({ added: 2, updated: 0 }),
    listReferees: vi.fn().mockResolvedValue([
      {
        id: 'r1',
        eventDayId: 'd1',
        firstName: 'Anne',
        lastName: 'Martin',
        weapons: [Weapon.FOIL],
        createdAt: '',
        updatedAt: '',
      },
    ]),
    createReferee: vi.fn(),
    updateReferee: vi.fn(),
    deleteReferee: vi.fn(),
    syncReferees: vi.fn().mockResolvedValue({ added: 1, updated: 1 }),
    getOverview: vi.fn().mockResolvedValue({
      statuses: [
        {
          dayRefereeId: 'r1',
          state: 'busy',
          assignments: [
            {
              dayRefereeId: 'r1',
              competitionId: 'c1',
              competitionTitle: 'M15 Fleuret',
              refereeId: 'x',
              kind: 'pool',
              number: 2,
              strip: 3,
            },
          ],
        },
      ],
      conflicts: [],
    }),
    getBusyElsewhere: vi.fn(),
    getStripOccupation: vi.fn().mockResolvedValue([]),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { eventDay: api };
});

describe('EventDayModal', () => {
  it('affiche la journée, ses épreuves et le statut commun des arbitres', async () => {
    render(<EventDayModal competitions={competitions} onClose={vi.fn()} />);
    expect(await screen.findByText('Anne Martin')).toBeInTheDocument();
    expect(screen.getByText(/Piste 3 · M15 Fleuret \(Poule 2\)/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /M15 Fleuret/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /M17 Épée/ })).not.toBeChecked();
    expect(screen.getByText('Aucun conflit.')).toBeInTheDocument();
  });

  it('rattache une épreuve et reporte les arbitres', async () => {
    render(<EventDayModal competitions={competitions} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /M17 Épée/ }));
    await waitFor(() => expect(api.setCompetitionDay).toHaveBeenCalledWith('c2', 'd1'));
    expect(await screen.findByText('2 arbitre(s) ajouté(s), 0 mis à jour')).toBeInTheDocument();
  });

  it('ajoute un arbitre avec ses armes', async () => {
    render(<EventDayModal competitions={competitions} onClose={vi.fn()} />);
    await screen.findByText('Anne Martin');
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Paul' } });
    // « Nom » : nom de la journée puis nom de famille de l'arbitre
    fireEvent.change(screen.getAllByPlaceholderText('Nom').slice(-1)[0], {
      target: { value: 'Durand' },
    });
    fireEvent.click(document.getElementById(`new-ref-${Weapon.EPEE}`)!);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(api.createReferee).toHaveBeenCalledWith('d1', {
        firstName: 'Paul',
        lastName: 'Durand',
        club: '',
        weapons: [Weapon.EPEE],
      })
    );
  });
});
