/**
 * BellePoule Modern - React Error Boundary
 * Catches JavaScript errors in child component tree
 * Licensed under GPL-3.0
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}
interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
}
export declare class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props);
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    handleReset: () => void;
    render(): string | number | bigint | boolean | Iterable<React.ReactNode> | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | import("react/jsx-runtime").JSX.Element | null | undefined;
}
export declare class CompetitionErrorBoundary extends Component<Props> {
    render(): import("react/jsx-runtime").JSX.Element;
}
export declare class PoolErrorBoundary extends Component<Props> {
    render(): import("react/jsx-runtime").JSX.Element;
}
export declare class DatabaseErrorBoundary extends Component<Props> {
    render(): import("react/jsx-runtime").JSX.Element;
}
export declare const useErrorHandler: () => (error: Error, errorInfo?: ErrorInfo) => void;
export {};
//# sourceMappingURL=ErrorBoundary.d.ts.map