// @vitest-environment jsdom
/**
 * Tests de composant - SettingsModal (navigation par onglets + recherche)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
vi.mock('./LanguageSelector', () => ({ default: () => <label>Langue</label> }));
import SettingsModal from './SettingsModal';

const renderModal = () => render(<SettingsModal onClose={vi.fn()} onSave={vi.fn()} />);

beforeEach(() => {
  localStorage.clear();
});

describe('SettingsModal', () => {
  it("affiche un onglet par section et seulement le contenu de l'onglet actif", () => {
    renderModal();
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.getByRole('tab', { name: /Affichage/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Taille du texte')).toBeInTheDocument();
    expect(screen.queryByText('Notifications webhook')).not.toBeInTheDocument();
  });

  it("change d'onglet et mémorise le choix", () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: /Notifications/ }));
    expect(screen.getByText('Notifications webhook')).toBeInTheDocument();
    expect(screen.queryByText('Taille du texte')).not.toBeInTheDocument();
    expect(localStorage.getItem('bellepoule-settings-section')).toBe('notifications');
  });

  it('rouvre sur le dernier onglet utilisé', () => {
    localStorage.setItem('bellepoule-settings-section', 'system');
    renderModal();
    expect(screen.getByText('Parcours guidé')).toBeInTheDocument();
  });

  it('la recherche filtre toutes les sections (insensible aux accents)', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Rechercher un paramètre…'), {
      target: { value: 'mises a jour' },
    });
    expect(screen.getByText('Vérifier automatiquement les mises à jour')).toBeInTheDocument();
    expect(screen.queryByText('Taille du texte')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Saisie des scores/ })).toBeDisabled();
  });

  it('affiche un message si aucun résultat', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Rechercher un paramètre…'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('Aucun paramètre ne correspond.')).toBeInTheDocument();
  });
});

describe('SettingsModal – export / import des paramètres', () => {
  it('importe un fichier JSON (logo inclus) et met à jour le stockage', async () => {
    localStorage.setItem('bellepoule-settings-section', 'system');
    renderModal();
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const content = JSON.stringify({
      format: 'bellepoule-settings',
      version: 1,
      exportedAt: '2026-11-06T00:00:00.000Z',
      settings: { 'bellepoule-logo': logo, 'bellepoule-quick-mouse-scoring': 'true' },
    });
    const file = new File([content], 'p.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('settings-import-input'), { target: { files: [file] } });
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(localStorage.getItem('bellepoule-logo')).toBe(logo);
    expect(localStorage.getItem('bellepoule-quick-mouse-scoring')).toBe('true');
  });

  it('signale un fichier invalide', async () => {
    localStorage.setItem('bellepoule-settings-section', 'system');
    renderModal();
    const file = new File(['{}'], 'p.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('settings-import-input'), { target: { files: [file] } });
    expect(await screen.findByText(/Fichier invalide/)).toBeInTheDocument();
  });
});
