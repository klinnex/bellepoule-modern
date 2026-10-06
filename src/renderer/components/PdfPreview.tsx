import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { PdfTemplate, PdfDocType } from '../../shared/types/pdfTemplate.types';
import {
  generatePoolHTML,
  generateTableauHTML,
  generateRankingHTML,
} from '../../shared/utils/pdfExport';
import { PREVIEW_POOL, PREVIEW_TABLEAU, PREVIEW_RANKING } from '../../shared/utils/pdfPreviewData';

const LOGO_KEY = 'bellepoule-logo';
const A4_W = 794;
const A4_H = 1123;
const RANKING_COLS = [
  'rank',
  'lastName',
  'firstName',
  'club',
  'victories',
  'ratio',
  'td',
  'tr',
  'index',
];

interface Props {
  template: PdfTemplate;
  docType: PdfDocType;
}

const PdfPreview: React.FC<Props> = ({ template, docType }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [logo, setLogo] = useState<string | undefined>(
    () => localStorage.getItem(LOGO_KEY) ?? undefined
  );

  useEffect(() => {
    const handler = () => setLogo(localStorage.getItem(LOGO_KEY) ?? undefined);
    window.addEventListener('bellepoule-logo-change', handler);
    return () => window.removeEventListener('bellepoule-logo-change', handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setScale(w / A4_W);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const html = useMemo(() => {
    switch (docType) {
      case 'pool':
        return generatePoolHTML(
          PREVIEW_POOL,
          {
            title: 'Poule 1',
            competitionName: 'Championnat Régional 2025',
            weapon: 'Épée',
            category: 'Senior',
            logoBase64: logo,
          },
          template
        );
      case 'tableau':
        return generateTableauHTML(PREVIEW_TABLEAU, 5, 'Tableau Élimination', logo, template);
      case 'ranking':
        return generateRankingHTML(
          PREVIEW_RANKING,
          'Classement Général',
          false,
          RANKING_COLS,
          logo,
          template
        );
    }
  }, [template, docType, logo]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <div
        style={{
          width: '100%',
          height: `${A4_H * scale}px`,
          overflow: 'hidden',
          border: '1px solid var(--color-border, #d1d5db)',
          borderRadius: '4px',
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <iframe
          ref={iframeRef}
          title="PDF Preview"
          sandbox="allow-same-origin"
          style={{
            width: `${A4_W}px`,
            height: `${A4_H}px`,
            border: 'none',
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};

export default React.memo(PdfPreview);
