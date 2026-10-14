/**
 * BellePoule Modern - Enhanced Toast Component
 * User-friendly notifications for errors and success
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const ToastProvider_: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 11);
    const newToast: Toast = { ...toast, id };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration (default 5 seconds)
    if (!toast.persistent && toast.duration !== 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration || 5000);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const clearToasts = () => {
    setToasts([]);
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const getToastStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      padding: '16px',
      borderRadius: '8px',
      minWidth: '300px',
      maxWidth: '500px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
      opacity: isVisible ? 1 : 0,
      transition: 'all 0.3s ease-in-out',
      backgroundColor: '#fff',
    };

    switch (toast.type) {
      case 'success':
        return {
          ...baseStyle,
          borderLeft: '4px solid #10b981',
        };
      case 'error':
        return {
          ...baseStyle,
          borderLeft: '4px solid #ef4444',
        };
      case 'warning':
        return {
          ...baseStyle,
          borderLeft: '4px solid #f59e0b',
        };
      case 'info':
        return {
          ...baseStyle,
          borderLeft: '4px solid #3b82f6',
        };
      default:
        return baseStyle;
    }
  };

  const getIcon = (): string => {
    switch (toast.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  };

  return (
    <div style={getToastStyle()}>
      <div style={{ fontSize: '20px', lineHeight: 1 }}>{getIcon()}</div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 'bold',
            marginBottom: toast.message ? '4px' : '0',
            color: toast.type === 'error' ? '#dc2626' : 'var(--color-text)',
          }}
        >
          {toast.title}
        </div>
        {toast.message && (
          <div
            style={{
              fontSize: '14px',
              color: 'var(--color-text-light)',
              lineHeight: 1.4,
            }}
          >
            {toast.message}
          </div>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: toast.type === 'error' ? '#ef4444' : 'var(--color-primary)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
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
          fontSize: '18px',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          padding: '0',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
};

// ============================================================================
// Convenience Functions
// ============================================================================

export const useToastHelpers = () => {
  const { addToast } = useToast();

  return {
    success: (
      title: string,
      message?: string,
      options?: Partial<Omit<Toast, 'id' | 'type' | 'title' | 'message'>>
    ) => addToast({ type: 'success', title, message, ...options }),

    error: (
      title: string,
      message?: string,
      options?: Partial<Omit<Toast, 'id' | 'type' | 'title' | 'message'>>
    ) => addToast({ type: 'error', title, message, persistent: true, ...options }),

    warning: (
      title: string,
      message?: string,
      options?: Partial<Omit<Toast, 'id' | 'type' | 'title' | 'message'>>
    ) => addToast({ type: 'warning', title, message, ...options }),

    info: (
      title: string,
      message?: string,
      options?: Partial<Omit<Toast, 'id' | 'type' | 'title' | 'message'>>
    ) => addToast({ type: 'info', title, message, ...options }),
  };
};
export const ToastProvider = React.memo(ToastProvider_);
