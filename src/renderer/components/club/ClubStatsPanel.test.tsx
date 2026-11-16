// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : statistiques par période
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubStatsPanel, scopeFilter } from './ClubStatsPanel';

const stats = (memberId: string, v: number, d: number) => ({
  memberId,
  bouts: v + d,
  victories: v,
  defeats: d,
  draws: 0,
  winRate: v / (v + d),
  touchesScored: 10,
  touchesReceived: 7,
  indice: 3,
  sessions: 2,
});
const member = (id: string, lastName: string) => ({
  id,
  firstName: 'X',
  lastName,
  weapons: [],
  active: true,
  cardCode: 'A1B2C3D4E5',
  createdAt: '',
  updatedAt: '',
});

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    listSessions: vi
      .fn()
      .mockResolvedValue([{ id: 's1', date: '2026-11-16', label: 'Soir', attendeeIds: [] }]),
    listMembers: vi.fn().mockResolvedValue([member('a', 'ALPHA'), member('b', 'BRAVO')]),
    getLeaderboard: vi.fn().mockResolvedValue([stats('a', 3, 1), stats('b', 1, 3)]),
    getMemberReport: vi.fn().mockResolvedValue({
      stats: stats('a', 3, 1),
      headToHead: [
        {
          opponentId: 'b',
          bouts: 4,
          victories: 3,
          defeats: 1,
          draws: 0,
          touchesScored: 18,
          touchesReceived: 12,
        },
      ],
      progression: [
        { period: { kind: 'month', key: '2026-10', from: '', to: '' }, stats: stats('a', 1, 1) },
        { period: { kind: 'month', key: '2026-11', from: '', to: '' }, stats: stats('a', 2, 0) },
      ],
    }),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
});

describe('scopeFilter', () => {
  it('saison, trimestre, mois, séance, tout', () => {
    expect(scopeFilter('season', '', '2026-11-16')).toEqual({
      from: '2026-09-01',
      to: '2027-08-31',
    });
    expect(scopeFilter('quarter', '', '2026-11-16')).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
    expect(scopeFilter('month', '', '2026-11-16')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(scopeFilter('session', 's1')).toEqual({ sessionId: 's1' });
    expect(scopeFilter('all', 's1')).toEqual({});
  });
});

describe('ClubStatsPanel', () => {
  it('classement de la saison, changement de période', async () => {
    render(<ClubStatsPanel />);
    expect(await screen.findByText('ALPHA')).toBeInTheDocument();
    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.stringMatching(/-09-01$/) })
    );
    fireEvent.change(screen.getByLabelText('Période'), { target: { value: 'session' } });
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenLastCalledWith({ sessionId: 's1' }));
  });

  it('fiche membre : progression par trimestre et face-à-face', async () => {
    render(<ClubStatsPanel />);
    fireEvent.click(await screen.findByText('ALPHA'));
    expect(await screen.findByText('2026-11')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Face-à-face' })).toBeInTheDocument();
    expect(screen.getByText('BRAVO X')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Regrouper par'), { target: { value: 'quarter' } });
    await waitFor(() =>
      expect(api.getMemberReport).toHaveBeenLastCalledWith('a', expect.any(Object), 'quarter')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retour au classement' }));
    expect(await screen.findByRole('heading', { name: 'Classement du club' })).toBeInTheDocument();
  });
});
