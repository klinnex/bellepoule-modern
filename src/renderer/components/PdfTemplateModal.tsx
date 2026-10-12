import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTranslation } from '../hooks/useTranslation';
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import PdfTemplateEditor from './PdfTemplateEditor';
import PdfPreview from './PdfPreview';
import type { PdfDocType, PdfTemplate } from '../../shared/types/pdfTemplate.types';

interface Props {
  onClose: () => void;
}

const DOC_TYPES: PdfDocType[] = ['pool', 'tableau', 'ranking'];

const PdfTemplateModal: React.FC<Props> = ({ onClose }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState<PdfDocType>('pool');
  const { templates, setTemplate, resetTemplate } = usePdfTemplateStore();

  const current = templates[activeType];

  const handleChange = (updated: PdfTemplate) => setTemplate(activeType, updated);
  const handleReset = () => resetTemplate(activeType);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '1350px',
          width: '98%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">{t('pdfTemplate.modalTitle')}</h2>
          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Type selector */}
        <div
          style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem 0', flexShrink: 0 }}
        >
          {DOC_TYPES.map(type => (
            <button
              key={type}
              className={`btn ${activeType === type ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem' }}
              onClick={() => setActiveType(type)}
            >
              {t(`pdfTemplate.docType.${type}`)}
            </button>
          ))}
        </div>

        {/* Body: editor + preview side by side */}
        <div
          style={{
            display: 'flex',
            gap: '1.25rem',
            padding: '1rem 1.25rem',
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {/* Left: editor */}
          <div style={{ flex: '0 0 440px', overflowY: 'auto', overflowX: 'hidden' }}>
            <PdfTemplateEditor template={current} onChange={handleChange} onReset={handleReset} />
          </div>

          {/* Right: live preview */}
          <div style={{ flex: '1 1 0', minWidth: '300px', overflowY: 'auto', overflowX: 'hidden' }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--color-muted, #9ca3af)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                marginBottom: '0.5rem',
              }}
            >
              Prévisualisation
            </div>
            <PdfPreview template={current} docType={activeType} />
          </div>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-primary" onClick={onClose}>
            {t('actions.close') || 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PdfTemplateModal);
