// Menu de masquage des sections de la page de saisie distante (préférence locale)
import React, { useCallback, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export type RemoteSectionId =
  | 'strips'
  | 'kiosk'
  | 'orgNote'
  | 'globalTheme'
  | 'displayOptions'
  | 'overlay'
  | 'checkin'
  | 'trainer'
  | 'lobby'
  | 'cyrano'
  | 'screens';

export const REMOTE_SECTIONS_STORAGE_KEY = 'bellepoule_remote_hidden_sections';

const SECTION_LABEL_KEYS: Record<RemoteSectionId, string> = {
  strips: 'rsm.section_strips',
  kiosk: 'rsm.kiosk_card',
  orgNote: 'rsm.org_note_title',
  globalTheme: 'rsm.global_theme',
  displayOptions: 'rsm.sec_display',
  overlay: 'rsm.overlay_card',
  checkin: 'rsm.checkin_card',
  trainer: 'rsm.trainer_card',
  lobby: 'rsm.lobby_card',
  cyrano: 'rsm.cyrano_card',
  screens: 'rsm.sec_screens',
};

function readHidden(): RemoteSectionId[] {
  try {
    const raw = localStorage.getItem(REMOTE_SECTIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? (parsed.filter(v => typeof v === 'string') as RemoteSectionId[])
      : [];
  } catch {
    return [];
  }
}

export function useRemoteHiddenSections() {
  const [hidden, setHidden] = useState<RemoteSectionId[]>(readHidden);
  const toggle = useCallback((id: RemoteSectionId) => {
    setHidden(prev => {
      const next = prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id];
      try {
        localStorage.setItem(REMOTE_SECTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* stockage indisponible : préférence non persistée */
      }
      return next;
    });
  }, []);
  const isVisible = useCallback((id: RemoteSectionId) => !hidden.includes(id), [hidden]);
  return { hidden, toggle, isVisible };
}

interface Props {
  sections: RemoteSectionId[];
  hidden: RemoteSectionId[];
  onToggle: (id: RemoteSectionId) => void;
}

export const RemoteSectionsMenu: React.FC<Props> = ({ sections, hidden, onToggle }) => {
  const { t } = useTranslation();
  return (
    <details className="rsm-sections-menu" style={{ marginBottom: '0.75rem' }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
        {t('rsm.sections_menu')} (
        {sections.length - sections.filter(s => hidden.includes(s)).length}/{sections.length})
      </summary>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1rem', marginTop: '0.4rem' }}>
        {sections.map(id => (
          <label key={id} className="rsm-toggle-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={!hidden.includes(id)} onChange={() => onToggle(id)} />
            {t(SECTION_LABEL_KEYS[id])}
          </label>
        ))}
      </div>
    </details>
  );
};
