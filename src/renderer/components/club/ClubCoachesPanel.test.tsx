// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club : maîtres d'armes du club et choix sur les séances
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubCoachesPanel } from './ClubCoachesPanel';
import { ClubCoachPicker, coachNames } from './ClubCoachPicker';
import type { ClubCoach } from '../../../shared/types/club';

const coach = (id: string, lastName: string, extra: Partial<ClubCoach> = {}): ClubCoach => ({
  id,
  clubId: 'c1',
  firstName: 'Jean',
  lastName,
  weapons: [],
  active: true,
  createdAt: '',
  updatedAt: '',
  ...extra,
});

let api: Record<string, ReturnType<typeof vi.fn>>;
const confirmSpy = vi.fn().mockResolvedValue(true);
vi.mock('../ConfirmDialog', () => ({ useConfirm: () => ({ confirm: confirmSpy }) }));

beforeEach(() => {
  api = {
    listCoaches: vi
      .fn()
      .mockResolvedValue([
        coach('k1', 'MARTIN', { title: "Maître d'armes" }),
        coach('k2', 'ANCIEN', { active: false }),
      ]),
    createCoach: vi.fn().mockResolvedValue(coach('k3', 'NOUVEAU')),
    updateCoach: vi.fn(),
    deleteCoach: vi.fn(),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
});

describe('ClubCoachesPanel', () => {
  it('liste les actifs, ajoute, archive et supprime', async () => {
    render(<ClubCoachesPanel clubId="c1" />);
    expect(await screen.findByText('MARTIN')).toBeInTheDocument();
    expect(screen.queryByText('ANCIEN')).not.toBeInTheDocument();
    expect(api.listCoaches).toHaveBeenCalledWith('c1', true);

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'NOUVEAU' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    await waitFor(() =>
      expect(api.createCoach).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ lastName: 'NOUVEAU' })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(api.updateCoach).toHaveBeenCalledWith('k1', { active: false }));

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(api.deleteCoach).toHaveBeenCalledWith('k1'));
  });
});

describe('ClubCoachPicker', () => {
  const coaches = [coach('k1', 'MARTIN'), coach('k2', 'ANCIEN', { active: false })];

  it('coche un maître d’armes ; archivé proposé seulement s’il est déjà choisi', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ClubCoachPicker coaches={coaches} value={[]} onChange={onChange} />
    );
    expect(screen.queryByText(/ANCIEN/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /MARTIN/ }));
    expect(onChange).toHaveBeenCalledWith(['k1']);
    rerender(<ClubCoachPicker coaches={coaches} value={['k2']} onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: /ANCIEN/ })).toBeChecked();
    expect(coachNames(['k2', 'k1', 'x'], coaches)).toBe('Jean ANCIEN, Jean MARTIN');
  });
});
