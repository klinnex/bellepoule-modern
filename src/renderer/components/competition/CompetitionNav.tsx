/**
 * BellePoule Modern - Competition Navigation Sub-component
 * Licensed under GPL-3.0
 */

import React from 'react';
import { ChevronLeft, ChevronRight, Swords, Target, Zap, Trophy, ScrollText } from 'lucide-react';
import { Competition, MatchStatus, QuestPhaseConfig, Fencer } from '../../../shared/types';
import { Phase } from '../../hooks/useCompetitionSession';
import CoachMark from '../CoachMark';

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
  questEnabled: boolean;
  questConfig: QuestPhaseConfig | undefined;
  fencers: Fencer[];
  getCheckedInFencers: () => Fencer[];
  pools: PoolItem[];
  tableauMatches: TableauMatchItem[];
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
  questEnabled,
  questConfig,
  fencers,
  getCheckedInFencers,
  pools,
  tableauMatches,
}) => {

  return (
  <>
    {/* Breadcrumb */}
    <div style={{ padding: '0.25rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontWeight: 500, opacity: 0.7 }}>{competition.title}</span>
      <span>›</span>
      <span style={{ fontWeight: 600, color: 'var(--text-primary, #f3f4f6)' }}>
        {phases.find(p => p.id === currentPhase)?.label ?? currentPhase}
      </span>
    </div>

    {/* Navigation */}
    <div className="phase-nav">
      {phases.map((phase, index) => (
        <React.Fragment key={phase.id}>
          <div
            className={`phase-step ${currentPhase === phase.id ? 'phase-step-active' : ''} ${phase.disabled ? 'phase-step-disabled' : ''}`}
            onClick={() => !phase.disabled && setCurrentPhase(phase.id as Phase)}
            title={phase.title ?? (phase.disabled ? 'Section non disponible' : undefined)}
          >
            <span className="phase-step-number">{phase.icon}</span>
            <span>{phase.label}</span>
          </div>
          {index < phases.length - 1 && (
            <div className={`phase-step-connector${!phase.disabled && !phases[index + 1]?.disabled ? ' connector-done' : ''}`} />
          )}
        </React.Fragment>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {currentPhase !== 'checkin' && (
          <button className="btn btn-secondary btn-icon-label" onClick={handleGoBack}>
            <ChevronLeft size={15} /> Retour
          </button>
        )}
        {currentPhase === 'checkin' && questEnabled && !questConfig?.hasPreliminaryPools && (
          <button
            className="btn btn-primary btn-icon-label"
            onClick={() => setCurrentPhase('quest')}
            disabled={getCheckedInFencers().length < 2}
          >
            Tour Quest <ChevronRight size={15} />
          </button>
        )}
        {currentPhase === 'checkin' && (!questEnabled || questConfig?.hasPreliminaryPools) && (
          <CoachMark id="generate-pools" message="Cliquez ici après avoir pointé tous vos tireurs" position="bottom">
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
              Générer les poules <ChevronRight size={15} />
            </button>
          </CoachMark>
        )}
        {currentPhase === 'pools' && poolsNextAction && (
          <button className="btn btn-primary" onClick={poolsNextAction.action}>
            {poolsNextAction.label}
          </button>
        )}
        <button
          className={`btn btn-secondary btn-icon-label${currentPhase === 'logs' ? ' btn-active' : ''}`}
          onClick={() => setCurrentPhase(currentPhase === 'logs' ? 'checkin' : 'logs')}
          title="Journal des événements de match"
          style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
        >
          <ScrollText size={14} /> Journal
        </button>

      </div>
    </div>

    {/* Stats bar */}
    {(pools.length > 0 || tableauMatches.length > 0 || fencers.length > 0) && (
      <div className="comp-stats-bar">
        <div className="comp-stats-bar-item">
          <span className="comp-stats-bar-icon"><Swords size={13} /></span>
          <span>{getCheckedInFencers().length}/{fencers.length} tireurs</span>
        </div>
        {pools.length > 0 && (
          <>
            <div className="comp-stats-bar-sep" />
            <div className="comp-stats-bar-item">
              <span className="comp-stats-bar-icon"><Target size={13} /></span>
              <span>{pools.filter(p => p.isComplete).length}/{pools.length} poules</span>
            </div>
            <div className="comp-stats-bar-sep" />
            <div className="comp-stats-bar-item">
              <span className="comp-stats-bar-icon"><Zap size={13} /></span>
              <span>
                {pools.reduce((s, p) => s + p.matches.filter(m => m.status === MatchStatus.FINISHED).length, 0)}/
                {pools.reduce((s, p) => s + p.matches.length, 0)} matchs
              </span>
            </div>
          </>
        )}
        {tableauMatches.length > 0 && (
          <>
            <div className="comp-stats-bar-sep" />
            <div className="comp-stats-bar-item">
              <span className="comp-stats-bar-icon"><Trophy size={13} /></span>
              <span>
                {tableauMatches.filter(m => m.winner !== null).length}/
                {tableauMatches.filter(m => m.fencerA && m.fencerB).length} tableau
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
