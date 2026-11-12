/**
 * BellePoule Modern - React Entry Point
 * Licensed under GPL-3.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyUiScale, loadUiScale } from './services/uiScale';
import { applyUiDensity, loadUiDensity } from './services/uiDensity';
import { installResizeGuard } from './services/resizeGuard';
import './styles/main.css';
import './styles/formula.css';
import './styles/design.css';
import './styles/phase-stepper.css';
import './styles/operation-progress.css';
import './styles/buttons.css';
import './styles/rank-medal.css';
import './styles/competition-list.css';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/pool.css';
import './styles/tableau.css';
import './styles/strips.css';
import './styles/training.css';
import './styles/remote-mode.css';
import './styles/book.css';
import './styles/utilities.css';
import './styles/components.css';
import './styles/dashboard.css';
import './styles/event-day.css';
import './styles/extracted.css';
import './styles/extracted-2.css';
import './styles/resize-guard.css';
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
applyUiDensity(loadUiDensity());
// Redimensionnement manuel : flou et animations coupés pendant le geste (#1652)
installResizeGuard();

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
