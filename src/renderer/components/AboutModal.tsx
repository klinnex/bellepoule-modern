import React, { useState, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTranslation } from '../hooks/useTranslation';
import type { VersionInfo } from '../../shared/types/preload';
import { getActiveLocale } from '../../shared/utils/localeFormat';
import HyperspaceCrawl from './HyperspaceCrawl';

interface Props {
  onClose: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12000,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'var(--bg-secondary, #1e1e2e)',
    border: '1px solid var(--border-color, #333)',
    borderRadius: '12px',
    padding: '2rem',
    minWidth: '380px',
    maxWidth: '500px',
    color: 'var(--text-primary, #e0e0e0)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    position: 'relative',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    color: 'var(--accent-color, #7c9ef5)',
  },
  versionLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  versionBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '6px',
    background: 'var(--bg-tertiary, #2a2a3e)',
    border: '1px solid var(--border-color, #444)',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    color: 'var(--text-muted, #aaa)',
  },
  buildBadge: {
    display: 'inline-block',
    cursor: 'pointer',
    padding: '2px 10px',
    borderRadius: '6px',
    background: 'var(--bg-tertiary, #2a2a3e)',
    border: '1px solid var(--border-color, #444)',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    userSelect: 'none',
    animation: 'bp-build-pulse 2.5s ease-in-out infinite',
  },
  meta: { fontSize: '0.82rem', color: 'var(--text-muted, #888)' },
  desc: { fontSize: '0.9rem', marginTop: '1rem', lineHeight: 1.6 },
  licence: { fontSize: '0.8rem', color: 'var(--text-muted, #888)', marginTop: '0.8rem' },
  diagBtn: {
    marginTop: '1rem',
    padding: '0.4rem 0.9rem',
    fontSize: '0.82rem',
    borderRadius: '6px',
    border: '1px solid var(--border-color, #444)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  },
  diagStatus: { fontSize: '0.78rem', color: 'var(--text-muted, #888)', marginTop: '0.4rem' },
  hint: {
    fontSize: '0.72rem',
    color: 'var(--text-muted, #555)',
    marginTop: '0.3rem',
    fontStyle: 'italic',
  },
  closeBtn: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.2rem',
    color: 'var(--text-muted, #888)',
    lineHeight: 1,
  },
};

const AboutModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [easterActive, setEasterActive] = useState(false);
  const [diagStatus, setDiagStatus] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    window.electronAPI
      ?.getVersionInfo()
      .then(setVersionInfo)
      .catch(() => {});
  }, []);

  const triggerEasterEgg = () => setEasterActive(true);

  const exportDiagnostic = async () => {
    setDiagStatus('busy');
    try {
      const result = await window.electronAPI.diagnostic.exportReport();
      if (result.cancelled) setDiagStatus('idle');
      else setDiagStatus(result.success ? 'saved' : 'failed');
    } catch {
      setDiagStatus('failed');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const buildDate = versionInfo
    ? new Date(versionInfo.date).toLocaleDateString(getActiveLocale(), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '…';

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div ref={modalRef} style={styles.modal} role="dialog" aria-modal="true">
        <button style={styles.closeBtn} onClick={onClose} title={t('actions.close')}>
          ✕
        </button>

        <div style={styles.title}>{t('app.title')}</div>

        <div style={styles.versionLine}>
          <span style={styles.versionBadge}>
            {versionInfo?.channel === 'dev'
              ? `v${versionInfo.version}-dev.${versionInfo.build}`
              : `v${versionInfo?.version ?? '…'}`}
          </span>
          <span
            className="bp-build-badge"
            style={styles.buildBadge}
            role="button"
            tabIndex={0}
            onDoubleClick={triggerEasterEgg}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerEasterEgg();
              }
            }}
            title={t('about.easter_title')}
          >
            #{versionInfo?.build ?? '…'}
          </span>
          <span style={styles.meta}>— {buildDate}</span>
        </div>

        <div style={styles.hint}>{t('about.hint')}</div>

        <div style={styles.desc}>
          {t('about.desc_1')}
          <br />
          {t('about.desc_2')}
        </div>

        <div style={styles.licence}>{t('about.licence')}</div>

        {window.electronAPI?.diagnostic && (
          <>
            <button
              style={styles.diagBtn}
              onClick={exportDiagnostic}
              disabled={diagStatus === 'busy'}
            >
              {t('about.diagnostic_button')}
            </button>
            {diagStatus === 'saved' && (
              <div style={styles.diagStatus}>{t('about.diagnostic_saved')}</div>
            )}
            {diagStatus === 'failed' && (
              <div style={styles.diagStatus}>{t('about.diagnostic_failed')}</div>
            )}
          </>
        )}

        {easterActive && (
          <HyperspaceCrawl build={versionInfo?.build} onDone={() => setEasterActive(false)} />
        )}
      </div>
    </div>
  );
};

export default AboutModal;
