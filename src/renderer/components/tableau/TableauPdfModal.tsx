/**
 * BellePoule Modern - TableauPdfModal
 * Modal d'impression / export PDF des feuilles de match du tableau
 * Licensed under GPL-3.0
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { MAX_MATCHES_PER_PAGE_TABLEAU } from '../../../shared/utils/pdfConstants';
import { TableauMatch } from './tableauTypes';
import { getRoundName } from './tableauCalculations';

interface TableauPdfModalProps {
  pdfMode: 'print' | 'pdf' | 'preview';
  matches: TableauMatch[];
  pdfMatchesPerPage: number;
  setPdfMatchesPerPage: (n: number) => void;
  selectedRounds: Set<number>;
  setSelectedRounds: (rounds: Set<number>) => void;
  onExport: () => void;
  onClose: () => void;
}

// ─── Static style constants ───────────────────────────────────────────────────

const PDF_STYLES = {
  pdfModalBody: { padding: '1.5rem' } satisfies React.CSSProperties,
  pdfModalHint: {
    marginBottom: '1rem',
    color: '#6b7280',
    fontSize: '0.875rem',
  } satisfies React.CSSProperties,
  pdfModalLabel: {
    display: 'block',
    fontWeight: '600',
    marginBottom: '0.5rem',
  } satisfies React.CSSProperties,
  pdfModalMaxHint: { fontWeight: '400', color: '#6b7280' } satisfies React.CSSProperties,
  pdfModalBtnRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  } satisfies React.CSSProperties,
  pdfModalCountHint: {
    marginTop: '0.75rem',
    fontSize: '0.8rem',
    color: '#9ca3af',
  } satisfies React.CSSProperties,
  pdfModalFooter: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end' as const,
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const TableauPdfModal: React.FC<TableauPdfModalProps> = ({
  pdfMode,
  matches,
  pdfMatchesPerPage,
  setPdfMatchesPerPage,
  selectedRounds,
  setSelectedRounds,
  onExport,
  onClose,
}) => {
  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {pdfMode === 'print'
              ? 'Imprimer'
              : pdfMode === 'preview'
                ? 'Aperçu avant impression'
                : 'Export PDF'}{' '}
            – Feuilles de match
          </h3>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body" style={PDF_STYLES.pdfModalBody}>
          <p style={PDF_STYLES.pdfModalHint}>
            Chaque fiche contient le nom complet des combattants, une case score et une case
            signature.
          </p>
          <label style={PDF_STYLES.pdfModalLabel}>
            Matchs par feuille A4{' '}
            <span style={PDF_STYLES.pdfModalMaxHint}>(max {MAX_MATCHES_PER_PAGE_TABLEAU})</span>
          </label>
          <div style={PDF_STYLES.pdfModalBtnRow}>
            {Array.from({ length: MAX_MATCHES_PER_PAGE_TABLEAU }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setPdfMatchesPerPage(n)}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  background: pdfMatchesPerPage === n ? '#10b981' : '#e5e7eb',
                  color: pdfMatchesPerPage === n ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '1rem',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <label style={{ ...PDF_STYLES.pdfModalLabel, marginTop: '1rem' }}>Phases à inclure</label>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              marginBottom: '0.75rem',
            }}
          >
            {[...new Set(matches.filter(m => m.fencerA && m.fencerB && !m.isBye).map(m => m.round))]
              .sort((a, b) => b - a)
              .map(round => (
                <label
                  key={round}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedRounds.has(round)}
                    onChange={e => {
                      const next = new Set(selectedRounds);
                      if (e.target.checked) next.add(round);
                      else next.delete(round);
                      setSelectedRounds(next);
                    }}
                  />
                  {getRoundName(round)}
                  <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                    (
                    {
                      matches.filter(m => m.round === round && m.fencerA && m.fencerB && !m.isBye)
                        .length
                    }{' '}
                    match
                    {matches.filter(m => m.round === round && m.fencerA && m.fencerB && !m.isBye)
                      .length > 1
                      ? 's'
                      : ''}
                    )
                  </span>
                </label>
              ))}
          </div>
          {(() => {
            const count = matches.filter(
              m => selectedRounds.has(m.round) && !m.isBye && m.fencerA && m.fencerB
            ).length;
            return (
              <p style={PDF_STYLES.pdfModalCountHint}>
                {count} match{count > 1 ? 's' : ''} → {Math.ceil(count / pdfMatchesPerPage)} feuille
                {Math.ceil(count / pdfMatchesPerPage) > 1 ? 's' : ''}
              </p>
            );
          })()}
        </div>
        <div className="modal-footer" style={PDF_STYLES.pdfModalFooter}>
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={onExport}
            disabled={selectedRounds.size === 0}
          >
            {pdfMode === 'print'
              ? '🖨️ Imprimer'
              : pdfMode === 'preview'
                ? '👁️ Aperçu'
                : '📄 Générer PDF'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TableauPdfModal;
