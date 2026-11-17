// @vitest-environment jsdom
/**
 * Paramètres → Salles et pistes (#1880) : liste, création, édition (libellés de pistes
 * conservés), salle par défaut, suppression confirmée.
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
import VenuesSettingsSection, { resizeStrips } from './VenuesSettingsSection';
import { ConfirmProvider } from './ConfirmDialog';
import { ToastProvider } from './Toast';
import type { Venue } from '../../shared/types/appSettings';

const venue = (over: Partial<Venue> = {}): Venue => ({
  id: 'v1',
  name: 'Gymnase Nord',
  isDefault: true,
  strips: [{ number: 1, label: 'Piste bleue' }, { number: 2 }],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
});

let settings: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  settings = {
    listVenues: vi.fn(async () => [
      venue(),
      venue({ id: 'v2', name: 'Salle Sud', isDefault: false, strips: [{ number: 1 }] }),
    ]),
    upsertVenue: vi.fn(async (v: unknown) => v),
    setDefaultVenue: vi.fn(async () => undefined),
    deleteVenue: vi.fn(async () => undefined),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { settings };
});

const wrap = () =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <VenuesSettingsSection />
      </ConfirmProvider>
    </ToastProvider>
  );

describe('resizeStrips', () => {
  it('conserve les libellés, tronque ou complète', () => {
    expect(resizeStrips(venue(), 1)).toEqual([{ number: 1, label: 'Piste bleue' }]);
    expect(resizeStrips(venue(), 3)).toEqual([
      { number: 1, label: 'Piste bleue' },
      { number: 2 },
      { number: 3 },
    ]);
    expect(resizeStrips(undefined, 2)).toEqual([{ number: 1 }, { number: 2 }]);
  });
});

describe('VenuesSettingsSection', () => {
  it('liste les salles avec nombre de pistes et badge par défaut', async () => {
    wrap();
    expect(await screen.findByText('Gymnase Nord')).toBeInTheDocument();
    expect(screen.getByText('Salle Sud')).toBeInTheDocument();
    expect(screen.getByText('2 piste(s)')).toBeInTheDocument();
    expect(screen.getAllByText('Par défaut')).toHaveLength(1);
  });

  it('crée une salle', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une salle' }));
    fireEvent.change(screen.getByLabelText('Nom de la salle'), { target: { value: ' Halle ' } });
    fireEvent.change(screen.getByLabelText('Nombre de pistes'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(settings.upsertVenue).toHaveBeenCalledWith({
        name: 'Halle',
        strips: [{ number: 1 }, { number: 2 }],
      })
    );
  });

  it('refuse un nom vide', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une salle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le nom est obligatoire.');
    expect(settings.upsertVenue).not.toHaveBeenCalled();
  });

  it('modifie une salle en gardant les libellés de pistes', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Gymnase Nord' }));
    fireEvent.change(screen.getByLabelText('Nombre de pistes'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(settings.upsertVenue).toHaveBeenCalledWith({
        id: 'v1',
        name: 'Gymnase Nord',
        strips: [{ number: 1, label: 'Piste bleue' }, { number: 2 }, { number: 3 }],
      })
    );
  });

  it('définit la salle par défaut', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Définir par défaut Salle Sud' }));
    await waitFor(() => expect(settings.setDefaultVenue).toHaveBeenCalledWith('v2'));
  });

  it('supprime après confirmation seulement', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Salle Sud' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Supprimer')!
    );
    await waitFor(() => expect(settings.deleteVenue).toHaveBeenCalledWith('v2'));
  });

  it('affiche une erreur en toast si l’enregistrement échoue', async () => {
    settings.upsertVenue.mockRejectedValue(new Error('boom'));
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une salle' }));
    fireEvent.change(screen.getByLabelText('Nom de la salle'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Action impossible.')).toBeInTheDocument();
  });
});
