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
import { translateStatic } from '../contexts/TranslationContext';

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

describe('Toast d’annulation (#1535)', () => {
  it('le bouton Annuler appelle le callback et ferme le toast', () => {
    const onUndo = vi.fn();
    const U: React.FC = () => {
      const { showUndoToast } = useToast();
      return <button onClick={() => showUndoToast('Supprimé', onUndo)}>undo-go</button>;
    };
    renderWithProvider(<U />);
    act(() => {
      fireEvent.click(screen.getByText('undo-go'));
    });
    const btn = screen.getByRole('alert').querySelectorAll('button')[0];
    act(() => {
      fireEvent.click(btn);
    });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Supprimé')).toBeNull();
  });

  it('Ctrl+Z annule la dernière action (une seule fois), pas dans un champ de saisie', () => {
    const onUndo = vi.fn();
    const U: React.FC = () => {
      const { showUndoToast } = useToast();
      return (
        <>
          <button onClick={() => showUndoToast('Retiré', onUndo)}>undo-go</button>
          <input aria-label="champ" />
        </>
      );
    };
    renderWithProvider(<U />);
    act(() => {
      fireEvent.click(screen.getByText('undo-go'));
    });
    fireEvent.keyDown(screen.getByLabelText('champ'), { key: 'z', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Retiré')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(onUndo).toHaveBeenCalledOnce();
  });
});

describe('Toast d’erreur actionnable (#1535)', () => {
  it('affiche l’échec suivi de la cause et de l’étape suivante', () => {
    const E: React.FC = () => {
      const { showActionableError } = useToast();
      return (
        <button
          onClick={() =>
            showActionableError('messages.import_failed', new Error('ENOSPC: no space left'))
          }
        >
          err-go
        </button>
      );
    };
    renderWithProvider(<E />);
    act(() => {
      fireEvent.click(screen.getByText('err-go'));
    });
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).toContain('—');
    expect(text).toContain(translateStatic('errors.hint_disk_full'));
  });
});
