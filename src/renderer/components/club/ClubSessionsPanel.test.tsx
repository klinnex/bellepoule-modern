// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : séances, pistes, scores
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
vi.mock('../ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));
import { ClubSessionsPanel } from './ClubSessionsPanel';

const m = (id: string, lastName: string) => ({
  id,
  firstName: 'X',
  lastName,
  weapons: [],
  active: true,
  cardCode: 'A1B2C3D4E5',
  createdAt: '',
  updatedAt: '',
});
const session = {
  id: 's1',
  date: '2026-11-16',
  stripCount: 2,
  status: 'open',
  openedAt: '',
  attendeeIds: ['a', 'b'],
  createdAt: '',
  updatedAt: '',
};
const live = {
  id: 'bt1',
  sessionId: 's1',
  date: '2026-11-16',
  strip: 1,
  memberAId: 'a',
  memberBId: 'b',
  scoreA: 0,
  scoreB: 0,
  maxScore: 5,
  winnerId: null,
  status: 'in_progress',
  entryMode: 'master',
  createdAt: '',
  updatedAt: '',
};
const settings = { name: 'Club', stripCount: 2 };

let api: Record<string, ReturnType<typeof vi.fn>>;
let training: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    listSessions: vi.fn().mockResolvedValue([session]),
    listMembers: vi.fn().mockResolvedValue([m('a', 'ALPHA'), m('b', 'BRAVO'), m('c', 'CHARLIE')]),
    listBouts: vi.fn().mockResolvedValue([live]),
    createSession: vi.fn(),
    createBout: vi.fn().mockResolvedValue({ id: 'bt2' }),
    startBout: vi.fn(),
    finishBout: vi.fn(),
    cancelBout: vi.fn(),
    setAttendance: vi.fn(),
    closeSession: vi.fn(),
    reopenSession: vi.fn(),
    remoteStatus: vi.fn().mockResolvedValue({ active: false, url: null, strips: 0 }),
    pushBout: vi.fn().mockResolvedValue('ok'),
    releaseBout: vi.fn(),
  };
  training = {
    startServer: vi.fn().mockResolvedValue({ success: true }),
    startSession: vi.fn().mockResolvedValue({ success: true }),
    stopSession: vi.fn().mockResolvedValue({ success: true }),
    stopServer: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api, training };
});

describe('ClubSessionsPanel', () => {
  it('sans séance ouverte : ouvre la séance du jour avec les pistes du club', async () => {
    api.listSessions.mockResolvedValue([]);
    render(<ClubSessionsPanel settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la séance du jour' }));
    await waitFor(() =>
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ stripCount: 2, label: '' })
      )
    );
  });

  it('combat en cours sur la piste 1 : saisie du score et fin', async () => {
    render(<ClubSessionsPanel settings={settings} />);
    expect(await screen.findByText('Piste 1')).toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '5' } });
    fireEvent.change(inputs[1], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await waitFor(() =>
      expect(api.finishBout).toHaveBeenCalledWith('bt1', { scoreA: 5, scoreB: 3 })
    );
  });

  it('piste 2 libre : appariement manuel parmi les présents', async () => {
    render(<ClubSessionsPanel settings={settings} />);
    const a = await screen.findByLabelText('Tireur 1 — piste 2');
    // Seuls les présents (ALPHA, BRAVO) sont proposés
    expect(screen.queryAllByRole('option', { name: 'CHARLIE X' })).toHaveLength(0);
    fireEvent.change(a, { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Tireur 2 — piste 2'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    await waitFor(() =>
      expect(api.createBout).toHaveBeenCalledWith({
        sessionId: 's1',
        memberAId: 'a',
        memberBId: 'b',
        strip: 2,
      })
    );
    await waitFor(() => expect(api.startBout).toHaveBeenCalledWith('bt2'));
  });

  it('pointage et fermeture', async () => {
    render(<ClubSessionsPanel settings={settings} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'CHARLIE X' }));
    await waitFor(() => expect(api.setAttendance).toHaveBeenCalledWith('s1', 'c', true));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la séance' }));
    await waitFor(() => expect(api.closeSession).toHaveBeenCalledWith('s1'));
  });

  it('saisie distante : démarre le serveur, envoie les combats en cours aux tablettes', async () => {
    render(<ClubSessionsPanel settings={settings} />);
    const start = await screen.findByRole('button', { name: 'Activer la saisie distante' });
    api.remoteStatus.mockResolvedValue({ active: true, url: 'https://10.0.0.2:8066', strips: 2 });
    fireEvent.click(start);
    await waitFor(() =>
      expect(training.startServer).toHaveBeenCalledWith(undefined, undefined, true)
    );
    expect(training.startSession).toHaveBeenCalledWith(2, 'E');
    await waitFor(() => expect(api.pushBout).toHaveBeenCalledWith('bt1'));
    expect(
      await screen.findByText(/https:\/\/10\.0\.0\.2:8066\/areneN\/arbitre/)
    ).toBeInTheDocument();
    // Combat lancé ensuite : envoyé à la tablette de sa piste
    fireEvent.change(screen.getByLabelText('Tireur 1 — piste 2'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Tireur 2 — piste 2'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    await waitFor(() => expect(api.pushBout).toHaveBeenCalledWith('bt2'));
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(training.stopServer).toHaveBeenCalled());
  });

  it('annuler un combat libère la tablette', async () => {
    render(<ClubSessionsPanel settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler le combat' }));
    await waitFor(() => expect(api.releaseBout).toHaveBeenCalledWith('bt1'));
  });
});
