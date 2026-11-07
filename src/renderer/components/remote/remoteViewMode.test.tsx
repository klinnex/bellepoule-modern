// @vitest-environment jsdom
/**
 * Tests du mode Basique / Expert de la Saisie distante (#1414)
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RemoteViewModeTabs from './RemoteViewModeTabs';
import { readRemoteViewMode, writeRemoteViewMode, remoteViewModeKey } from './remoteViewMode';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('remoteViewMode', () => {
  beforeEach(() => localStorage.clear());

  it('Basique par défaut', () => {
    expect(readRemoteViewMode('c1')).toBe('basic');
  });

  it('mémorise le choix par compétition', () => {
    writeRemoteViewMode('c1', 'expert');
    expect(readRemoteViewMode('c1')).toBe('expert');
    expect(readRemoteViewMode('c2')).toBe('basic');
    expect(localStorage.getItem(remoteViewModeKey('c1'))).toBe('expert');
  });

  it('valeur inconnue : retombe sur Basique', () => {
    localStorage.setItem(remoteViewModeKey('c1'), 'autre');
    expect(readRemoteViewMode('c1')).toBe('basic');
  });
});

describe('RemoteViewModeTabs', () => {
  it('affiche deux onglets et signale le changement', () => {
    const onChange = vi.fn();
    render(<RemoteViewModeTabs mode="basic" onChange={onChange} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByText('rsm.mode_basic').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByText('rsm.mode_expert'));
    expect(onChange).toHaveBeenCalledWith('expert');
  });
});
