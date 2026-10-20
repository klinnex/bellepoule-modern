/**
 * BellePoule Modern - Confirm Dialog Component
 * Remplace window.confirm() / window.prompt() natifs (focus Electron, prompt non supporté)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  placeholder?: string;
}

interface ConfirmContextType {
  confirm: (messageOrOptions: string | ConfirmOptions) => Promise<boolean>;
  prompt: (messageOrOptions: string | PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

interface PendingConfirm {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  // Présent uniquement en mode prompt
  input?: { placeholder?: string };
  resolve: (value: string | null) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [inputValue, setInputValue] = useState('');
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!pending) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    if (pending.input && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    } else {
      confirmBtnRef.current?.focus();
    }
  }, [pending]);

  const confirm = useCallback((messageOrOptions: string | ConfirmOptions): Promise<boolean> => {
    const options: ConfirmOptions =
      typeof messageOrOptions === 'string' ? { message: messageOrOptions } : messageOrOptions;

    return new Promise<boolean>(resolve => {
      setPending({
        message: options.message,
        confirmLabel: options.confirmLabel || 'OK',
        cancelLabel: options.cancelLabel || 'Annuler',
        resolve: value => resolve(value !== null),
      });
    });
  }, []);

  const prompt = useCallback((messageOrOptions: string | PromptOptions): Promise<string | null> => {
    const options: PromptOptions =
      typeof messageOrOptions === 'string' ? { message: messageOrOptions } : messageOrOptions;

    setInputValue(options.defaultValue ?? '');
    return new Promise<string | null>(resolve => {
      setPending({
        message: options.message,
        confirmLabel: options.confirmLabel || 'OK',
        cancelLabel: options.cancelLabel || 'Annuler',
        input: { placeholder: options.placeholder },
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    if (pending) {
      pending.resolve(pending.input ? inputValue : '');
      setPending(null);
      previousFocusRef.current?.focus();
    }
  };

  const handleCancel = () => {
    if (pending) {
      pending.resolve(null);
      setPending(null);
      previousFocusRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}

      {pending && (
        <div
          className="modal-overlay"
          onClick={handleCancel}
          onKeyDown={handleKeyDown}
          style={{ zIndex: 11000 }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '420px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <div className="modal-header">
              <h2 className="modal-title" id="confirm-dialog-title">
                Confirmation
              </h2>
            </div>
            <div className="modal-body">
              <p
                id="confirm-dialog-message"
                style={{ whiteSpace: 'pre-line', margin: pending.input ? '0 0 0.75rem' : 0 }}
              >
                {pending.message}
              </p>
              {pending.input && (
                <input
                  ref={inputRef}
                  type="text"
                  className="form-input w-full"
                  aria-labelledby="confirm-dialog-message"
                  placeholder={pending.input.placeholder}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                />
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                {pending.cancelLabel}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className="btn btn-primary"
                onClick={handleConfirm}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmContextType => {
  const context = useContext(ConfirmContext);
  if (!context) {
    // Fallback si utilisé en dehors du provider
    return {
      confirm: async (messageOrOptions: string | ConfirmOptions) => {
        const msg =
          typeof messageOrOptions === 'string' ? messageOrOptions : messageOrOptions.message;
        // eslint-disable-next-line no-alert
        return window.confirm(msg);
      },
      // window.prompt() non supporté par Electron : annulation
      prompt: async () => null,
    };
  }
  return context;
};

export default React.memo(ConfirmProvider);
