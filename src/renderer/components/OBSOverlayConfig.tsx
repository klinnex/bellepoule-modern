/**
 * BellePoule Modern - Configurateur OBS Overlay (inline Electron)
 * Licensed under GPL-3.0
 */

import React, { useState, useMemo, useCallback } from 'react';

interface OBSOverlayConfigProps {
  serverUrl: string;
  arenaCount: number;
}

type OverlayTheme = 'transparent' | 'dark' | 'neon' | 'light';

const THEMES: { value: OverlayTheme; label: string }[] = [
  { value: 'transparent', label: 'Transparent (recommandé OBS)' },
  { value: 'dark', label: 'Sombre' },
  { value: 'neon', label: 'Néon' },
  { value: 'light', label: 'Clair' },
];

const HIDE_OPTIONS: { key: string; label: string }[] = [
  { key: 'timer', label: 'Chronomètre' },
  { key: 'cards', label: 'Cartons' },
  { key: 'club', label: 'Club' },
  { key: 'phase', label: 'Phase / Piste' },
];

export const OBSOverlayConfig: React.FC<OBSOverlayConfigProps> = ({ serverUrl, arenaCount }) => {
  const [arena, setArena] = useState(1);
  const [theme, setTheme] = useState<OverlayTheme>('transparent');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(160);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const toggleHide = useCallback((key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const overlayUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (theme !== 'transparent') params.set('theme', theme);
    if (hidden.size > 0) params.set('hide', [...hidden].join(','));
    params.set('w', String(width));
    params.set('h', String(height));
    const qs = params.toString();
    return `${serverUrl}/arene${arena}/overlay${qs ? '?' + qs : ''}`;
  }, [serverUrl, arena, theme, hidden, width, height]);

  const jsonUrl = `${serverUrl}/api/arenas/arene${arena}/obs-json`;

  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(overlayUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [overlayUrl]);

  const copyJson = useCallback(() => {
    navigator.clipboard.writeText(jsonUrl).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1500);
    });
  }, [jsonUrl]);

  const S = STYLES;

  return (
    <div style={S.root}>
      {/* Arène */}
      <div style={S.row}>
        <label style={S.labelText}>Piste / Arène</label>
        <select
          style={S.select}
          value={arena}
          onChange={e => setArena(Number(e.target.value))}
        >
          {Array.from({ length: Math.max(arenaCount, 1) }, (_, i) => (
            <option key={i + 1} value={i + 1}>Piste {i + 1}</option>
          ))}
        </select>
      </div>

      {/* Thème */}
      <div style={S.row}>
        <label style={S.labelText}>Thème</label>
        <select style={S.select} value={theme} onChange={e => setTheme(e.target.value as OverlayTheme)}>
          {THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Dimensions */}
      <div style={S.row}>
        <label style={S.labelText}>Dimensions (px)</label>
        <div style={S.dimRow}>
          <input
            type="number" style={S.dimInput} value={width} min={200} max={3840}
            onChange={e => setWidth(Number(e.target.value))}
          />
          <span style={S.dimSep}>×</span>
          <input
            type="number" style={S.dimInput} value={height} min={60} max={2160}
            onChange={e => setHeight(Number(e.target.value))}
          />
          <button style={S.presetBtn} onClick={() => { setWidth(1280); setHeight(160); }} title="Bandeau 1280×160">1280×160</button>
          <button style={S.presetBtn} onClick={() => { setWidth(1920); setHeight(80); }} title="Bandeau 1920×80">1920×80</button>
          <button style={S.presetBtn} onClick={() => { setWidth(400); setHeight(200); }} title="Bloc coin 400×200">400×200</button>
        </div>
      </div>

      {/* Masquer éléments */}
      <div style={S.hideSection}>
        <span style={S.labelText}>Masquer</span>
        <div style={S.checkboxRow}>
          {HIDE_OPTIONS.map(opt => (
            <label key={opt.key} style={S.checkLabel}>
              <input
                type="checkbox"
                checked={hidden.has(opt.key)}
                onChange={() => toggleHide(opt.key)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* URL générée */}
      <div style={S.urlBox}>
        <div style={S.urlLabel}>URL OBS Browser Source</div>
        <div style={S.urlRow}>
          <code style={S.urlCode}>{overlayUrl}</code>
          <button style={S.copyBtn} onClick={copyUrl}>{copied ? '✓' : '📋'}</button>
          <button
            style={S.openBtn}
            onClick={() => window.open(overlayUrl, '_blank')}
            title="Ouvrir dans le navigateur"
          >↗</button>
        </div>
      </div>

      {/* JSON API */}
      <div style={S.urlBox}>
        <div style={S.urlLabel}>Endpoint JSON (intégrations tierces)</div>
        <div style={S.urlRow}>
          <code style={S.urlCode}>{jsonUrl}</code>
          <button style={S.copyBtn} onClick={copyJson}>{copiedJson ? '✓' : '📋'}</button>
        </div>
      </div>

      <div style={S.hint}>
        Dans OBS : Sources → + → Navigateur → coller l'URL · Largeur {width} · Hauteur {height}
      </div>
    </div>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const STYLES: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', gap: '0.75rem',
    padding: '0.75rem', background: '#1e293b', borderRadius: '0.5rem',
    border: '1px solid #334155', marginTop: '0.5rem',
  },
  row: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  labelText: { fontSize: '0.8rem', color: '#94a3b8', minWidth: '110px', flexShrink: 0 },
  select: {
    flex: 1, padding: '0.3rem 0.5rem', borderRadius: '0.3rem',
    border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', fontSize: '0.85rem',
  },
  dimRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, flexWrap: 'wrap' },
  dimInput: {
    width: '72px', padding: '0.3rem 0.4rem', borderRadius: '0.3rem',
    border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0',
    fontSize: '0.85rem', textAlign: 'center',
  },
  dimSep: { color: '#64748b', fontSize: '0.9rem' },
  presetBtn: {
    padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '0.3rem',
    border: '1px solid #475569', background: 'transparent', color: '#94a3b8', cursor: 'pointer',
  },
  hideSection: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  checkboxRow: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: '#e2e8f0', cursor: 'pointer' },
  urlBox: {
    background: '#0f172a', borderRadius: '0.375rem',
    border: '1px solid #334155', padding: '0.5rem 0.75rem',
  },
  urlLabel: { fontSize: '0.72rem', color: '#64748b', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  urlRow: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  urlCode: {
    flex: 1, fontSize: '0.78rem', color: '#4ade80', wordBreak: 'break-all',
    fontFamily: 'ui-monospace, monospace',
  },
  copyBtn: {
    padding: '0.2rem 0.4rem', fontSize: '0.8rem', background: 'transparent',
    border: '1px solid #475569', borderRadius: '0.25rem', cursor: 'pointer', color: '#e2e8f0',
    flexShrink: 0,
  },
  openBtn: {
    padding: '0.2rem 0.4rem', fontSize: '0.8rem', background: 'transparent',
    border: '1px solid #475569', borderRadius: '0.25rem', cursor: 'pointer', color: '#94a3b8',
    flexShrink: 0,
  },
  hint: { fontSize: '0.75rem', color: '#475569', fontStyle: 'italic' },
};
