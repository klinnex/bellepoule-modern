/**
 * BellePoule Modern - TableauToolbar
 * Barre d'outils du tableau à élimination directe
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Fencer } from '../../../shared/types';
import { useTranslation } from '../../hooks/useTranslation';

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
  onExportPdfClick,
  onExportTreeClick,
  champion,
}) => {
  const { t } = useTranslation();
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
          {t('tableauToolbar.title', { n: tableauSize })}
          <span className="tt-title-sub">{t('tableauToolbar.qualified', { n: rankingCount })}</span>
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
          title={
            viewMode === 'full' ? t('tableauToolbar.match_list') : t('tableauToolbar.full_bracket')
          }
        >
          {viewMode === 'full'
            ? `📋 ${t('tableauToolbar.match_list')}`
            : `📊 ${t('tableauToolbar.bracket')}`}
        </button>
        <button
          onClick={onPyramidViewModeToggle}
          className={`tt-toggle${pyramidViewMode ? ' is-pyramid' : ''}`}
          title={
            pyramidViewMode ? t('tableauToolbar.bracket_view') : t('tableauToolbar.pyramid_view')
          }
        >
          {pyramidViewMode
            ? `🔲 ${t('tableauToolbar.bracket')}`
            : `🔺 ${t('tableauToolbar.pyramid')}`}
        </button>

        {/* FAB */}
        <div className="tableau-fab-wrapper" ref={fabRef}>
          <button
            className="tableau-fab-trigger"
            onClick={() => setFabOpen(o => !o)}
            title={t('tableauToolbar.options_title')}
          >
            {fabOpen ? '✕' : '⋮'} {t('tableauToolbar.options')}
          </button>

          {fabOpen && (
            <div className="tableau-fab-menu">
              {arenaCount > 0 && (
                <>
                  <span className="tableau-fab-section-label">{t('tableauToolbar.strips')}</span>
                  <label className={`tt-fab-check${autoAssignArenas ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={autoAssignArenas}
                      onChange={e => onAutoAssignToggle(e.target.checked)}
                    />
                    {t('tableauToolbar.auto_assign')}
                  </label>
                  <button
                    className="tableau-fab-item tableau-fab-item--danger"
                    onClick={() => closeAndRun(onBulkDeassign)}
                  >
                    {t('tableauToolbar.unassign')}
                  </button>
                  <div className="tableau-fab-divider" />
                </>
              )}

              <span className="tableau-fab-section-label">{t('tableauToolbar.actions')}</span>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onAutoFillScores)}>
                {t('tableauToolbar.autofill')}
              </button>

              <div className="tableau-fab-divider" />
              <span className="tableau-fab-section-label">{t('tableauToolbar.export')}</span>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onPrintClick)}>
                {t('tableauToolbar.print')}
              </button>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onExportPdfClick)}>
                {t('tableauToolbar.export_pdf')}
              </button>
              <button className="tableau-fab-item" onClick={() => closeAndRun(onExportTreeClick)}>
                {t('tableauToolbar.tree_pdf')}
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
