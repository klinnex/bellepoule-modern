/**
 * BellePoule Modern - TableauToolbar
 * Barre d'outils du tableau à élimination directe
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Fencer } from '../../../shared/types';

interface TableauToolbarProps {
  tableauSize: number;
  rankingCount: number;
  arenaCount: number;
  autoAssignArenas: boolean;
  onAutoAssignToggle: (enabled: boolean) => void;
  onBulkDeassign: () => void;
  onAutoFillScores: () => void;
  viewMode: 'full' | 'pending';
  onViewModeToggle: () => void;
  pyramidViewMode: boolean;
  onPyramidViewModeToggle: () => void;
  onPrintClick: () => void;
  onPreviewClick: () => void;
  onExportPdfClick: () => void;
  onExportTreeClick: () => void;
  champion: Fencer | null | undefined;
}

const TableauToolbarComponent: React.FC<TableauToolbarProps> = ({
  tableauSize,
  rankingCount,
  arenaCount,
  autoAssignArenas,
  onAutoAssignToggle,
  onBulkDeassign,
  onAutoFillScores,
  viewMode,
  onViewModeToggle,
  pyramidViewMode,
  onPyramidViewModeToggle,
  onPrintClick,
  onPreviewClick,
  onExportPdfClick,
  onExportTreeClick,
  champion,
}) => {
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Close FAB when clicking outside
  useEffect(() => {
    if (!fabOpen) return;
    const handler = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setFabOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fabOpen]);

  const closeAndRun = (fn: () => void) => {
    setFabOpen(false);
    fn();
  };

  return (
    <div className="tt-bar">
      {/* Left: title + champion */}
      <div className="tt-left">
        <h2 className="tt-title">
          Tableau de {tableauSize}
          <span className="tt-title-sub">— {rankingCount} qualifiés</span>
        </h2>
        {champion && (
          <div className="tt-champion">
            🏆 {champion.lastName} {champion.firstName}
          </div>
        )}
      </div>

      {/* Right: view toggles + FAB */}
      <div className="tt-right">
        {/* View mode toggles — toujours visibles */}
        <button
          onClick={onViewModeToggle}
          className={`tt-toggle${viewMode === 'pending' ? ' is-active' : ''}`}
          title={viewMode === 'full' ? 'Liste des matchs' : 'Tableau complet'}
        >
          {viewMode === 'full' ? '📋 Liste des matchs' : '📊 Tableau'}
        </button>
        <button
          onClick={onPyramidViewModeToggle}
          className={`tt-toggle${pyramidViewMode ? ' is-pyramid' : ''}`}
          title={pyramidViewMode ? 'Vue tableau' : 'Vue pyramidale'}
        >
          {pyramidViewMode ? '🔲 Tableau' : '🔺 Pyramide'}
        </button>

        {/* FAB */}
        <div className="tableau-fab-wrapper" ref={fabRef}>
          <button
            className="tableau-fab-trigger"
            onClick={() => setFabOpen(o => !o)}
            title="Options du tableau"
          >
            {fabOpen ? '✕' : '⋮'} Options
          </button>

          {fabOpen && (
            <div className="tableau-fab-menu">
              {arenaCount > 0 && (
                <>
                  <span className="tableau-fab-section-label">Pistes</span>
                  <label className={`tt-fab-check${autoAssignArenas ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={autoAssignArenas}
                      onChange={e => onAutoAssignToggle(e.target.checked)}
                    />
                    🏟️ Assignation auto
                  </label>
                  <button
                    className="tableau-fab-item tableau-fab-item--danger"
                    onClick={() => closeAndRun(onBulkDeassign)}
                  >
                    ❌ Désaffecter tout
                  </button>
                  <div className="tableau-fab-divider" />
                </>
              )}

              <span className="tableau-fab-section-label">Actions</span>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onAutoFillScores)}>
                🎲 Remplir auto (test)
              </button>

              <div className="tableau-fab-divider" />
              <span className="tableau-fab-section-label">Export</span>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onPrintClick)}>
                🖨️ Imprimer
              </button>
              <button
                className="tableau-fab-item"
                onClick={() => closeAndRun(onPreviewClick)}
                title="Ouvre un PDF dans le lecteur par défaut pour voir un aperçu avant d'imprimer"
              >
                👁️ Aperçu avant impression
              </button>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onExportPdfClick)}>
                📄 Export PDF
              </button>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onExportTreeClick)}>
                🌲 Arbre PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TableauToolbar = React.memo(TableauToolbarComponent);
export default TableauToolbar;
