/**
 * BellePoule Modern - TableauPdfModal
 * Modal d'impression / export PDF des feuilles de match du tableau
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { MAX_MATCHES_PER_PAGE_TABLEAU } from '../../../shared/utils/pdfConstants';
import { TableauMatch } from './tableauTypes';
import { getRoundName } from './tableauCalculations';

interface TableauPdfModalProps {
  pdfMode: 'print' | 'pdf';
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
    color: 'var(--color-text-light)',
    fontSize: '0.875rem',
  } satisfies React.CSSProperties,
  pdfModalLabel: {
    display: 'block',
    fontWeight: '600',
    marginBottom: '0.5rem',
  } satisfies React.CSSProperties,
  pdfModalMaxHint: {
    fontWeight: '400',
    color: 'var(--color-text-light)',
  } satisfies React.CSSProperties,
  pdfModalBtnRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  } satisfies React.CSSProperties,
  pdfModalCountHint: {
    marginTop: '0.75rem',
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
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
  const { t } = useTranslation();
  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '400px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tableau-pdf-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="tableau-pdf-title">
            {pdfMode === 'print' ? t('tableauPdf.print') : t('tableauPdf.export')}{' '}
            {t('tableauPdf.sheets')}
          </h3>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={PDF_STYLES.pdfModalBody}>
          <p style={PDF_STYLES.pdfModalHint}>{t('tableauPdf.hint')}</p>
          <label style={PDF_STYLES.pdfModalLabel}>
            {t('tableauPdf.per_a4')}{' '}
            <span style={PDF_STYLES.pdfModalMaxHint}>
              {t('tableauPdf.max', { n: MAX_MATCHES_PER_PAGE_TABLEAU })}
            </span>
          </label>
          <div style={PDF_STYLES.pdfModalBtnRow}>
            {Array.from({ length: MAX_MATCHES_PER_PAGE_TABLEAU }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setPdfMatchesPerPage(n)}
                style={{
                  flex: 1,
                  padding: '0.6rem',
                  background: pdfMatchesPerPage === n ? '#10b981' : 'var(--color-border)',
                  color: pdfMatchesPerPage === n ? 'white' : 'var(--color-text)',
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
          <label style={{ ...PDF_STYLES.pdfModalLabel, marginTop: '1rem' }}>
            {t('tableauPdf.phases')}
          </label>
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
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                    (
                    {t('tableauPdf.matches', {
                      count: matches.filter(
                        m => m.round === round && m.fencerA && m.fencerB && !m.isBye
                      ).length,
                    })}
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
                {t('tableauPdf.matches', { count })} →{' '}
                {t('tableauPdf.sheets', { count: Math.ceil(count / pdfMatchesPerPage) })}
              </p>
            );
          })()}
        </div>
        <div className="modal-footer" style={PDF_STYLES.pdfModalFooter}>
          <button className="btn btn-secondary" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={onExport}
            disabled={selectedRounds.size === 0}
          >
            {pdfMode === 'print' ? t('tableauPdf.do_print') : t('tableauPdf.do_generate')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TableauPdfModal;
