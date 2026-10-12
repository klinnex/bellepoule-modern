// @vitest-environment jsdom
/**
 * Tests unitaires - Toast (ToastProvider + useToast)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

// Composant de test déclenchant un toast
const Trigger: React.FC<{ message: string; type?: any }> = ({ message, type }) => {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message, type)}>go</button>;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const renderWithProvider = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe('ToastProvider / useToast', () => {
  it('rend les enfants', () => {
    renderWithProvider(<div>contenu</div>);
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });

  it('affiche un toast au déclenchement', () => {
    renderWithProvider(<Trigger message="Sauvegardé" type="success" />);
    act(() => {
      fireEvent.click(screen.getByText('go'));
    });
    expect(screen.getByText('Sauvegardé')).toBeInTheDocument();
  });

  it('disparaît automatiquement après 4 s', () => {
    renderWithProvider(<Trigger message="Temporaire" />);
    act(() => {
      fireEvent.click(screen.getByText('go'));
    });
    expect(screen.getByText('Temporaire')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Temporaire')).not.toBeInTheDocument();
  });

  it('peut être fermé manuellement', () => {
    renderWithProvider(<Trigger message="Ferme-moi" />);
    act(() => {
      fireEvent.click(screen.getByText('go'));
    });
    const closeBtn = screen.getByText('✕');
    act(() => {
      fireEvent.click(closeBtn);
    });
    expect(screen.queryByText('Ferme-moi')).not.toBeInTheDocument();
  });

  it('conteneur annoncé via aria-live=polite', () => {
    renderWithProvider(<Trigger message="x" />);
    act(() => {
      fireEvent.click(screen.getByText('go'));
    });
    const region = document.querySelector('[role="status"][aria-live="polite"]');
    expect(region).not.toBeNull();
  });

  it('empile plusieurs toasts', () => {
    renderWithProvider(<Trigger message="Multi" />);
    act(() => {
      fireEvent.click(screen.getByText('go'));
    });
    act(() => {
      fireEvent.click(screen.getByText('go'));
    });
    expect(screen.getAllByText('Multi')).toHaveLength(2);
  });
});

describe('useToast hors provider', () => {
  it('fournit un showToast no-op sans planter', () => {
    const Outside: React.FC = () => {
      const { showToast } = useToast();
      return <button onClick={() => showToast('x')}>out</button>;
    };
    render(<Outside />);
    expect(() => fireEvent.click(screen.getByText('out'))).not.toThrow();
  });
});
