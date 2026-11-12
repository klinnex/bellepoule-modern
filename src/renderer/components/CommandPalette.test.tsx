// @vitest-environment jsdom
/**
 * Tests unitaires - CommandPalette
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

beforeEach(() => {
  // jsdom n'implémente pas scrollIntoView
  (Element.prototype as any).scrollIntoView = vi.fn();
});

vi.mock('../contexts/TranslationContext', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import CommandPalette from './CommandPalette';
import { Competition } from '../../shared/types';
import { registerPhases } from './competition/phaseRegistry';

const comp = (id: string, title: string): Competition =>
  ({ id, title, weapon: 'E', category: 'SENIOR', fencers: [] }) as unknown as Competition;

const setup = (over: Partial<Record<string, any>> = {}) => {
  const props = {
    competitions: [comp('1', 'Coupe Alpha'), comp('2', 'Trophée Beta')],
    onClose: vi.fn(),
    onSelectCompetition: vi.fn(),
    onNewCompetition: vi.fn(),
    onOpenSettings: vi.fn(),
    ...over,
  };
  render(<CommandPalette {...(props as any)} />);
  return props;
};

describe('CommandPalette', () => {
  it('propose la navigation vers les phases accessibles (#1536)', () => {
    const select = vi.fn();
    const off = registerPhases({
      phases: [
        { id: 'checkin', label: 'Appel', disabled: false },
        { id: 'pools', label: 'Poules', disabled: false },
      ],
      currentId: 'checkin',
      select,
    });
    const props = setup();
    expect(screen.queryByText('Appel')).toBeNull();
    fireEvent.click(screen.getByText('Poules'));
    expect(props.onClose).toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith('pools');
    off();
  });

  it('trouve un paramètre et ouvre son onglet (#1651)', () => {
    const props = setup();
    // t() renvoie la clé : « proxy_title » cible le paramètre Proxy de la section Système
    fireEvent.change(screen.getByLabelText('commandPalette.search_aria'), {
      target: { value: 'proxy_title' },
    });
    fireEvent.click(screen.getByText('settings.proxy_title'));
    expect(props.onOpenSettings).toHaveBeenCalledWith('system');
  });

  it('affiche les compétitions et les actions statiques', () => {
    setup();
    expect(screen.getByText('Coupe Alpha')).toBeInTheDocument();
    expect(screen.getByText('Trophée Beta')).toBeInTheDocument();
    expect(screen.getByText('menu.new_competition')).toBeInTheDocument();
    expect(screen.getByText('settings.title')).toBeInTheDocument();
  });

  it('filtre selon la requête', () => {
    setup();
    fireEvent.change(screen.getByLabelText('commandPalette.search_aria'), {
      target: { value: 'beta' },
    });
    expect(screen.getByText('Trophée Beta')).toBeInTheDocument();
    expect(screen.queryByText('Coupe Alpha')).not.toBeInTheDocument();
  });

  it('affiche un message si aucun résultat', () => {
    setup();
    fireEvent.change(screen.getByLabelText('commandPalette.search_aria'), {
      target: { value: 'zzz-introuvable' },
    });
    expect(screen.getByText('commandPalette.no_result')).toBeInTheDocument();
  });

  it('clic sur une compétition déclenche la sélection', () => {
    const props = setup();
    fireEvent.click(screen.getByText('Coupe Alpha'));
    expect(props.onSelectCompetition).toHaveBeenCalledWith('1');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Échap ferme la palette', () => {
    const props = setup();
    fireEvent.keyDown(screen.getByLabelText('commandPalette.search_aria'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clic sur l’action « nouvelle compétition »', () => {
    const props = setup();
    fireEvent.click(screen.getByText('menu.new_competition'));
    expect(props.onNewCompetition).toHaveBeenCalled();
  });

  it('« / » affiche les commandes et Entrée exécute', () => {
    const onRunCommand = vi.fn();
    setup({ onRunCommand });
    const input = screen.getByLabelText('commandPalette.search_aria');
    fireEvent.change(input, { target: { value: '/remote st' } });
    expect(screen.getByText('/remote start')).toBeInTheDocument();
    expect(screen.queryByText('Coupe Alpha')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRunCommand).toHaveBeenCalledWith('/remote start');
  });

  it('commande à argument : Entrée complète puis exécute', () => {
    const onRunCommand = vi.fn();
    setup({ onRunCommand });
    const input = screen.getByLabelText('commandPalette.search_aria') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/them' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRunCommand).not.toHaveBeenCalled();
    expect(input.value).toBe('/theme ');
    fireEvent.change(input, { target: { value: '/theme dark' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRunCommand).toHaveBeenCalledWith('/theme dark');
  });

  it('commande inconnue : Entrée la transmet telle quelle', () => {
    const onRunCommand = vi.fn();
    setup({ onRunCommand });
    const input = screen.getByLabelText('commandPalette.search_aria');
    fireEvent.change(input, { target: { value: '/zzz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRunCommand).toHaveBeenCalledWith('/zzz');
  });
});
