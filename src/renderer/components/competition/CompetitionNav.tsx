/**
 * BellePoule Modern - Competition Navigation Sub-component
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Swords,
  Target,
  Zap,
  Trophy,
  ScrollText,
  CalendarClock,
} from 'lucide-react';
import { Competition, MatchStatus, QuestPhaseConfig, Fencer } from '../../../shared/types';
import { Phase } from '../../hooks/useCompetitionSession';
import CoachMark from '../CoachMark';
import GuidedTour from '../GuidedTour';

interface PhaseItem {
  id: string;
  label: string;
  icon: string;
  disabled: boolean;
  title?: string;
}

interface PoolItem {
  isComplete: boolean;
  matches: Array<{ status: MatchStatus }>;
}

interface TableauMatchItem {
  winner: unknown;
  fencerA: unknown;
  fencerB: unknown;
}

interface PoolsNextAction {
  label: string;
  action: () => void;
}

interface PoolPrepLaunchItem {
  label: string;
  disabled: boolean;
  action: () => void;
}

interface CompetitionNavProps {
  competition: Competition;
  phases: PhaseItem[];
  currentPhase: Phase;
  setCurrentPhase: (phase: Phase) => void;
  language: string;
  t: (key: string, params?: { [key: string]: string | number }) => string;
  handleGoBack: () => void;
  handleGeneratePools: () => void;
  poolsNextAction: PoolsNextAction | null;
  poolPrepLaunch?: PoolPrepLaunchItem | null;
  questEnabled: boolean;
  questConfig: QuestPhaseConfig | undefined;
  fencers: Fencer[];
  getCheckedInFencers: () => Fencer[];
  pools: PoolItem[];
  tableauMatches: TableauMatchItem[];
  onOpenPlanningAssistant?: () => void;
  /** Compétition par équipes : l'appel mène à la composition des équipes (#1085) */
  isTeamEvent?: boolean;
  /** Compétition chargée : le parcours guidé (#1305) peut se proposer */
  tourReady?: boolean;
  /** Saisie distante active (étape « Saisie distante » du parcours guidé) */
  remoteActive?: boolean;
}

const CompetitionNavComponent: React.FC<CompetitionNavProps> = ({
  competition,
  phases,
  currentPhase,
  setCurrentPhase,
  t,
  handleGoBack,
  handleGeneratePools,
  poolsNextAction,
  poolPrepLaunch,
  questEnabled,
  questConfig,
  fencers,
  getCheckedInFencers,
  pools,
  tableauMatches,
  onOpenPlanningAssistant,
  isTeamEvent = false,
  tourReady = false,
  remoteActive = false,
}) => {
  const [tourHighlightPhase, setTourHighlightPhase] = useState<string | null>(null);
  return (
    <>
      {tourReady && !isTeamEvent && (
        <GuidedTour
          t={t}
          onHighlightPhase={setTourHighlightPhase}
          fencersCount={fencers.length}
          checkedInCount={getCheckedInFencers().length}
          pools={pools}
          tableauMatchesCount={tableauMatches.length}
          remoteActive={remoteActive}
        />
      )}
      {/* Navigation */}
      <div className="phase-nav" role="navigation" aria-label={competition.title}>
        {phases.map((phase, index) => (
          <React.Fragment key={phase.id}>
            <div
              className={`phase-step ${currentPhase === phase.id ? 'phase-step-active' : ''} ${phase.disabled ? 'phase-step-disabled' : ''}${tourHighlightPhase === phase.id && currentPhase !== phase.id ? ' tour-highlight' : ''}`}
              role="button"
              tabIndex={phase.disabled ? -1 : 0}
              aria-current={currentPhase === phase.id ? 'step' : undefined}
              aria-disabled={phase.disabled || undefined}
              onClick={() => !phase.disabled && setCurrentPhase(phase.id as Phase)}
              onKeyDown={e => {
                if (!phase.disabled && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setCurrentPhase(phase.id as Phase);
                }
              }}
              title={phase.title ?? (phase.disabled ? 'Section non disponible' : undefined)}
            >
              <span className="phase-step-number" aria-hidden="true">
                {phase.icon}
              </span>
              <span>{phase.label}</span>
            </div>
            {index < phases.length - 1 && (
              <div
                className={`phase-step-connector${!phase.disabled && !phases[index + 1]?.disabled ? ' connector-done' : ''}`}
              />
            )}
          </React.Fragment>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {currentPhase !== 'checkin' && (
            <button className="btn btn-secondary btn-icon-label" onClick={handleGoBack}>
              <ChevronLeft size={15} /> {t('competitionNav.back')}
            </button>
          )}
          {currentPhase === 'checkin' &&
            !isTeamEvent &&
            questEnabled &&
            !questConfig?.hasPreliminaryPools && (
              <button
                className="btn btn-primary btn-icon-label"
                onClick={() => setCurrentPhase('quest')}
                disabled={getCheckedInFencers().length < 2}
              >
                {t('competitionNav.quest')} <ChevronRight size={15} />
              </button>
            )}
          {currentPhase === 'checkin' && isTeamEvent && (
            <button
              className="btn btn-primary btn-icon-label"
              onClick={() => setCurrentPhase('teams')}
            >
              {t('teams.toCompose')} <ChevronRight size={15} />
            </button>
          )}
          {currentPhase === 'checkin' &&
            !isTeamEvent &&
            (!questEnabled || questConfig?.hasPreliminaryPools) && (
              <CoachMark
                id="generate-pools"
                message={t('competitionNav.generate_hint')}
                position="bottom"
              >
                <button
                  className="btn btn-primary btn-icon-label"
                  onClick={handleGeneratePools}
                  disabled={getCheckedInFencers().length < 4}
                  title={
                    getCheckedInFencers().length < 4
                      ? `Minimum 4 tireurs pointés requis (${getCheckedInFencers().length} actuellement)`
                      : getCheckedInFencers().length === fencers.length && fencers.length > 0
                        ? 'Tous les tireurs sont pointés — prêt !'
                        : undefined
                  }
                  style={
                    getCheckedInFencers().length === fencers.length && fencers.length >= 4
                      ? { background: '#16a34a', borderColor: '#15803d' }
                      : undefined
                  }
                >
                  {t('competitionNav.generate')}
                  {getCheckedInFencers().length < 4 && (
                    <span className="btn-count-hint">{getCheckedInFencers().length}/4</span>
                  )}
                  <ChevronRight size={15} />
                </button>
              </CoachMark>
            )}
          {currentPhase === 'poolprep' && poolPrepLaunch && (
            <button
              className="btn btn-primary btn-icon-label"
              onClick={poolPrepLaunch.action}
              disabled={poolPrepLaunch.disabled}
              title={
                poolPrepLaunch.disabled ? 'Chaque poule doit compter au moins 3 tireurs' : undefined
              }
            >
              {poolPrepLaunch.label} <ChevronRight size={15} />
            </button>
          )}
          {currentPhase === 'pools' && poolsNextAction && (
            <CoachMark
              id="pools-next-action"
              message={t('competitionNav.next_step_hint')}
              position="bottom"
            >
              <button className="btn btn-primary" onClick={poolsNextAction.action}>
                {poolsNextAction.label}
              </button>
            </CoachMark>
          )}
          {onOpenPlanningAssistant &&
            ((currentPhase === 'pools' && pools.length > 0) ||
              (currentPhase === 'tableau' && tableauMatches.length > 0)) && (
              <button
                className="btn btn-secondary btn-icon-label"
                onClick={onOpenPlanningAssistant}
                title={
                  currentPhase === 'tableau'
                    ? 'Estimation du nombre de pistes et de la durée des duels prêts et en attente'
                    : 'Estimation de fin de tournoi et recommandations de répartition des pistes'
                }
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              >
                <CalendarClock size={14} /> {t('competitionNav.planning')}
              </button>
            )}
          <button
            className={`btn btn-secondary btn-icon-label${currentPhase === 'logs' ? ' btn-active' : ''}`}
            onClick={() => setCurrentPhase(currentPhase === 'logs' ? 'checkin' : 'logs')}
            title={t('competitionNav.log_title')}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
          >
            <ScrollText size={14} /> {t('competitionNav.log')}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {(pools.length > 0 || tableauMatches.length > 0 || fencers.length > 0) && (
        <div className="comp-stats-bar">
          <div className="comp-stats-bar-item">
            <span className="comp-stats-bar-icon">
              <Swords size={13} />
            </span>
            <span>
              {t('competitionNav.fencers', { a: getCheckedInFencers().length, b: fencers.length })}
            </span>
          </div>
          {pools.length > 0 && (
            <>
              <div className="comp-stats-bar-sep" />
              <div className="comp-stats-bar-item">
                <span className="comp-stats-bar-icon">
                  <Target size={13} />
                </span>
                <span>
                  {t('competitionNav.pools', {
                    a: pools.filter(p => p.isComplete).length,
                    b: pools.length,
                  })}
                </span>
              </div>
              <div className="comp-stats-bar-sep" />
              <div className="comp-stats-bar-item">
                <span className="comp-stats-bar-icon">
                  <Zap size={13} />
                </span>
                <span>
                  {t('competitionNav.matches', {
                    a: pools.reduce(
                      (s, p) => s + p.matches.filter(m => m.status === MatchStatus.FINISHED).length,
                      0
                    ),
                    b: pools.reduce((s, p) => s + p.matches.length, 0),
                  })}
                </span>
              </div>
            </>
          )}
          {tableauMatches.length > 0 && (
            <>
              <div className="comp-stats-bar-sep" />
              <div className="comp-stats-bar-item">
                <span className="comp-stats-bar-icon">
                  <Trophy size={13} />
                </span>
                <span>
                  {t('competitionNav.tableau', {
                    a: tableauMatches.filter(m => m.winner !== null).length,
                    b: tableauMatches.filter(m => m.fencerA && m.fencerB).length,
                  })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

const CompetitionNav = React.memo(CompetitionNavComponent);
export default CompetitionNav;
