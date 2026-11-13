// Volets dépliables de la page de saisie distante (état replié mémorisé localement)
import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Icon } from '../common/Icon';
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

export const REMOTE_FOLDS_STORAGE_KEY = 'bellepoule_remote_collapsed_sections';

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

function persist(next: RemoteSectionId[]) {
  try {
    localStorage.setItem(REMOTE_FOLDS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : état non persisté */
  }
}

function readCollapsed(): RemoteSectionId[] {
  try {
    const raw = localStorage.getItem(REMOTE_FOLDS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? (parsed.filter(v => typeof v === 'string') as RemoteSectionId[])
      : [];
  } catch {
    return [];
  }
}

export function useRemoteFolds() {
  const [collapsed, setCollapsed] = useState<RemoteSectionId[]>(readCollapsed);
  const toggle = useCallback((id: RemoteSectionId) => {
    setCollapsed(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id];
      persist(next);
      return next;
    });
  }, []);
  /** Tout déplier (open=true) ou tout replier (open=false) les volets donnés */
  const setAll = useCallback((ids: RemoteSectionId[], open: boolean) => {
    setCollapsed(prev => {
      const rest = prev.filter(c => !ids.includes(c));
      const next = open ? rest : [...rest, ...ids];
      persist(next);
      return next;
    });
  }, []);
  /** fold('kiosk')(<Carte/>) : enveloppe le contenu dans un volet dépliable */
  const fold = useCallback(
    (id: RemoteSectionId) =>
      function renderFold(content: React.ReactNode) {
        return (
          <RemoteFold id={id} open={!collapsed.includes(id)} onToggle={toggle}>
            {content}
          </RemoteFold>
        );
      },
    [collapsed, toggle]
  );
  return { collapsed, toggle, setAll, fold };
}

interface Props {
  id: RemoteSectionId;
  open: boolean;
  onToggle: (id: RemoteSectionId) => void;
  children: React.ReactNode;
}

export const RemoteFold: React.FC<Props> = ({ id, open, onToggle, children }) => {
  const { t } = useTranslation();
  return (
    <div className="rsm-fold" data-section={id}>
      <button
        type="button"
        className="rsm-fold-header"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <Icon icon={open ? ChevronDown : ChevronRight} />
        {t(SECTION_LABEL_KEYS[id])}
      </button>
      {open && <div className="rsm-fold-body">{children}</div>}
    </div>
  );
};

interface FoldAllProps {
  /** Volets affichés dans le mode courant (Basique / Expert) */
  ids: RemoteSectionId[];
  collapsed: RemoteSectionId[];
  onSetAll: (ids: RemoteSectionId[], open: boolean) => void;
}

/** Bouton « Tout déplier » / « Tout replier » des volets visibles */
export const RemoteFoldAllButton: React.FC<FoldAllProps> = ({ ids, collapsed, onSetAll }) => {
  const { t } = useTranslation();
  const allOpen = ids.every(id => !collapsed.includes(id));
  return (
    <button
      type="button"
      className="rsm-fold-all"
      aria-expanded={allOpen}
      onClick={() => onSetAll(ids, !allOpen)}
    >
      <Icon icon={allOpen ? ChevronDown : ChevronRight} />
      {t(allOpen ? 'rsm.collapse_all' : 'rsm.expand_all')}
    </button>
  );
};
