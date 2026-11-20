// @vitest-environment jsdom
/**
 * Tests de composant - CompetitionPropertiesModal (menu vertical par onglets, #1505)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
import CompetitionPropertiesModal from './CompetitionPropertiesModal';
import { Weapon, Gender, Category, type Competition } from '../../shared/types';

const competition = {
  id: 'c1',
  title: 'Open',
  date: new Date('2026-01-10'),
  weapon: Weapon.EPEE,
  gender: Gender.MALE,
  category: Category.SENIOR,
  settings: { hasDirectElimination: true },
} as unknown as Competition;

const renderModal = (onSave = vi.fn()) =>
  render(
    <CompetitionPropertiesModal competition={competition} onSave={onSave} onClose={vi.fn()} />
  );

describe('CompetitionPropertiesModal', () => {
  it("affiche 4 onglets verticaux et seulement le contenu de l'onglet actif", () => {
    renderModal();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Informations générales',
      'Configuration',
      'Formule de compétition',
      'Arbitrage',
    ]);
    expect(document.querySelector('#title')).not.toBeNull();
    expect(document.querySelector('#poolRounds')).toBeNull();
  });

  it('range scores, temps et cases à cocher dans des champs distincts de la formule', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Formule de compétition' }));
    const groups = ['Scores', 'Temps / chrono', 'Options'].map(name =>
      screen.getByRole('group', { name })
    );
    expect(groups[0].querySelector('#poolMaxScore')).not.toBeNull();
    expect(groups[1].querySelector('#poolTimerSeconds')).not.toBeNull();
    expect(groups[2].querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
  });

  it('place tours de poules et élimination directe dans Configuration', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    expect(document.querySelector('#poolRounds')).not.toBeNull();
    expect(document.querySelector('#hasDirectElimination')).not.toBeNull();
    expect(document.querySelector('#postPoolSplitCriteria')).not.toBeNull();
  });

  it('enregistre les valeurs saisies dans les autres onglets', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    fireEvent.click(screen.getByRole('tab', { name: 'Formule de compétition' }));
    fireEvent.change(document.querySelector('#poolMaxScore') as HTMLInputElement, {
      target: { value: '15' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Arbitrage' }));
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].settings.defaultPoolMaxScore).toBe(15);
  });
});
