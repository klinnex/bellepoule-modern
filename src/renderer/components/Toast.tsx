/**
 * BellePoule Modern - Toast Notification System (unified)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { logger, LogCategory } from '@shared/services/logger';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  title?: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
  action?: { label: string; onClick: () => void };
}

interface ToastItem {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  persistent: boolean;
  action?: { label: string; onClick: () => void };
  createdAt: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

const TOAST_COLORS: Record<
  ToastType,
  { bg: string; border: string; text: string; accent: string }
> = {
  success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', accent: '#22c55e' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', accent: '#f59e0b' },
  error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', accent: '#ef4444' },
  info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', accent: '#3b82f6' },
};

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <XCircle size={18} />,
  info: <Info size={18} />,
};

const MAX_TOASTS = 3;

const ToastItemComponent: React.FC<{
  toast: ToastItem;
  onRemove: (id: number) => void;
}> = ({ toast, onRemove }) => {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colors = TOAST_COLORS[toast.type];

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (toast.persistent) return;
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(pct);
      if (pct === 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onRemove(toast.id);
      }
    }, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [toast.id, toast.duration, toast.persistent, onRemove]);

  return (
    <div
      role="alert"
      style={{
        background: '#ffffff',
        borderLeft: `4px solid ${colors.accent}`,
        borderRadius: '8px',
        padding: '12px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: '280px',
        maxWidth: '420px',
        transform: visible ? 'translateX(0)' : 'translateX(110%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1), opacity 0.28s ease',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span style={{ color: colors.accent, flexShrink: 0, marginTop: '1px' }}>
          {TOAST_ICONS[toast.type]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {toast.title && (
            <div
              style={{
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#111827',
                marginBottom: toast.message ? '2px' : 0,
              }}
            >
              {toast.title}
            </div>
          )}
          <div
            style={{
              fontSize: '0.8125rem',
              color: '#374151',
              lineHeight: 1.45,
              wordBreak: 'break-word',
            }}
          >
            {toast.message}
          </div>
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              style={{
                marginTop: '6px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                background: colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#9ca3af',
            padding: '1px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="Fermer"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      {!toast.persistent && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '3px',
            background: colors.accent,
            width: `${progress}%`,
            transition: 'width 50ms linear',
            opacity: 0.6,
          }}
        />
      )}
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', options?: ToastOptions) => {
      const id = ++toastId;
      const duration = options?.duration ?? (type === 'error' ? 6000 : 4000);
      const newToast: ToastItem = {
        id,
        type,
        message,
        title: options?.title,
        duration,
        persistent: options?.persistent ?? false,
        action: options?.action,
        createdAt: Date.now(),
      };
      setToasts(prev => {
        const next = [...prev, newToast];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
    },
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          bottom: '1.25rem',
          right: '1.25rem',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          pointerEvents: 'none',
          alignItems: 'flex-end',
        }}
      >
        {toasts.map(toast => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastItemComponent toast={toast} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (message: string) => {
        logger.warn(LogCategory.UI, 'Toast used outside provider', { message });
      },
    };
  }
  return context;
};

export default React.memo(ToastProvider);
