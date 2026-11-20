// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : menu global des séances (plusieurs ouvertes)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  openedAt: `${date}T10:00:00Z`,
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
    reopenSession: vi.fn(),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
};

const renderMenu = (props: Partial<React.ComponentProps<typeof ClubSessionMenu>> = {}) =>
  render(
    <ClubSessionMenu
      clubId="c1"
      revision={0}
      onChanged={vi.fn()}
      onPrepare={vi.fn()}
      onShow={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  confirmMock.mockReset().mockResolvedValue(true);
});

describe('ClubSessionMenu', () => {
  it('ouvre une séance prévue sans fermer la séance ouverte, puis l’affiche', async () => {
    setup([
      s('o', '2026-11-17', 'open'),
      s('p2', '2026-12-10', 'planned', 'Tard'),
      s('p1', '2026-12-01', 'planned', 'Tôt'),
    ]);
    const onShow = vi.fn();
    const onChanged = vi.fn();
    renderMenu({ onShow, onChanged });
    fireEvent.click(await screen.findByText(/Séance du 2026-11-17 ouverte/));
    const planned = within(screen.getByText('Séances prévues').nextElementSibling as HTMLElement);
    const items = planned.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('2026-12-01');
    expect(items[1]).toHaveTextContent('2026-12-10');
    fireEvent.click(within(items[0]).getByText('Ouvrir'));
    await waitFor(() => expect(api.startSession).toHaveBeenCalledWith('p1'));
    expect(api.closeSession).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(onShow).toHaveBeenCalledWith('p1');
    expect(onChanged).toHaveBeenCalled();
  });

  it('plusieurs séances ouvertes : affichage et fermeture de l’une d’elles', async () => {
    setup([s('a', '2026-11-16', 'open', 'Enfants'), s('b', '2026-11-17', 'open', 'Adultes')]);
    const onShow = vi.fn();
    renderMenu({ onShow });
    fireEvent.click(await screen.findByText(/2 séances ouvertes/));
    const rows = screen.getAllByRole('listitem');
    // La plus récente d'abord
    expect(rows[0]).toHaveTextContent('Adultes');
    fireEvent.click(within(rows[1]).getByText('Fermer la séance'));
    await waitFor(() => expect(api.closeSession).toHaveBeenCalledWith('a'));
    expect(api.closeSession).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByText('Afficher'));
    expect(onShow).toHaveBeenCalledWith('b');
  });

  it('rouvre une séance passée sans fermer la séance ouverte', async () => {
    setup([s('o', '2026-11-17', 'open'), s('c', '2026-11-10', 'closed')]);
    renderMenu();
    fireEvent.click(await screen.findByText(/Séance du .* ouverte/));
    fireEvent.click(await screen.findByText('Rouvrir'));
    await waitFor(() => expect(api.reopenSession).toHaveBeenCalledWith('c'));
    expect(api.closeSession).not.toHaveBeenCalled();
  });

  it('refus de confirmation : rien ne change', async () => {
    confirmMock.mockResolvedValue(false);
    setup([s('o', '2026-11-17', 'open')]);
    renderMenu();
    fireEvent.click(await screen.findByText(/Séance du .* ouverte/));
    fireEvent.click(await screen.findByText('Fermer la séance'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(api.closeSession).not.toHaveBeenCalled();
  });

  it('Préparer renvoie vers l’onglet Séances', async () => {
    setup([]);
    const onPrepare = vi.fn();
    renderMenu({ onPrepare });
    fireEvent.click(await screen.findByText(/Séances prévues/));
    fireEvent.click(await screen.findByText(/Préparer/));
    expect(onPrepare).toHaveBeenCalled();
  });
});
