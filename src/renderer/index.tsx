/**
 * BellePoule Modern - React Entry Point
 * Licensed under GPL-3.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyUiScale, loadUiScale } from './services/uiScale';
import './styles/main.css';
import './styles/formula.css';
import './styles/design.css';
import './styles/tokens.css';
import './styles/pool.css';
import './styles/tableau.css';
import './styles/training.css';
import './styles/utilities.css';
import './styles/components.css';
import './styles/extracted.css';
import './styles/extracted-2.css';
import { logger, LogCategory, toError } from '../shared/services/logger';
/// <reference path="./types.d.ts" />

// Log unhandled rejections so they appear in DevTools console and don't silently crash
window.addEventListener('unhandledrejection', event => {
  logger.error(LogCategory.UI, '[Renderer] Unhandled promise rejection:', toError(event.reason));
  event.preventDefault(); // Prevent crash in some Electron versions
});

window.addEventListener('error', event => {
  logger.error(LogCategory.UI, '[Renderer] Uncaught error:', toError(event.error ?? event.message));
});

// Taille du texte choisie dans les paramètres (#1156), avant le premier rendu
applyUiScale(loadUiScale());

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
