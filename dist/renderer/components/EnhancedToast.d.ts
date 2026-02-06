/**
 * BellePoule Modern - Enhanced Toast Component
 * User-friendly notifications for errors and success
 * Licensed under GPL-3.0
 */
import React, { ReactNode } from 'react';
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
export declare const useToast: () => ToastContextType;
export declare const ToastProvider: React.FC<{
    children: ReactNode;
}>;
export declare const useToastHelpers: () => {
    success: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => void;
    error: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => void;
    warning: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => void;
    info: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => void;
};
export {};
//# sourceMappingURL=EnhancedToast.d.ts.map