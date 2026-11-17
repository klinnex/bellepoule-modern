// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubInventoryPanel } from './ClubInventoryPanel';

const item = (over = {}) => ({
  id: 'i1',
  clubId: 'c',
  name: 'Masque',
  category: 'mask',
  quantity: 3,
  purchasePrice: 40,
  condition: 'good',
  retired: false,
  lentQuantity: 1,
  availableQuantity: 2,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const loan = (over = {}) => ({
  id: 'l1',
  clubId: 'c',
  itemId: 'i1',
  itemName: 'Masque',
  memberId: 'm1',
  memberName: 'Ada Lovelace',
  quantity: 1,
  lentAt: '2026-10-01T10:00:00.000Z',
  dueDate: '2000-01-01',
  conditionOut: 'good',
  overdue: true,
  createdAt: '',
  updatedAt: '',
  ...over,
});

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    listItems: vi.fn().mockResolvedValue([
      item(),
      item({
        id: 'i2',
        name: 'Veste vieille',
        category: 'jacket',
        retired: true,
        lentQuantity: 0,
        availableQuantity: 0,
      }),
    ]),
    listLoans: vi.fn().mockResolvedValue([loan()]),
    listCategories: vi.fn().mockResolvedValue([
      {
        key: 'custom:c1',
        id: 'c1',
        clubId: 'c',
        name: 'Lames de rechange',
        itemCount: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]),
    listBrands: vi.fn().mockResolvedValue([]),
    createBrand: vi.fn().mockResolvedValue({}),
    renameBrand: vi.fn().mockResolvedValue({}),
    deleteBrand: vi.fn().mockResolvedValue(undefined),
    getInventoryLock: vi.fn().mockResolvedValue(false),
    setInventoryLock: vi.fn().mockImplementation(async (_c: string, locked: boolean) => locked),
    createCategory: vi.fn().mockResolvedValue({}),
    renameCategory: vi.fn().mockResolvedValue({}),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
    listMembers: vi.fn().mockResolvedValue([
      {
        id: 'm1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        active: true,
        weapons: [],
        cardCode: 'A',
        createdAt: '',
        updatedAt: '',
      },
    ]),
    createItem: vi.fn().mockResolvedValue({}),
    updateItem: vi.fn().mockResolvedValue({}),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    lendItem: vi.fn().mockResolvedValue({}),
    returnLoan: vi.fn().mockResolvedValue({}),
    deleteLoan: vi.fn().mockResolvedValue(undefined),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
  localStorage.clear();
});

describe('ClubInventoryPanel (inventaire du club)', () => {
  it('affiche le matériel actif, la synthèse et le prêt en retard ; les réformés sont masqués', async () => {
    render(<ClubInventoryPanel clubId="c" />);
    expect(await screen.findByText('Masque')).toBeInTheDocument();
    expect(screen.queryByText('Veste vieille')).toBeNull();
    const summary = screen.getByTestId('club-inventory-summary');
    expect(within(summary).getByText('3')).toBeInTheDocument(); // exemplaires
    expect(screen.getByText('En retard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /réformés/i }));
    expect(await screen.findByText('Veste vieille')).toBeInTheDocument();
  });

  it('colonnes : affiche ou masque, choix mémorisé', async () => {
    api.listItems.mockResolvedValue([item({ brand: 'Allstar', supplier: 'Escrime Shop' })]);
    const { unmount } = render(<ClubInventoryPanel clubId="c" />);
    expect(await screen.findByText('Masque')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Fournisseur' })).toBeNull();
    expect(screen.getByText('Allstar')).toBeInTheDocument(); // sous le nom, colonne masquée
    expect(screen.getByRole('columnheader', { name: 'Emplacement' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Colonnes' }));
    const menu = screen.getByRole('group', { name: /colonnes/i });
    fireEvent.click(within(menu).getByRole('checkbox', { name: 'Fournisseur' }));
    fireEvent.click(within(menu).getByRole('checkbox', { name: 'Emplacement' }));
    expect(screen.getByRole('columnheader', { name: 'Fournisseur' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Escrime Shop' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Emplacement' })).toBeNull();
    unmount();
    render(<ClubInventoryPanel clubId="c" />);
    expect(await screen.findByRole('columnheader', { name: 'Fournisseur' })).toBeInTheDocument();
  });

  it('prête un exemplaire à un tireur', async () => {
    render(<ClubInventoryPanel clubId="c" />);
    await screen.findByText('Masque');
    fireEvent.click(screen.getAllByRole('button', { name: 'Prêter' })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Tireur/), { target: { value: 'm1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Prêter' }));
    await waitFor(() =>
      expect(api.lendItem).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'i1', memberId: 'm1', quantity: 1 })
      )
    );
  });

  it('refuse de supprimer du matériel prêté (bouton désactivé)', async () => {
    render(<ClubInventoryPanel clubId="c" />);
    await screen.findByText('Masque');
    const del = screen.getAllByRole('button', { name: 'Supprimer' })[0];
    expect(del).toBeDisabled();
  });

  it('enregistre le retour avec l’état constaté', async () => {
    render(<ClubInventoryPanel clubId="c" />);
    await screen.findByText('Masque');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le retour' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/État au retour/), {
      target: { value: 'worn' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le retour' }));
    await waitFor(() =>
      expect(api.returnLoan).toHaveBeenCalledWith('l1', { conditionIn: 'worn', notes: undefined })
    );
  });

  it('mode consultation : verrou affiché, ajout et actions désactivés, export disponible', async () => {
    api.getInventoryLock.mockResolvedValue(true);
    render(<ClubInventoryPanel clubId="c" />);
    await screen.findByText('Masque');
    expect(screen.getByText('Consultation seule')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter du matériel/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Importer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Exporter \(CSV\)/ })).toBeEnabled();
  });

  it('le bouton Verrouiller bascule l’inventaire en consultation seule', async () => {
    render(<ClubInventoryPanel clubId="c" />);
    await screen.findByText('Masque');
    fireEvent.click(screen.getByRole('button', { name: 'Verrouiller' }));
    await waitFor(() => expect(api.setInventoryLock).toHaveBeenCalledWith('c', true));
    expect(await screen.findByText('Consultation seule')).toBeInTheDocument();
  });
});
