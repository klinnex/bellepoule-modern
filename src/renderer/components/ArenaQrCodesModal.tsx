/**
 * BellePoule Modern - QR Codes des pistes (saisie distante)
 * Export PDF ou impression des QR Codes Arbitres et/ou Matchs, N par feuille (#1039).
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useToast } from './Toast';
import { savePDF } from '../../shared/utils/pdfExport/core';

export interface ArenaQrTarget {
  number: number;
  refereeUrl: string;
  matchOrderUrl: string;
}

interface ArenaQrCodesModalProps {
  arenas: ArenaQrTarget[];
  competitionTitle?: string;
  onClose: () => void;
}

/** QR par feuille → grille colonnes × lignes (A4 portrait) */
export const QR_PER_PAGE_LAYOUTS: Record<number, [number, number]> = {
  1: [1, 1],
  2: [1, 2],
  4: [2, 2],
  6: [2, 3],
  8: [2, 4],
  9: [3, 3],
  12: [3, 4],
  16: [4, 4],
};

export interface QrCard {
  title: string;
  subtitle: string;
  url: string;
  dataUrl: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildQrSheetsHTML(cards: QrCard[], perPage: number, heading = ''): string {
  const [cols, rows] = QR_PER_PAGE_LAYOUTS[perPage] ?? [2, 2];
  // A4 portrait, marges 10 mm : 190 × 277 mm utiles
  const cellW = 190 / cols;
  const cellH = 277 / rows;
  const qrSize = Math.max(20, Math.min(cellW - 10, cellH - 24));
  const titleSize = Math.max(8, Math.min(22, qrSize / 5));
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += perPage) {
    const cells = cards
      .slice(i, i + perPage)
      .map(
        c => `<div class="cell">
          <div class="t">${esc(c.title)}</div>
          <div class="s">${esc(c.subtitle)}</div>
          <img src="${c.dataUrl}" alt="" />
          <div class="u">${esc(c.url)}</div>
        </div>`
      )
      .join('');
    pages.push(`<div class="page">${cells}</div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(heading || 'QR Codes')}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; color: #111; }
    .page {
      width: 190mm; height: 277mm;
      display: grid;
      grid-template-columns: repeat(${cols}, ${cellW}mm);
      grid-template-rows: repeat(${rows}, ${cellH}mm);
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .cell {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      border: 0.3mm dashed #bbb; padding: 2mm; overflow: hidden; text-align: center;
    }
    .t { font-weight: 800; font-size: ${titleSize}pt; }
    .s { font-size: ${Math.max(6, titleSize * 0.6)}pt; color: #555; margin-bottom: 1.5mm; }
    img { width: ${qrSize}mm; height: ${qrSize}mm; }
    .u { font-size: ${Math.max(5, titleSize * 0.4)}pt; color: #777; margin-top: 1mm; word-break: break-all; }
  </style></head><body>${pages.join('')}</body></html>`;
}

const ArenaQrCodesModal: React.FC<ArenaQrCodesModalProps> = ({
  arenas,
  competitionTitle,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { showToast } = useToast();
  const [withReferee, setWithReferee] = useState(true);
  const [withMatches, setWithMatches] = useState(false);
  const [perPage, setPerPage] = useState(4);
  const [busy, setBusy] = useState(false);

  const count = arenas.length * ((withReferee ? 1 : 0) + (withMatches ? 1 : 0));
  const pageCount = Math.ceil(count / perPage);

  const buildHtml = async (): Promise<string> => {
    const QRCode = (await import('qrcode')).default;
    const targets: Array<Omit<QrCard, 'dataUrl'>> = [];
    for (const a of arenas) {
      if (withReferee)
        targets.push({ title: `Piste ${a.number}`, subtitle: 'Arbitre', url: a.refereeUrl });
      if (withMatches)
        targets.push({
          title: `Piste ${a.number}`,
          subtitle: 'Ordre des matchs',
          url: a.matchOrderUrl,
        });
    }
    const cards = await Promise.all(
      targets.map(async t => ({
        ...t,
        dataUrl: await QRCode.toDataURL(t.url, {
          width: 600,
          margin: 1,
          errorCorrectionLevel: 'M',
        }),
      }))
    );
    return buildQrSheetsHTML(cards, perPage, competitionTitle ?? '');
  };

  const run = async (mode: 'pdf' | 'print') => {
    if (count === 0) return;
    setBusy(true);
    try {
      const html = await buildHtml();
      if (mode === 'pdf') {
        await savePDF(html, 'qr-codes-pistes.pdf');
      } else {
        const res = await window.electronAPI?.file?.printHtml?.(html);
        if (res && !res.success) throw new Error(res.error ?? "Échec de l'impression");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur QR Codes', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        style={{ maxWidth: '440px' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="arena-qr-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="arena-qr-title">
            📱 QR Codes des pistes
          </h2>
          <button className="btn-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div>
            <div className="form-label">QR Codes à inclure</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={withReferee}
                onChange={e => setWithReferee(e.target.checked)}
              />
              Arbitres (tablette de saisie)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={withMatches}
                onChange={e => setWithMatches(e.target.checked)}
              />
              Matchs (ordre des matchs, lecture seule)
            </label>
          </div>
          <div>
            <label className="form-label" htmlFor="arena-qr-per-page">
              QR Codes par feuille
            </label>
            <select
              id="arena-qr-per-page"
              className="form-input"
              value={perPage}
              onChange={e => setPerPage(Number(e.target.value))}
            >
              {Object.keys(QR_PER_PAGE_LAYOUTS).map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            {arenas.length} piste{arenas.length > 1 ? 's' : ''} · {count} QR Code
            {count > 1 ? 's' : ''} · {pageCount} feuille{pageCount > 1 ? 's' : ''}
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => run('print')}
            disabled={busy || count === 0}
          >
            🖨️ Imprimer
          </button>
          <button
            className="btn btn-primary"
            onClick={() => run('pdf')}
            disabled={busy || count === 0}
          >
            📄 Exporter en PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArenaQrCodesModal;
