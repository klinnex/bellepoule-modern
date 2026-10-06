// @vitest-environment jsdom
/**
 * Tests de composant - QRCodeShare
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QRCodeShare } from './QRCodeShare';
import { Competition } from '../../shared/types';

const competition = { id: 'c1', title: 'Open Test' } as unknown as Competition;

beforeEach(() => {
  (window as any).electronAPI = {
    remote: { getServerInfo: vi.fn(async () => ({ success: false })) },
  };
});
afterEach(() => {
  delete (window as any).electronAPI;
});

describe('QRCodeShare', () => {
  it('affiche le titre du mode résultats et les onglets', () => {
    render(<QRCodeShare competition={competition} onClose={vi.fn()} />);
    expect(screen.getByText(/Partager les résultats/)).toBeInTheDocument();
    expect(screen.getByText('🏆 Résultats')).toBeInTheDocument();
    expect(screen.getByText('✅ Pointage')).toBeInTheDocument();
  });

  it('affiche un message si le serveur distant n’est pas démarré', async () => {
    render(<QRCodeShare competition={competition} onClose={vi.fn()} />);
    expect(await screen.findByText(/serveur distant doit être démarré/i)).toBeInTheDocument();
  });

  it('bascule vers l’onglet pointage', () => {
    render(<QRCodeShare competition={competition} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('✅ Pointage'));
    expect(screen.getByText(/QR Code de pointage/)).toBeInTheDocument();
  });

  it('le bouton Fermer déclenche onClose', () => {
    const onClose = vi.fn();
    render(<QRCodeShare competition={competition} onClose={onClose} />);
    fireEvent.click(screen.getByText('Fermer'));
    expect(onClose).toHaveBeenCalled();
  });
});
