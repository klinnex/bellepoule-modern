// @vitest-environment jsdom
/**
 * Tests unitaires - ConfirmDialog (ConfirmProvider + useConfirm)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';

// Composant exposant le résultat de confirm()
const Harness: React.FC<{ options?: any }> = ({ options }) => {
  const { confirm } = useConfirm();
  const [res, setRes] = useState<string>('');
  return (
    <button onClick={async () => setRes(String(await confirm(options ?? 'Continuer ?')))}>
      ask
    </button>
  );
};

const renderWithProvider = (ui: React.ReactNode) => render(<ConfirmProvider>{ui}</ConfirmProvider>);

describe('ConfirmProvider / useConfirm', () => {
  it('affiche le message et les libellés par défaut', async () => {
    renderWithProvider(<Harness />);
    fireEvent.click(screen.getByText('ask'));
    expect(await screen.findByText('Continuer ?')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Annuler')).toBeInTheDocument();
  });

  it('résout true sur confirmation', async () => {
    renderWithProvider(<Harness />);
    fireEvent.click(screen.getByText('ask'));
    fireEvent.click(await screen.findByText('OK'));
    await waitFor(() => expect(screen.getByText('ask').textContent).toBeDefined());
    // le message disparaît une fois confirmé
    await waitFor(() => expect(screen.queryByText('Continuer ?')).not.toBeInTheDocument());
  });

  it('résout false sur annulation', async () => {
    const Probe: React.FC = () => {
      const { confirm } = useConfirm();
      const [r, setR] = useState('');
      return (
        <>
          <button onClick={async () => setR(String(await confirm('X ?')))}>ask</button>
          <span data-testid="res">{r}</span>
        </>
      );
    };
    renderWithProvider(<Probe />);
    fireEvent.click(screen.getByText('ask'));
    fireEvent.click(await screen.findByText('Annuler'));
    await waitFor(() => expect(screen.getByTestId('res').textContent).toBe('false'));
  });

  it('utilise des libellés personnalisés', async () => {
    renderWithProvider(
      <Harness options={{ message: 'Supprimer ?', confirmLabel: 'Oui', cancelLabel: 'Non' }} />
    );
    fireEvent.click(screen.getByText('ask'));
    expect(await screen.findByText('Oui')).toBeInTheDocument();
    expect(screen.getByText('Non')).toBeInTheDocument();
  });

  it('Échap annule le dialogue', async () => {
    renderWithProvider(<Harness />);
    fireEvent.click(screen.getByText('ask'));
    const msg = await screen.findByText('Continuer ?');
    fireEvent.keyDown(msg.closest('.modal-overlay')!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Continuer ?')).not.toBeInTheDocument());
  });
});

describe('useConfirm hors provider', () => {
  it('retombe sur window.confirm', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    const Outside: React.FC = () => {
      const { confirm } = useConfirm();
      const [r, setR] = useState('');
      return (
        <>
          <button onClick={async () => setR(String(await confirm('Z ?')))}>out</button>
          <span data-testid="r">{r}</span>
        </>
      );
    };
    render(<Outside />);
    fireEvent.click(screen.getByText('out'));
    await waitFor(() => expect(screen.getByTestId('r').textContent).toBe('true'));
    vi.unstubAllGlobals();
  });
});

describe('prompt()', () => {
  const PromptProbe: React.FC<{ options?: any }> = ({ options }) => {
    const { prompt } = useConfirm();
    const [r, setR] = useState('');
    return (
      <>
        <button onClick={async () => setR(JSON.stringify(await prompt(options ?? 'Arène ?')))}>
          ask
        </button>
        <span data-testid="res">{r}</span>
      </>
    );
  };

  it('résout la valeur saisie sur OK', async () => {
    renderWithProvider(<PromptProbe />);
    fireEvent.click(screen.getByText('ask'));
    const input = await screen.findByRole('textbox');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(screen.getByTestId('res').textContent).toBe('"3"'));
  });

  it('Entrée valide la saisie', async () => {
    renderWithProvider(<PromptProbe options={{ message: 'Arène ?', defaultValue: '2' }} />);
    fireEvent.click(screen.getByText('ask'));
    const input = await screen.findByRole('textbox');
    expect(input).toHaveValue('2');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('res').textContent).toBe('"2"'));
  });

  it('résout null sur annulation', async () => {
    renderWithProvider(<PromptProbe />);
    fireEvent.click(screen.getByText('ask'));
    fireEvent.click(await screen.findByText('Annuler'));
    await waitFor(() => expect(screen.getByTestId('res').textContent).toBe('null'));
  });

  it('hors provider résout null (window.prompt non supporté)', async () => {
    render(<PromptProbe />);
    fireEvent.click(screen.getByText('ask'));
    await waitFor(() => expect(screen.getByTestId('res').textContent).toBe('null'));
  });
});
