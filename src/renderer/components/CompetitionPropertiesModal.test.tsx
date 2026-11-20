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

const formulaTab = () =>
  fireEvent.click(screen.getByRole('tab', { name: 'Formule de compétition' }));
const save = () => fireEvent.submit(document.querySelector('form') as HTMLFormElement);
const setValue = (sel: string, value: string) =>
  fireEvent.change(document.querySelector(sel) as HTMLInputElement, { target: { value } });

describe('CompetitionPropertiesModal', () => {
  it('affiche 3 onglets verticaux, sans « Configuration » (#2013)', () => {
    renderModal();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Informations générales',
      'Formule de compétition',
      'Arbitrage',
    ]);
    expect(document.querySelector('#title')).not.toBeNull();
    expect(document.querySelector('#poolMaxScore')).toBeNull();
  });

  it('frise Appel → Poules → Tableau → Classement ; réglages de la phase sélectionnée', () => {
    renderModal();
    formulaTab();
    expect(screen.getByTestId('formula-step-pool-1')).toBeInTheDocument();
    expect(screen.getByTestId('formula-step-tableau')).toBeInTheDocument();
    expect(document.querySelector('#poolMaxScore')).not.toBeNull();
    expect(document.querySelector('#poolSizeMin')).not.toBeNull();
    expect(document.querySelector('#tableMaxScore')).toBeNull();
    fireEvent.click(screen.getByTestId('formula-step-tableau'));
    expect(document.querySelector('#tableMaxScore')).not.toBeNull();
    expect(document.querySelector('#poolMaxScore')).toBeNull();
  });

  it('ajoute un tour de poules : qualifiés du tour 2 sur le tour 1, enregistrés', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    formulaTab();
    fireEvent.click(screen.getByText('＋ Tour de poules'));
    expect(screen.getByTestId('formula-step-pool-2')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('formula-step-pool-1'));
    setValue('#poolRoundQualifiers-0', '24');
    save();
    const settings = onSave.mock.calls[0][0].settings;
    expect(settings.poolRounds).toBe(2);
    expect(settings.poolRoundQualifiers).toEqual([24]);
  });

  it('retire le tableau : classement final sur les poules', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    formulaTab();
    fireEvent.click(screen.getByText('Retirer le tableau'));
    expect(screen.queryByTestId('formula-step-tableau')).toBeNull();
    save();
    expect(onSave.mock.calls[0][0].settings.hasDirectElimination).toBe(false);
  });

  it('taille de poule cible enregistrée dans la formule', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    formulaTab();
    setValue('#poolSizeMin', '6');
    setValue('#poolSizeMax', '7');
    save();
    expect(onSave.mock.calls[0][0].settings).toMatchObject({ poolSizeMin: 6, poolSizeMax: 7 });
  });

  it('relevé de cohérence : écart signalé, « Appliquer » rétablit la valeur attendue', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    formulaTab();
    expect(screen.getByTestId('formula-coherence')).not.toHaveClass('has-issues');
    setValue('#poolMaxScore', '4');
    expect(screen.getByTestId('formula-coherence')).toHaveClass('has-issues');
    fireEvent.click(screen.getByText('Appliquer'));
    expect((document.querySelector('#poolMaxScore') as HTMLInputElement).value).toBe('5');
  });

  it('passer de seniors à M13 ouvre le relevé : « Mettre à jour » applique 4 / 8', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    expect(screen.queryByTestId('coherence-category-alert')).toBeNull();
    fireEvent.change(document.querySelector('#category') as HTMLSelectElement, {
      target: { value: Category.U13 },
    });
    expect(screen.getByTestId('coherence-category-alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mettre à jour'));
    expect(screen.queryByTestId('coherence-category-alert')).toBeNull();
    save();
    expect(onSave.mock.calls[0][0].settings).toMatchObject({
      defaultPoolMaxScore: 4,
      defaultTableMaxScore: 8,
    });
  });

  it('« Garder » conserve les touches et masque l’alerte', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    fireEvent.change(document.querySelector('#category') as HTMLSelectElement, {
      target: { value: Category.U13 },
    });
    fireEvent.click(screen.getByText('Garder'));
    expect(screen.queryByTestId('coherence-category-alert')).toBeNull();
    save();
    expect(onSave.mock.calls[0][0].settings).toMatchObject({
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 15,
    });
  });

  it('signature des matchs de tableau dans Arbitrage', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    fireEvent.click(screen.getByRole('tab', { name: 'Arbitrage' }));
    fireEvent.click(screen.getByLabelText(/sign/i, { selector: 'input' }));
    save();
    expect(onSave.mock.calls[0][0].settings.signTableauMatches).toBe(true);
  });

  it('enregistre les valeurs saisies dans les autres onglets', () => {
    const onSave = vi.fn();
    renderModal(onSave);
    formulaTab();
    setValue('#poolMaxScore', '15');
    fireEvent.click(screen.getByRole('tab', { name: 'Arbitrage' }));
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].settings.defaultPoolMaxScore).toBe(15);
  });
});
