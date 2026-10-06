/**
 * BellePoule Modern - Confirm Dialog Component
 * Remplace window.confirm() natif pour éviter les problèmes de focus dans Electron
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmContextType {
  confirm: (messageOrOptions: string | ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

interface PendingConfirm {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (value: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (pending && confirmBtnRef.current) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      confirmBtnRef.current.focus();
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
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    if (pending) {
      pending.resolve(true);
      setPending(null);
      previousFocusRef.current?.focus();
    }
  };

  const handleCancel = () => {
    if (pending) {
      pending.resolve(false);
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
    <ConfirmContext.Provider value={{ confirm }}>
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
              <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{pending.message}</p>
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
    };
  }
  return context;
};

export default React.memo(ConfirmProvider);
