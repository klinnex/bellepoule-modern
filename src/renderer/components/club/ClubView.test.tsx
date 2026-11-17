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
  clubId: 'c1',
  firstName: 'Anne',
  lastName: 'MARTIN',
  gender: 'F',
  birthYear: 2010,
  birthDate: '2010-02-01',
  laterality: 'L' as const,
  license: '123',
  weapons: [],
  active: true,
  cardCode: 'A1B2C3D4E5',
  createdAt: '',
  updatedAt: '',
};

let api: Record<string, ReturnType<typeof vi.fn>>;

/** Fichier choisi via « Importer » (boîte de dialogue du main) */
const openMemberFileMock = (result: { filePath: string; content: string }) => {
  (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI.dialog = {
    openFile: vi.fn().mockResolvedValue(result),
  };
};

beforeEach(() => {
  api = {
    getClub: vi.fn().mockResolvedValue({ id: 'c1', name: 'Cercle d’escrime', stripCount: 3 }),
    importPhotos: vi.fn().mockResolvedValue({ matched: 2, total: 3 }),
    updateClub: vi.fn().mockResolvedValue({ id: 'c1', name: 'Nouveau nom', stripCount: 3 }),
    listMembers: vi.fn().mockResolvedValue([member]),
    listCoaches: vi.fn().mockResolvedValue([]),
    listSessions: vi.fn().mockResolvedValue([]),
    remoteStatus: vi.fn().mockResolvedValue({ active: false, url: null, strips: 0 }),
    createMember: vi.fn().mockResolvedValue(member),
    updateMember: vi.fn().mockResolvedValue(member),
    deleteMember: vi.fn(),
    regenerateCardCode: vi.fn(),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
});

const confirmSpy = vi.fn().mockResolvedValue(true);
vi.mock('../ConfirmDialog', () => ({ useConfirm: () => ({ confirm: confirmSpy }) }));

describe('ClubView', () => {
  it('affiche le club, ses sous-onglets et les membres', async () => {
    render(<ClubView clubId="c1" onSelectClub={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Cercle d’escrime' })).toBeInTheDocument();
    expect(await screen.findByText('MARTIN')).toBeInTheDocument();
    expect(screen.getByText('A1B2C3D4E5')).toBeInTheDocument();
    // Identité présentée comme dans la liste des tireurs d'une compétition
    expect(screen.getByText('MARTIN')).toHaveClass('font-medium');
    expect(screen.getByRole('columnheader', { name: 'Né(e)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date de naissance de Anne MARTIN')).toHaveValue('2010-02-01');
    // Catégorie d'âge calculée d'après la date de naissance (saison en cours)
    expect(screen.getAllByRole('columnheader', { name: "Catégorie d'âge" }).length).toBe(1);
    expect(screen.getByText('Gaucher')).toBeInTheDocument();
    expect(screen.getByText('Membres (1)')).toBeInTheDocument();
    expect(api.listMembers).toHaveBeenCalledWith('c1', false);
    fireEvent.click(screen.getByRole('button', { name: 'Séances' }));
    expect(await screen.findByRole('button', { name: 'Ouvrir la séance' })).toBeInTheDocument();
  });

  it('ajoute un membre', async () => {
    render(<ClubView clubId="c1" onSelectClub={vi.fn()} />);
    await screen.findByText('MARTIN');
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau membre' }));
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Paul' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Durand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(api.createMember).toHaveBeenCalledWith('c1', {
        firstName: 'Paul',
        lastName: 'Durand',
      })
    );
    expect(api.listMembers).toHaveBeenCalledTimes(2);
  });

  it('archive un membre, affiche les archivés', async () => {
    render(<ClubView clubId="c1" onSelectClub={vi.fn()} />);
    await screen.findByText('MARTIN');
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('m1', { active: false }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Afficher les archivés' }));
    await waitFor(() => expect(api.listMembers).toHaveBeenLastCalledWith('c1', true));
  });

  it('enregistre le nom du club', async () => {
    render(<ClubView clubId="c1" onSelectClub={vi.fn()} />);
    const input = await screen.findByLabelText('Nom du club');
    await waitFor(() => expect(input).toHaveValue('Cercle d’escrime'));
    fireEvent.change(input, { target: { value: 'Nouveau nom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() => expect(api.updateClub).toHaveBeenCalledWith('c1', { name: 'Nouveau nom' }));
    expect(await screen.findByRole('heading', { name: 'Nouveau nom' })).toBeInTheDocument();
  });

  it('importe un fichier FFE .fff', async () => {
    api.importMembers = vi.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 1 });
    render(<ClubView clubId="c1" onSelectClub={vi.fn()} />);
    await screen.findByText('MARTIN');
    const fff = [
      'FFF;UTF8;competition;;individuel',
      '16/11/2026;E;M;M15;Open;Open',
      'MARTIN,Anne,01/02/2010,F,FRA;IDF,PARIS,75;123,IDF,CLUB,,;',
      'DURAND,Paul,03/04/2011,M,FRA;IDF,PARIS,75;456,IDF,CLUB,,;',
    ].join('\n');
    openMemberFileMock({ filePath: '/tmp/club.fff', content: fff });
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Importer (.fff, .csv, .xlsx)' }));
    // Sélection : MARTIN déjà présent (non importable), DURAND nouveau et coché
    expect(await screen.findByText('Déjà présent')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'MARTIN Anne' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'DURAND Paul' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Importer la sélection (1)' }));
    await waitFor(() => expect(api.importMembers).toHaveBeenCalled());
    const rows = api.importMembers.mock.calls[0][1] as { lastName: string; firstName: string }[];
    expect(rows.map(r => `${r.lastName} ${r.firstName}`)).toEqual(['DURAND Paul']);
  });

  it('importe un tableau CSV du club (colonne Nom)', async () => {
    api.importMembers = vi.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
    render(<ClubView clubId="c1" onSelectClub={vi.fn()} />);
    await screen.findByText('MARTIN');
    const csv = ['Nom;Prénom;Licence;Sexe', 'Durand;Paul;456;M', 'Martin;Anne;123;F'].join('\n');
    openMemberFileMock({ filePath: '/tmp/membres.csv', content: csv });
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Importer (.fff, .csv, .xlsx)' }));
    // Casse du fichier conservée ; Martin Anne est déjà présent (licence + sexe identiques)
    expect(await screen.findByRole('checkbox', { name: 'Durand Paul' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Martin Anne' })).toBeDisabled();
  });

  it('nombre de pistes enregistré, import des photos ZIP', async () => {
    (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI.dialog = {
      openFile: vi.fn().mockResolvedValue({ filePath: '/tmp/photos.zip' }),
    };
    render(<ClubView clubId="c1" onSelectClub={vi.fn()} />);
    const strips = await screen.findByLabelText('Nombre de pistes');
    await waitFor(() => expect(strips).toHaveValue(3));
    fireEvent.change(strips, { target: { value: '6' } });
    await waitFor(() => expect(api.updateClub).toHaveBeenCalledWith('c1', { stripCount: 6 }));
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Importer photos (.zip)' }));
    await waitFor(() => expect(api.importPhotos).toHaveBeenCalledWith('c1', '/tmp/photos.zip'));
  });
});
