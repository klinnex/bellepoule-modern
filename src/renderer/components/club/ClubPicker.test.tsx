// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : plusieurs clubs, section accueil
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubPicker, ClubsHomeSection } from './ClubPicker';

const club = (id: string, name: string, extra = {}) => ({
  id,
  name,
  stripCount: 2,
  createdAt: '',
  updatedAt: '',
  membersCount: 12,
  openSessionDate: null,
  ...extra,
});

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    listClubs: vi
      .fn()
      .mockResolvedValue([
        club('c1', 'Cercle Nord', { openSessionDate: '2026-11-16' }),
        club('c2', 'Salle Sud'),
      ]),
    createClub: vi.fn().mockResolvedValue({ id: 'c3', name: 'Nouveau' }),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
});

describe('ClubsHomeSection (Général)', () => {
  it('liste les clubs, ouvre le club choisi', async () => {
    const onOpen = vi.fn();
    render(<ClubsHomeSection onOpenClub={onOpen} />);
    expect(await screen.findByText('Cercle Nord')).toBeInTheDocument();
    expect(screen.getByText('Séance ouverte (2026-11-16)')).toBeInTheDocument();
    expect(screen.getAllByText('Membres : 12')).toHaveLength(2);
    fireEvent.click(screen.getByText('Salle Sud'));
    expect(onOpen).toHaveBeenCalledWith('c2');
    fireEvent.click(screen.getByRole('button', { name: 'Créer le club' }));
    expect(onOpen).toHaveBeenCalledWith(null);
  });

  it('aucun club : rien n’est affiché', async () => {
    api.listClubs.mockResolvedValue([]);
    const { container } = render(<ClubsHomeSection onOpenClub={vi.fn()} />);
    await waitFor(() => expect(api.listClubs).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ClubPicker (onglet Club)', () => {
  it('choisir un club existant ou en créer un', async () => {
    const onSelect = vi.fn();
    render(<ClubPicker onSelect={onSelect} />);
    fireEvent.click(await screen.findByText('Cercle Nord'));
    expect(onSelect).toHaveBeenCalledWith('c1');
    fireEvent.change(screen.getByLabelText('Nom du nouveau club'), {
      target: { value: 'Nouveau' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le club' }));
    await waitFor(() => expect(api.createClub).toHaveBeenCalledWith({ name: 'Nouveau' }));
    expect(onSelect).toHaveBeenCalledWith('c3');
  });

  it('premier club : message d’accueil', async () => {
    api.listClubs.mockResolvedValue([]);
    render(<ClubPicker onSelect={vi.fn()} />);
    expect(await screen.findByText(/Créez votre premier club/)).toBeInTheDocument();
  });
});
