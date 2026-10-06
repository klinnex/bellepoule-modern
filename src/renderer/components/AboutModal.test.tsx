// @vitest-environment jsdom
/**
 * Tests de composant - AboutModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AboutModal from './AboutModal';

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('AboutModal', () => {
  it('affiche le titre et la licence', () => {
    render(<AboutModal onClose={vi.fn()} />);
    expect(screen.getByText('BellePoule Modern')).toBeInTheDocument();
    expect(screen.getByText(/GPL-3\.0/)).toBeInTheDocument();
  });

  it('bouton fermer déclenche onClose', () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);
    fireEvent.click(screen.getByTitle('Fermer'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('affiche un placeholder de version sans electronAPI', () => {
    render(<AboutModal onClose={vi.fn()} />);
    expect(screen.getByText('v…')).toBeInTheDocument();
  });

  it('affiche la version récupérée via electronAPI', async () => {
    (window as any).electronAPI = {
      getVersionInfo: vi.fn(async () => ({ version: '1.2.3', build: 42, date: '2026-01-01' })),
    };
    render(<AboutModal onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('v1.2.3')).toBeInTheDocument());
    expect(screen.getByText('#42')).toBeInTheDocument();
  });
});
