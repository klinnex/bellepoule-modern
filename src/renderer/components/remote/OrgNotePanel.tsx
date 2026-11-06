/**
 * BellePoule Modern - Note d'organisation affichée sur les écrans (kiosque, arènes) (#1241)
 * Extrait de RemoteScoreManager : état local au panneau.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const ORG_NOTE_PREFIXES = ['resume', 'start', 'end', 'break', 'lunch', 'ceremony'] as const;

const STYLES = {
  orgNoteBox: {
    margin: '0.75rem 0',
    padding: '0.75rem',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    background: '#1e293b',
  } satisfies React.CSSProperties,
  orgNoteTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: '#94a3b8',
  } satisfies React.CSSProperties,
  orgNoteTypeRow: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '0.5rem',
  } satisfies React.CSSProperties,
  orgNoteRadioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    cursor: 'pointer',
    color: '#e2e8f0',
  } satisfies React.CSSProperties,
  orgNoteTextarea: {
    width: '100%',
    padding: '0.4rem 0.6rem',
    borderRadius: '0.3rem',
    border: '1px solid #475569',
    background: '#0f172a',
    color: '#e2e8f0',
    boxSizing: 'border-box' as const,
    marginBottom: '0.4rem',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    fontSize: 'inherit',
  } satisfies React.CSSProperties,
  orgNoteTimeRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    marginBottom: '0.4rem',
  } satisfies React.CSSProperties,
  orgNoteSelect: {
    padding: '0.4rem 0.6rem',
    borderRadius: '0.3rem',
    border: '1px solid #475569',
    background: '#0f172a',
    color: '#e2e8f0',
    cursor: 'pointer',
  } satisfies React.CSSProperties,
  orgNoteTimeInput: {
    padding: '0.4rem 0.6rem',
    borderRadius: '0.3rem',
    border: '1px solid #475569',
    background: '#0f172a',
    color: '#e2e8f0',
  } satisfies React.CSSProperties,
  orgNoteBtnRow: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.25rem',
  } satisfies React.CSSProperties,
  orgNoteHideBtn: {
    padding: '0.4rem 0.75rem',
    borderRadius: '0.3rem',
    border: 'none',
    background: '#475569',
    color: '#fff',
    cursor: 'pointer',
  } satisfies React.CSSProperties,
  orgNoteActive: {
    fontSize: '0.75rem',
    color: '#22c55e',
    marginTop: '0.4rem',
  } satisfies React.CSSProperties,
};

interface OrgNotePanelProps {
  competitionId: string;
}

export const OrgNotePanel: React.FC<OrgNotePanelProps> = React.memo(({ competitionId }) => {
  const { t } = useTranslation();
  const [orgNoteType, setOrgNoteType] = useState<'free' | 'target_time'>('free');
  const [orgNoteMessage, setOrgNoteMessage] = useState('');
  const [orgNoteTime, setOrgNoteTime] = useState('');
  const [orgNotePrefix, setOrgNotePrefix] = useState('resume');
  const [orgNoteActive, setOrgNoteActive] = useState(false);

  return (
    <div style={STYLES.orgNoteBox}>
      <div style={STYLES.orgNoteTitle}>{t('rsm.org_note_title')}</div>
      <div style={STYLES.orgNoteTypeRow}>
        <label style={STYLES.orgNoteRadioLabel}>
          <input
            type="radio"
            name="orgNoteType"
            checked={orgNoteType === 'free'}
            onChange={() => setOrgNoteType('free')}
          />
          {t('rsm.org_note_free')}
        </label>
        <label style={STYLES.orgNoteRadioLabel}>
          <input
            type="radio"
            name="orgNoteType"
            checked={orgNoteType === 'target_time'}
            onChange={() => setOrgNoteType('target_time')}
          />
          {t('rsm.org_note_target')}
        </label>
      </div>
      <textarea
        placeholder={t('rsm.org_note_placeholder')}
        value={orgNoteMessage}
        onChange={e => setOrgNoteMessage(e.target.value)}
        rows={3}
        style={STYLES.orgNoteTextarea}
      />
      {orgNoteType === 'target_time' && (
        <div style={STYLES.orgNoteTimeRow}>
          <select
            value={orgNotePrefix}
            onChange={e => setOrgNotePrefix(e.target.value)}
            style={STYLES.orgNoteSelect}
          >
            {ORG_NOTE_PREFIXES.map(p => (
              <option key={p} value={p}>
                {t(`rsm.prefix_${p}`)}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={orgNoteTime}
            onChange={e => setOrgNoteTime(e.target.value)}
            style={STYLES.orgNoteTimeInput}
          />
        </div>
      )}
      <div style={STYLES.orgNoteBtnRow}>
        <button
          disabled={!orgNoteMessage.trim() || (orgNoteType === 'target_time' && !orgNoteTime)}
          onClick={async () => {
            const note = {
              type: orgNoteType,
              message: orgNoteMessage.trim(),
              ...(orgNoteType === 'target_time'
                ? { targetTime: orgNoteTime, countdownPrefix: t(`rsm.prefix_${orgNotePrefix}`) }
                : {}),
              createdAt: new Date().toISOString(),
            };
            await window.electronAPI.remote.setOrgNote(competitionId, note);
            setOrgNoteActive(true);
          }}
          style={{
            flex: 1,
            padding: '0.4rem',
            borderRadius: '0.3rem',
            border: 'none',
            background: orgNoteActive ? 'var(--color-primary-dark)' : 'var(--color-primary)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {orgNoteActive ? t('rsm.org_note_update') : t('rsm.org_note_show')}
        </button>
        {orgNoteActive && (
          <button
            onClick={async () => {
              await window.electronAPI.remote.clearOrgNote(competitionId);
              setOrgNoteActive(false);
            }}
            style={STYLES.orgNoteHideBtn}
          >
            {t('rsm.hide')}
          </button>
        )}
      </div>
      {orgNoteActive && <div style={STYLES.orgNoteActive}>{t('rsm.org_note_visible')}</div>}
    </div>
  );
});
OrgNotePanel.displayName = 'OrgNotePanel';
