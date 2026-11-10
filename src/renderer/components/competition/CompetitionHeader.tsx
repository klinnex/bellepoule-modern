/**
 * BellePoule Modern - Competition Header Sub-component
 * Licensed under GPL-3.0
 */

import { Tooltip } from '../Tooltip';
import React, { useState, useCallback } from 'react';
import {
  MoreHorizontal,
  Swords,
  BarChart2,
  Share2,
  Monitor,
  Smartphone,
  Settings,
  ChevronDown,
  ChevronUp,
  Trophy,
  Download,
  Radio,
} from 'lucide-react';
import { Competition, MatchStatus } from '../../../shared/types';
import Confetti from '../Confetti';
import CoachMark from '../CoachMark';
import { Phase } from '../../hooks/useCompetitionSession';
import { categoryLabel, weaponLabel, genderLabel } from '../../../shared/utils/categoryLabel';
import { toBcp47 } from '../../../shared/utils/localeFormat';

interface MatchProgress {
  done: number;
  total: number;
  label: string;
}

interface CompetitionHeaderProps {
  competition: Competition;
  language: string;
  t: (key: string, params?: { [key: string]: string | number }) => string;
  matchProgress: MatchProgress | null;
  showConfetti: boolean;
  showActionsMenu: boolean;
  setShowActionsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  actionsMenuRef: React.RefObject<HTMLDivElement | null>;
  currentPhase: Phase;
  pools: Array<{ matches: Array<{ status: MatchStatus }> }>;
  tableauMatches: Array<unknown>;
  fencersCount: number;
  checkedInCount: number;
  setShowFencerComparison: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAnalytics: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSeasonRanking: React.Dispatch<React.SetStateAction<boolean>>;
  setShowQRCode: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPresentation: React.Dispatch<React.SetStateAction<boolean>>;
  setShowKiosk: React.Dispatch<React.SetStateAction<boolean>>;
  setShowKioskDisplay: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPropertiesModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowExportCenter: React.Dispatch<React.SetStateAction<boolean>>;
  /** Ouvre l'onglet Saisie distante / Piste (#1414) */
  onOpenRemote?: () => void;
}

const CompetitionHeaderComponent: React.FC<CompetitionHeaderProps> = ({
  competition,
  language,
  t,
  matchProgress,
  showConfetti,
  showActionsMenu,
  setShowActionsMenu,
  actionsMenuRef,
  currentPhase,
  pools,
  tableauMatches,
  fencersCount,
  checkedInCount,
  setShowFencerComparison,
  setShowAnalytics,
  setShowSeasonRanking,
  setShowQRCode,
  setShowPresentation,
  setShowKiosk,
  setShowKioskDisplay,
  setShowPropertiesModal,
  setShowExportCenter,
  onOpenRemote,
}) => {
  const storageKey = `bellepoule-header-expanded-${competition.id}`;
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'false';
    } catch {
      return true;
    }
  });

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, [storageKey]);

  return (
    <>
      <Confetti active={showConfetti} />
      <div
        className={`comp-header${expanded ? '' : ' comp-header-compact'}`}
        style={{ '--comp-color': competition.color } as React.CSSProperties}
      >
        <div className="comp-header-bg" />
        <div className="comp-header-content">
          {/* Infos — ligne compacte toujours visible */}
          <div className="comp-header-info">
            <div className="comp-header-pills">
              <span className="comp-header-pill">{weaponLabel(competition.weapon, t)}</span>
              <span className="comp-header-pill">{categoryLabel(competition.category, t)}</span>
              <span className="comp-header-pill">{genderLabel(competition.gender, t)}</span>
            </div>
            <h1 className="comp-header-title">{competition.title}</h1>
            <div className="comp-header-meta-row">
              {expanded && (
                <p className="comp-header-meta">
                  {new Date(competition.date).toLocaleDateString(toBcp47(language), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  {competition.location && ` · ${competition.location}`}
                </p>
              )}
              {onOpenRemote && (
                <button
                  type="button"
                  className="comp-header-remote-btn"
                  onClick={onOpenRemote}
                  aria-current={currentPhase === 'remote' ? 'page' : undefined}
                >
                  <Radio size={14} /> {t('competitionHeader.remote_button')}
                </button>
              )}
            </div>
          </div>

          {/* Stats + actions */}
          <div className="comp-header-right">
            {/* Propriétés de la compétition — accès direct, à gauche des stats */}
            <Tooltip content={t('competitionHeader.properties')}>
              <button
                type="button"
                className="comp-header-menu-btn"
                onClick={() => setShowPropertiesModal(true)}

                aria-label={t('competitionHeader.properties')}
              >
                <Settings size={18} />
              </button>
            </Tooltip>
            {expanded && (
              <div className="comp-header-stats">
                <div className="comp-stat">
                  <span className="comp-stat-value">{fencersCount}</span>
                  <span className="comp-stat-label">{t('fencer.label')}</span>
                </div>
                <div className="comp-stat-sep" />
                <div className="comp-stat">
                  <span className="comp-stat-value">{checkedInCount}</span>
                  <span className="comp-stat-label">{t('fencer.present_label')}</span>
                </div>
                {matchProgress && (
                  <>
                    <div className="comp-stat-sep" />
                    <div className="comp-stat">
                      <span className="comp-stat-value">
                        {matchProgress.done}/{matchProgress.total}
                      </span>
                      <span className="comp-stat-label">{t('competitionHeader.matches')}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Collapse toggle */}
            <Tooltip
              content={expanded ? t('competitionHeader.collapse') : t('competitionHeader.expand')}
            >
              <button
                className="comp-header-collapse-btn"
                onClick={toggleExpanded}
                aria-label={
                  expanded ? t('competitionHeader.collapse') : t('competitionHeader.expand')
                }
                aria-expanded={expanded}
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </Tooltip>

            {/* Menu actions */}
            <div className="comp-header-actions" ref={actionsMenuRef}>
              <CoachMark
                id="actions-menu"
                dismissLabel={t('competitionNav.coach_dismiss')}
                message={t('competitionHeader.actions_hint')}
                position="left"
              >
                <Tooltip content={t('competitionHeader.actions')}>
                  <button
                    className="comp-header-menu-btn"
                    onClick={() => setShowActionsMenu(v => !v)}
                    aria-label={t('competitionHeader.actions')}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </Tooltip>
              </CoachMark>
              {showActionsMenu && (
                <div className="comp-header-dropdown">
                  <button
                    className="comp-header-dropdown-item"
                    onClick={() => {
                      setShowFencerComparison(true);
                      setShowActionsMenu(false);
                    }}
                  >
                    <Swords size={14} /> {t('competition.comparisons')}
                  </button>
                  <button
                    className="comp-header-dropdown-item"
                    onClick={() => {
                      setShowAnalytics(true);
                      setShowActionsMenu(false);
                    }}
                  >
                    <BarChart2 size={14} /> {t('competition.analytics')}
                  </button>
                  {competition.weapon === 'L' && (
                    <button
                      className="comp-header-dropdown-item"
                      onClick={() => {
                        setShowSeasonRanking(true);
                        setShowActionsMenu(false);
                      }}
                    >
                      <Trophy size={14} /> {t('competitionHeader.season_quest')}
                    </button>
                  )}
                  <button
                    className="comp-header-dropdown-item"
                    onClick={() => {
                      setShowQRCode(true);
                      setShowActionsMenu(false);
                    }}
                  >
                    <Share2 size={14} /> {t('competitionHeader.share')}
                  </button>
                  {currentPhase === 'pools' && pools.length > 0 && (
                    <>
                      <button
                        className="comp-header-dropdown-item"
                        onClick={() => {
                          setShowPresentation(true);
                          setShowActionsMenu(false);
                        }}
                      >
                        <Monitor size={14} /> {t('competitionHeader.presentation')}
                      </button>
                      <button
                        className="comp-header-dropdown-item"
                        onClick={() => {
                          setShowKiosk(true);
                          setShowActionsMenu(false);
                        }}
                      >
                        <Smartphone size={14} /> {t('competitionHeader.kiosk_mode')}
                      </button>
                    </>
                  )}
                  {(pools.length > 0 || tableauMatches.length > 0) && (
                    <button
                      className="comp-header-dropdown-item"
                      onClick={() => {
                        setShowKioskDisplay(true);
                        setShowActionsMenu(false);
                      }}
                    >
                      <Monitor size={14} /> {t('competitionHeader.kiosk_public')}
                    </button>
                  )}
                  <button
                    className="comp-header-dropdown-item"
                    onClick={() => {
                      setShowExportCenter(true);
                      setShowActionsMenu(false);
                    }}
                  >
                    <Download size={14} /> {t('actions.export')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Barre de progression — visible seulement en mode étendu */}
        {expanded && matchProgress && matchProgress.total > 0 && (
          <div className="comp-header-progress">
            <div
              className="comp-header-progress-fill"
              style={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>
    </>
  );
};

const CompetitionHeader = React.memo(CompetitionHeaderComponent);
export default CompetitionHeader;
