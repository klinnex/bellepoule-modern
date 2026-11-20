import React, { useState, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { SM, SUBHEAD, HIDDEN } from './pdfTemplateEditor.styles';
import type {
  PdfTemplate,
  PdfElementConfig,
  PdfColorScheme,
} from '../../shared/types/pdfTemplate.types';
import { Button } from './common/Button';

const LOGO_KEY = 'bellepoule-logo';

const COLOR_PRESETS: { label: string; colors: PdfColorScheme }[] = [
  { label: 'Classique', colors: { navy: '#1a2e4a', gold: '#c9a227', green: '#166534' } },
  { label: 'Sabre Laser', colors: { navy: '#1e0a5c', gold: '#6d28d9', green: '#2563eb' } },
  { label: 'FFE Officielle', colors: { navy: '#990000', gold: '#e30613', green: '#003189' } },
];

interface Props {
  template: PdfTemplate;
  onChange: (t: PdfTemplate) => void;
  onReset: () => void;
}

const PdfTemplateEditor: React.FC<Props> = ({ template, onChange, onReset }) => {
  const { t } = useTranslation();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(() => localStorage.getItem(LOGO_KEY));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      localStorage.setItem(LOGO_KEY, dataUrl);
      setLogo(dataUrl);
      window.dispatchEvent(new CustomEvent('bellepoule-logo-change'));
    };
    reader.readAsDataURL(file);
  };

  const handleLogoRemove = () => {
    localStorage.removeItem(LOGO_KEY);
    setLogo(null);
    window.dispatchEvent(new CustomEvent('bellepoule-logo-change'));
  };

  const sorted = [...template.elements].sort((a, b) => a.order - b.order);

  const handleDragStart = (id: string) => setDraggedId(id);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromEl = sorted.find(el => el.id === draggedId);
    const toEl = sorted.find(el => el.id === targetId);
    if (!fromEl || !toEl) {
      setDraggedId(null);
      return;
    }
    onChange({
      ...template,
      elements: template.elements.map(el => {
        if (el.id === draggedId) return { ...el, order: toEl.order };
        if (el.id === targetId) return { ...el, order: fromEl.order };
        return el;
      }),
      updatedAt: new Date().toISOString(),
    });
    setDraggedId(null);
  };

  const toggleVisible = (id: string) => {
    onChange({
      ...template,
      elements: template.elements.map((el: PdfElementConfig) =>
        el.id === id ? { ...el, visible: !el.visible } : el
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleColorChange = (key: keyof typeof template.colors, value: string) => {
    onChange({
      ...template,
      colors: { ...template.colors, [key]: value },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleTitleChange = (value: string) => {
    onChange({ ...template, customTitle: value, updatedAt: new Date().toISOString() });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf-template-${template.docType}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as PdfTemplate;
      if (!parsed.docType || !Array.isArray(parsed.elements)) throw new Error('invalid');
      onChange(parsed);
    } catch {
      setImportError(t('pdfTemplate.importError'));
    }
  };

  return (
    <div className="u-stack-4">
      {/* Titre personnalisé */}
      <div className="form-group pdf-template-editor-1">
        <label className="pdf-template-editor-2">{t('pdfTemplate.customTitle')}</label>
        <input
          className="form-input pdf-template-editor-3"
          type="text"
          value={template.customTitle}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder={t('pdfTemplate.customTitlePlaceholder')}
        />
      </div>

      {/* Logo */}
      <div>
        <div style={SUBHEAD}>{t('pdfEditor.logo')}</div>
        <div className="pdf-template-editor-4">
          {logo ? (
            <img src={logo} alt={t('pdfEditor.logo')} className="pdf-template-editor-5" />
          ) : (
            <div className="pdf-template-editor-6">{t('pdfEditor.no_logo')}</div>
          )}
          <Button style={SM} onClick={() => logoInputRef.current?.click()}>
            {logo ? 'Changer' : 'Importer'}
          </Button>
          {logo && (
            <Button
              style={{ fontSize: '0.8rem', color: 'var(--danger, #ef4444)' }}
              onClick={handleLogoRemove}
            >
              {t('actions.delete')}
            </Button>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={HIDDEN}
            onChange={handleLogoUpload}
          />
        </div>
      </div>

      {/* Couleurs */}
      <div>
        <div style={SUBHEAD}>{t('pdfEditor.colors')}</div>
        {/* Presets */}
        <div className="pdf-template-editor-7">
          {COLOR_PRESETS.map(preset => (
            <Button
              key={preset.label}

              style={{ ...SM, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={() =>
                onChange({
                  ...template,
                  colors: { ...preset.colors },
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              {(['navy', 'gold', 'green'] as const).map(k => (
                <span
                  key={k}
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: preset.colors[k],
                    border: '1px solid rgba(0,0,0,0.2)',
                  }}
                />
              ))}
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="pdf-template-editor-8">
          {(['navy', 'gold', 'green'] as const).map(key => (
            <label key={key} className="pdf-template-editor-9">
              <input
                type="color"
                value={template.colors[key]}
                onChange={e => handleColorChange(key, e.target.value)}
                className="pdf-template-editor-10"
              />
              {t(`pdfTemplate.colors.${key}`)}
            </label>
          ))}
        </div>
      </div>

      {/* Ordre et visibilité des sections */}
      <div>
        <div style={SUBHEAD}>{t('pdfEditor.sections')}</div>
        <div className="pdf-template-editor-11">
          {sorted.map((el, idx) => (
            <div
              key={el.id}
              draggable
              onDragStart={() => handleDragStart(el.id)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, el.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.75rem',
                background:
                  draggedId === el.id
                    ? 'var(--color-primary-light, #eff6ff)'
                    : idx % 2 === 0
                      ? 'var(--color-surface, #fff)'
                      : 'var(--color-bg, #f9fafb)',
                borderBottom:
                  idx < sorted.length - 1 ? '1px solid var(--color-border, #e5e7eb)' : 'none',
                opacity: draggedId === el.id ? 0.5 : 1,
                cursor: 'grab',
                transition: 'background 0.1s',
              }}
            >
              <span className="pdf-template-editor-12">⠿</span>
              <input
                type="checkbox"
                checked={el.visible}
                onChange={() => toggleVisible(el.id)}
                className="pdf-template-editor-13"
              />
              <span
                style={{
                  fontSize: '0.85rem',
                  color: el.visible ? 'var(--color-text, #1e293b)' : 'var(--color-muted, #9ca3af)',
                  textDecoration: el.visible ? 'none' : 'line-through',
                  flex: 1,
                }}
              >
                {t(`pdfTemplate.elements.${el.id}`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="pdf-template-editor-14">
        <Button style={SM} onClick={onReset}>
          {t('pdfTemplate.reset')}
        </Button>
        <Button style={SM} onClick={handleExport}>
          {t('pdfTemplate.exportJson')}
        </Button>
        <Button style={SM} onClick={handleImportClick}>
          {t('pdfTemplate.importJson')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={HIDDEN}
          onChange={handleFileChange}
        />
      </div>

      {importError && <p className="pdf-template-editor-15">{importError}</p>}
    </div>
  );
};

export default React.memo(PdfTemplateEditor);
