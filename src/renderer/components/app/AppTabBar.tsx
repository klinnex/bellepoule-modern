/**
 * BellePoule Modern - Barre d'onglets de l'application : accueil, onglet Club (#1872),
 * compétitions ouvertes (glisser-déposer pour réordonner). Extrait d'App.tsx (#1897).
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { Home, X } from 'lucide-react';
import { PhaseType } from '../../../shared/types';
import { Button } from '../common/Button';
import { Tooltip } from '../Tooltip';
import { useTranslation } from '../../hooks/useTranslation';
import type { OpenCompetition } from '../../hooks/useAppState';

const PHASE_BADGE: Record<string, { label: string; cls: string }> = {
  [PhaseType.CHECKIN]: { label: 'Appel', cls: 'badge-checkin' },
  [PhaseType.POOL]: { label: 'Poules', cls: 'badge-pool' },
  [PhaseType.QUEST]: { label: 'Quest', cls: 'badge-pool' },
  [PhaseType.DIRECT_ELIMINATION]: { label: 'Tableau', cls: 'badge-tableau' },
  [PhaseType.CLASSIFICATION]: { label: 'Résultats', cls: 'badge-results' },
};

interface AppTabBarProps {
  view: string;
  activeTabId: string | null;
  openCompetitions: OpenCompetition[];
  setOpenCompetitions: React.Dispatch<React.SetStateAction<OpenCompetition[]>>;
  clubTabOpen: boolean;
  clubIcon: (size: number) => React.ReactNode;
  clubName?: string;
  onHome: () => void;
  onOpenClub: () => void;
  onCloseClub: () => void;
  onSwitchTab: (competitionId: string) => void;
  onCloseTab: (competitionId: string, e?: React.MouseEvent) => void;
}

export const AppTabBar: React.FC<AppTabBarProps> = ({
  view,
  activeTabId,
  openCompetitions,
  setOpenCompetitions,
  clubTabOpen,
  clubIcon,
  clubName,
  onHome,
  onOpenClub,
  onCloseClub,
  onSwitchTab,
  onCloseTab,
}) => {
  const { t } = useTranslation();
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  return (
    <div
      className="tabs-container"
      style={{
        background: '#f8fafc',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1rem',
        gap: '0.25rem',
        overflowX: 'auto',
      }}
    >
      {/* Onglet Général/Accueil */}
      <div
        className={`tab ${view === 'home' ? 'tab-active' : ''}`}
        onClick={onHome}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px 8px 0 0',
          cursor: 'pointer',
          background: view === 'home' ? 'white' : 'transparent',
          border: view === 'home' ? '1px solid #e5e7eb' : '1px solid transparent',
          borderBottom: view === 'home' ? '1px solid white' : 'none',
          marginBottom: view === 'home' ? '-1px' : '0',
          transition: 'all 0.15s ease',
          position: 'relative',
          minWidth: '120px',
        }}
        onMouseEnter={e => {
          if (view !== 'home') {
            e.currentTarget.style.background = 'var(--color-surface-2)';
          }
        }}
        onMouseLeave={e => {
          if (view !== 'home') {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <span
          style={{
            fontWeight: view === 'home' ? '600' : '400',
            color: view === 'home' ? 'var(--color-text)' : 'var(--color-text-light)',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Home size={13} /> {t('app.home')}
        </span>
      </div>

      {clubTabOpen && (
        <div
          className={`club-tab ${view === 'club' ? 'club-tab--active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={onOpenClub}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenClub();
            }
          }}
        >
          {clubIcon(16)}
          <span className="club-tab-label">{clubName || t('app.club')}</span>
          <Tooltip content={t('app.club_close')}>
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={12} aria-hidden="true" />}
              aria-label={t('app.club_close')}
              onClick={e => {
                e.stopPropagation();
                onCloseClub();
              }}
            />
          </Tooltip>
        </div>
      )}

      {openCompetitions.map(openComp => (
        <div
          key={openComp.competition.id}
          className={`tab ${activeTabId === openComp.competition.id ? 'tab-active' : ''} ${draggedTabId === openComp.competition.id ? 'tab-dragging' : ''}`}
          draggable
          onDragStart={() => setDraggedTabId(openComp.competition.id)}
          onDragEnd={() => setDraggedTabId(null)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (!draggedTabId || draggedTabId === openComp.competition.id) return;
            setOpenCompetitions(prev => {
              const from = prev.findIndex(o => o.competition.id === draggedTabId);
              const to = prev.findIndex(o => o.competition.id === openComp.competition.id);
              if (from === -1 || to === -1) return prev;
              const next = [...prev];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              return next;
            });
            setDraggedTabId(null);
          }}
          onClick={() => onSwitchTab(openComp.competition.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px 8px 0 0',
            cursor: 'grab',
            background: activeTabId === openComp.competition.id ? 'white' : 'transparent',
            border:
              activeTabId === openComp.competition.id
                ? '1px solid #e5e7eb'
                : '1px solid transparent',
            borderBottom: activeTabId === openComp.competition.id ? '1px solid white' : 'none',
            marginBottom: activeTabId === openComp.competition.id ? '-1px' : '0',
            transition: 'all 0.15s ease',
            position: 'relative',
            minWidth: '150px',
            opacity: draggedTabId === openComp.competition.id ? 0.4 : 1,
          }}
          onMouseEnter={e => {
            if (activeTabId !== openComp.competition.id) {
              e.currentTarget.style.background = 'var(--color-surface-2)';
            }
          }}
          onMouseLeave={e => {
            if (activeTabId !== openComp.competition.id) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          {/* Dot coloré de la compétition */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background: openComp.competition.color || '#3B5BDB',
              boxShadow: `0 0 0 2px ${openComp.competition.color || '#3B5BDB'}33`,
            }}
          />
          <span
            style={{
              fontWeight: activeTabId === openComp.competition.id ? '600' : '400',
              color:
                activeTabId === openComp.competition.id
                  ? 'var(--color-text)'
                  : 'var(--color-text-light)',
              fontSize: '0.875rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
            }}
          >
            {openComp.competition.title}
            {openComp.isDirty && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>●</span>}
            {(() => {
              const phase = openComp.competition.phases?.[openComp.competition.currentPhaseIndex];
              const badge = phase ? PHASE_BADGE[phase.type] : null;
              return badge ? (
                <span className={`tab-phase-badge ${badge.cls}`}>{badge.label}</span>
              ) : null;
            })()}
          </span>
          <Tooltip content={t('app.close_tab')}>
            <button
              onClick={e => onCloseTab(openComp.competition.id, e)}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                padding: '0.125rem',
                borderRadius: '3px',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#e5e7eb';
                e.currentTarget.style.color = '#374151';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = '#6b7280';
              }}
              aria-label={t('app.close_tab')}
            >
              <X size={12} />
            </button>
          </Tooltip>
        </div>
      ))}
    </div>
  );
};

export default AppTabBar;
