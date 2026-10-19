// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Competition } from '../../shared/types';
import RapieresView from './RapieresView';

vi.mock('../../renderer/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../renderer/components/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('../../renderer/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, string>) => (p ? `${k}:${Object.values(p).join(',')}` : k),
  }),
}));

const competition = { id: 'c1', title: 'Rapières 2026' } as Competition;

describe('RapieresView (#1118)', () => {
  let saved: unknown;
  beforeEach(() => {
    saved = null;
    (window as any).electronAPI = {
      db: {
        getSessionState: vi.fn().mockResolvedValue(null),
        saveSessionState: vi.fn((_id: string, s: unknown) => {
          saved = s;
          return Promise.resolve();
        }),
      },
    };
  });

  it('inscription, poules, vague 1 et saisie des scores', async () => {
    render(<RapieresView competition={competition} />);
    await screen.findByText('rapieres.add_team');

    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
      const [teamName, last1, , last2] = screen.getAllByRole('textbox');
      fireEvent.change(teamName, { target: { value: name } });
      fireEvent.change(last1, { target: { value: `${name}-1` } });
      fireEvent.change(last2, { target: { value: `${name}-2` } });
      fireEvent.click(screen.getByText('rapieres.add_team'));
    }
    expect((saved as any).rapieres.teams).toHaveLength(4);
    expect((saved as any).rapieres.teams[0].status).toBe('not_checked_in');
    fireEvent.click(screen.getByText('rapieres.check_in_all'));
    await waitFor(() =>
      expect((saved as any).rapieres.teams.every((t: any) => t.status === 'checked_in')).toBe(true)
    );

    fireEvent.click(screen.getByText('rapieres.tab_pools'));
    fireEvent.click(screen.getByText('rapieres.generate_pools'));
    await screen.findByText('rapieres.pool_n:1');
    expect((saved as any).rapieres.bouts).toHaveLength(6);

    fireEvent.click(screen.getByText('rapieres.tab_waves'));
    fireEvent.click(screen.getByText('rapieres.launch_wave:1'));
    const wave = (await screen.findByText('rapieres.wave_n:1')).closest('.card') as HTMLElement;
    const inputs = within(wave).getAllByRole('spinbutton');
    expect(inputs).toHaveLength(4); // 2 rencontres, toutes les équipes tirent
    fireEvent.change(inputs[0], { target: { value: '5' } });
    fireEvent.change(inputs[1], { target: { value: '3' } });
    fireEvent.blur(inputs[1]);
    expect((saved as any).rapieres.bouts.filter((b: any) => b.scoreA === 5)).toHaveLength(1);
    // Vague 2 bloquée tant que la vague 1 n'est pas complète
    expect(screen.getByText('rapieres.launch_wave:2')).toBeDisabled();
  });

  it('édition d’une équipe, abandon puis réactivation', async () => {
    render(<RapieresView competition={competition} />);
    await screen.findByText('rapieres.add_team');
    const [teamName, last1, , last2] = screen.getAllByRole('textbox');
    fireEvent.change(teamName, { target: { value: 'Alpha' } });
    fireEvent.change(last1, { target: { value: 'A1' } });
    fireEvent.change(last2, { target: { value: 'A2' } });
    fireEvent.click(screen.getByText('rapieres.add_team'));

    fireEvent.click(screen.getByText('rapieres.edit'));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Alpha bis' } });
    fireEvent.click(screen.getByText('rapieres.save_team'));
    expect((saved as any).rapieres.teams).toHaveLength(1);
    expect((saved as any).rapieres.teams[0].name).toBe('Alpha bis');

    fireEvent.click(screen.getByText('rapieres.check_in'));
    await waitFor(() => expect((saved as any).rapieres.teams[0].status).toBe('checked_in'));
    fireEvent.click(screen.getByText('rapieres.abandon'));
    await waitFor(() => expect((saved as any).rapieres.teams[0].status).toBe('abandoned'));
    fireEvent.click(screen.getByText('rapieres.reactivate'));
    await waitFor(() => expect((saved as any).rapieres.teams[0].status).toBe('checked_in'));
  });
});
