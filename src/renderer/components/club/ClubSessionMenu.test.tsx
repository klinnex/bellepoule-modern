// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : menu global des séances
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
const confirmMock = vi.fn();
vi.mock('../ConfirmDialog', () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
vi.mock('../Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
import { ClubSessionMenu } from './ClubSessionMenu';

const s = (id: string, date: string, status: string, label?: string) => ({
  id,
  clubId: 'c1',
  date,
  label,
  stripCount: 2,
  status,
  attendeeIds: [],
  plan: [],
  memberFeedback: {},
  createdAt: '',
  updatedAt: '',
});

let api: Record<string, ReturnType<typeof vi.fn>>;

const setup = (sessions: unknown[]) => {
  api = {
    listSessions: vi.fn().mockResolvedValue(sessions),
    listBouts: vi.fn().mockResolvedValue([]),
    closeSession: vi.fn(),
    startSession: vi.fn(),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
};

beforeEach(() => {
  confirmMock.mockReset().mockResolvedValue(true);
});

describe('ClubSessionMenu', () => {
  it('liste les séances prévues et en ouvre une', async () => {
    setup([s('p2', '2026-12-10', 'planned', 'Tard'), s('p1', '2026-12-01', 'planned', 'Tôt')]);
    const onChanged = vi.fn();
    render(<ClubSessionMenu clubId="c1" revision={0} onChanged={onChanged} onPrepare={vi.fn()} />);
    fireEvent.click(await screen.findByText(/Séances prévues/));
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('2026-12-01');
    expect(items[1]).toHaveTextContent('2026-12-10');
    fireEvent.click(screen.getAllByText('Ouvrir')[0]);
    await waitFor(() => expect(api.startSession).toHaveBeenCalledWith('p1'));
    expect(api.closeSession).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it('ferme la séance ouverte avant d’en ouvrir une autre, après confirmation', async () => {
    setup([s('o', '2026-11-17', 'open'), s('p1', '2026-12-01', 'planned')]);
    render(<ClubSessionMenu clubId="c1" revision={0} onChanged={vi.fn()} onPrepare={vi.fn()} />);
    fireEvent.click(await screen.findByText(/Séance du .* ouverte/));
    fireEvent.click(await screen.findByText('Ouvrir'));
    await waitFor(() => expect(api.startSession).toHaveBeenCalledWith('p1'));
    expect(api.closeSession).toHaveBeenCalledWith('o');
    expect(api.closeSession.mock.invocationCallOrder[0]).toBeLessThan(
      api.startSession.mock.invocationCallOrder[0]
    );
  });

  it('refus de confirmation : rien ne change', async () => {
    confirmMock.mockResolvedValue(false);
    setup([s('o', '2026-11-17', 'open')]);
    render(<ClubSessionMenu clubId="c1" revision={0} onChanged={vi.fn()} onPrepare={vi.fn()} />);
    fireEvent.click(await screen.findByText(/Séance du .* ouverte/));
    fireEvent.click(await screen.findByText('Fermer la séance'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(api.closeSession).not.toHaveBeenCalled();
  });

  it('Préparer renvoie vers l’onglet Séances', async () => {
    setup([]);
    const onPrepare = vi.fn();
    render(<ClubSessionMenu clubId="c1" revision={0} onChanged={vi.fn()} onPrepare={onPrepare} />);
    fireEvent.click(await screen.findByText(/Séances prévues/));
    fireEvent.click(await screen.findByText(/Préparer/));
    expect(onPrepare).toHaveBeenCalled();
  });
});
