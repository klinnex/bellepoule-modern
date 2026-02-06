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
export declare const useToast: () => any;
export declare const ToastProvider: React.FC<{
    children: ReactNode;
}>;
export declare const useToastHelpers: () => {
    success: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => any;
    error: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => any;
    warning: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => any;
    info: (title: string, message?: string, options?: Partial<Omit<Toast, "id" | "type" | "title" | "message">>) => any;
};
//# sourceMappingURL=EnhancedToast.d.ts.map