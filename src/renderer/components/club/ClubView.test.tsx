// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : espace permanent, annuaire des membres
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubView } from './ClubView';

const member = {
  id: 'm1',
  firstName: 'Anne',
  lastName: 'Martin',
  license: '123',
  weapons: [],
  active: true,
  cardCode: 'A1B2C3D4E5',
  createdAt: '',
  updatedAt: '',
};

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    getSettings: vi.fn().mockResolvedValue({ name: 'Cercle d’escrime' }),
    updateSettings: vi.fn().mockResolvedValue({ name: 'Nouveau nom' }),
    listMembers: vi.fn().mockResolvedValue([member]),
    createMember: vi.fn().mockResolvedValue(member),
    updateMember: vi.fn().mockResolvedValue(member),
    deleteMember: vi.fn(),
    regenerateCardCode: vi.fn(),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
});

describe('ClubView', () => {
  it('affiche le club, ses sous-onglets et les membres', async () => {
    render(<ClubView />);
    expect(await screen.findByRole('heading', { name: 'Cercle d’escrime' })).toBeInTheDocument();
    expect(await screen.findByText('MARTIN')).toBeInTheDocument();
    expect(screen.getByText('A1B2C3D4E5')).toBeInTheDocument();
    expect(screen.getByText('Membres (1)')).toBeInTheDocument();
    expect(api.listMembers).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Séances' }));
    expect(screen.getByText('Séances : bientôt disponible')).toBeInTheDocument();
  });

  it('ajoute un membre', async () => {
    render(<ClubView />);
    await screen.findByText('MARTIN');
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Paul' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Durand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(api.createMember).toHaveBeenCalledWith({
        firstName: 'Paul',
        lastName: 'Durand',
        license: '',
      })
    );
    expect(api.listMembers).toHaveBeenCalledTimes(2);
  });

  it('archive un membre, affiche les archivés', async () => {
    render(<ClubView />);
    await screen.findByText('MARTIN');
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('m1', { active: false }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Afficher les archivés' }));
    await waitFor(() => expect(api.listMembers).toHaveBeenLastCalledWith(true));
  });

  it('enregistre le nom du club', async () => {
    render(<ClubView />);
    const input = await screen.findByLabelText('Nom du club');
    await waitFor(() => expect(input).toHaveValue('Cercle d’escrime'));
    fireEvent.change(input, { target: { value: 'Nouveau nom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ name: 'Nouveau nom' }));
    expect(await screen.findByRole('heading', { name: 'Nouveau nom' })).toBeInTheDocument();
  });
});
