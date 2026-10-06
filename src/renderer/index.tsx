/**
 * BellePoule Modern - React Entry Point
 * Licensed under GPL-3.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/main.css';
import './styles/formula.css';
import './styles/design.css';
/// <reference path="./types.d.ts" />

// Log unhandled rejections so they appear in DevTools console and don't silently crash
window.addEventListener('unhandledrejection', event => {
  console.error('[Renderer] Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent crash in some Electron versions
});

window.addEventListener('error', event => {
  console.error('[Renderer] Uncaught error:', event.error ?? event.message);
});

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
