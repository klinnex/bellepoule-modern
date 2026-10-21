// @vitest-environment jsdom
/**
 * Tests de composant - LanguageSelector
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const changeLanguage = vi.fn();
const hookState = {
  language: 'fr',
  changeLanguage,
  availableLanguages: [
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
  ],
  isLoading: false,
  t: (k: string) =>
    ({ 'ui.language_label': 'Langue :', 'messages.loading': 'Chargement...' })[k] ?? k,
};
vi.mock('../hooks/useTranslation', () => ({ useTranslation: () => hookState }));

import LanguageSelector from './LanguageSelector';

beforeEach(() => {
  changeLanguage.mockClear();
  hookState.isLoading = false;
});

describe('LanguageSelector', () => {
  it('rend les langues disponibles', () => {
    render(<LanguageSelector />);
    expect(screen.getByText(/Français/)).toBeInTheDocument();
    expect(screen.getByText(/English/)).toBeInTheDocument();
  });

  it('applique directement le changement sans prop onLanguageChange', () => {
    render(<LanguageSelector />);
    fireEvent.change(screen.getByLabelText('Langue :'), { target: { value: 'en' } });
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });

  it('délègue à onLanguageChange si fourni (mode sélection)', () => {
    const onLanguageChange = vi.fn();
    render(<LanguageSelector onLanguageChange={onLanguageChange} />);
    fireEvent.change(screen.getByLabelText('Langue :'), { target: { value: 'en' } });
    expect(onLanguageChange).toHaveBeenCalledWith('en');
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it('affiche un état de chargement', () => {
    hookState.isLoading = true;
    render(<LanguageSelector />);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });
});
