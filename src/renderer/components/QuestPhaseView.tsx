/**
 * BellePoule Modern - Quest Phase View
 * Gestion du Tour Quest (Sabre Laser) : configuration, planning, combats
 * Licensed under GPL-3.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import {
  Fencer,
  QuestPhaseConfig,
  Pool,
  Match,
  MatchStatus,
  Score,
  PoolRanking,
} from '../../shared/types';
import {
  calculateFightsPerFencer,
  generateQuestSchedule,
  validateQuestSchedule,
  QuestFight,
  OpponentConstraint,
} from '../../shared/utils/questScheduler';
import { calculatePoolRankingQuest } from '../../shared/utils/poolCalculations';
import { formatRatio } from '../../shared/utils/poolCalculations';
import PoolView from './PoolView';
import {
  TH_CENTER,
  TH_LEFT,
  TD_CENTER,
  CARD,
  CARD_TOP,
  CARD_TITLE,
  MUTED,
} from './questPhaseView.styles';

interface QuestPhaseViewProps {
  fencers: Fencer[];
  questConfig: QuestPhaseConfig;
  competitionWeapon: string;
  maxScore: number;
  onQuestComplete: (ranking: PoolRanking[]) => void;
  onConfigUpdate?: (updates: Partial<QuestPhaseConfig>) => void;
}

type QuestState = 'config' | 'running';

const QuestPhaseView: React.FC<QuestPhaseViewProps> = ({
  fencers,
  questConfig,
  competitionWeapon,
  maxScore,
  onQuestComplete,
  onConfigUpdate,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<QuestState>('config');

  // Config
  const [timeMinutes, setTimeMinutes] = useState<number>(questConfig.availableTimeMinutes ?? 60);
  const [arenas, setArenas] = useState<number>(questConfig.numberOfArenas ?? 2);
  const [manualFights, setManualFights] = useState<number | ''>(questConfig.fightsPerFencer ?? '');
  const [constraint, setConstraint] = useState<OpponentConstraint>(
    questConfig.opponentConstraint ?? 'none'
  );
  const [schedule, setSchedule] = useState<QuestFight[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});

  const autoFights = calculateFightsPerFencer(timeMinutes, arenas, fencers.length);
  const effectiveFights = manualFights !== '' ? Number(manualFights) : autoFights;

  const handleGenerate = useCallback(() => {
    const newSchedule = generateQuestSchedule(fencers, effectiveFights, constraint);
    setSchedule(newSchedule);
  }, [fencers, effectiveFights, constraint]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    setSchedule(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index >= schedule.length - 1) return;
    setSchedule(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleLaunch = () => {
    if (schedule.length === 0) return;

    const now = new Date();
    const matches: Match[] = schedule.map((fight, i) => ({
      id: `quest-match-${i}`,
      number: i + 1,
      fencerA: fight.fencerA,
      fencerB: fight.fencerB,
      scoreA: null,
      scoreB: null,
      maxScore,
      status: MatchStatus.NOT_STARTED,
      createdAt: now,
      updatedAt: now,
    }));

    const questPool: Pool = {
      id: `quest-pool-1`,
      number: 1,
      phaseId: 'quest-phase',
      fencers,
      matches,
      referees: [],
      isComplete: false,
      hasError: false,
      ranking: [],
      createdAt: now,
      updatedAt: now,
    };

    setPools([questPool]);
    setState('running');
  };

  const updateScore = (
    matchIndex: number,
    scoreA: number,
    scoreB: number,
    winner?: 'A' | 'B',
    specialStatus?: 'abandon' | 'forfait' | 'exclusion'
  ) => {
    const effectiveWinner: 'A' | 'B' | undefined =
      winner !== undefined ? winner : scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : undefined;

    setPools(prev =>
      prev.map(pool => ({
        ...pool,
        matches: pool.matches.map((m, i) => {
          if (i !== matchIndex) return m;

          // Le statut spécial (abandon/forfait/exclusion) ne concerne que le perdant
          const makeScore = (value: number, isWinner: boolean): Score => ({
            value,
            isVictory: isWinner,
            isAbstention: !isWinner && specialStatus === 'abandon',
            isExclusion: !isWinner && specialStatus === 'exclusion',
            isForfait: !isWinner && specialStatus === 'forfait',
          });

          return {
            ...m,
            scoreA: makeScore(scoreA, effectiveWinner === 'A'),
            scoreB: makeScore(scoreB, effectiveWinner === 'B'),
            status: effectiveWinner !== undefined ? MatchStatus.FINISHED : m.status,
            updatedAt: new Date(),
          };
        }),
        isComplete: pool.matches.every((m, i) =>
          i !== matchIndex ? m.status === MatchStatus.FINISHED : effectiveWinner !== undefined
        ),
      }))
    );
  };

  const { isValid, errors, fightsPerFencer } = validateQuestSchedule(schedule);

  const sectionTitle: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--color-text-light)',
    textTransform: 'uppercase',
    marginBottom: '0.75rem',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text)',
    marginBottom: '0.25rem',
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--color-border-dark)',
    borderRadius: '6px',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  };

  const smallText: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--color-text-light)',
    marginTop: '0.25rem',
  };

  if (state === 'running') {
    const allComplete = pools.every(p => p.isComplete);
    const questPool = pools[0] ?? null;
    const ranking =
      allComplete && questPool ? calculatePoolRankingQuest(questPool, cardCounts) : null;

    const addCard = (fencerId: string) =>
      setCardCounts(prev => ({ ...prev, [fencerId]: (prev[fencerId] ?? 0) + 1 }));
    const removeCard = (fencerId: string) =>
      setCardCounts(prev => ({ ...prev, [fencerId]: Math.max(0, (prev[fencerId] ?? 0) - 1) }));

    return (
      <div className="content">
        <div className="is-4d99ac">
          <h2 className="is-28d934">{t('questPhase.running_title')}</h2>
          {allComplete && (
            <button className="btn btn-primary" onClick={() => onQuestComplete(ranking ?? [])}>
              {t('questPhase.validate')}
            </button>
          )}
        </div>

        {pools.map(pool => (
          <PoolView
            key={pool.id}
            pool={pool}
            weapon={competitionWeapon as any}
            competitionName="Tour Quest"
            maxScore={maxScore}
            onScoreUpdate={(matchIndex, scoreA, scoreB, winner, specialStatus) =>
              updateScore(matchIndex, scoreA, scoreB, winner, specialStatus)
            }
            onFencerStatusChange={() => {}}
          />
        ))}

        {/* Compteur de cartons */}
        <div style={CARD_TOP}>
          <p style={CARD_TITLE}>{t('questPhase.cards_received')}</p>
          <div className="is-510b9c">
            {fencers.map(f => {
              const count = cardCounts[f.id] ?? 0;
              return (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.6rem',
                    background: count > 0 ? '#fef3c7' : 'white',
                    border: `1px solid ${count > 0 ? '#fbbf24' : 'var(--color-border)'}`,
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                  }}
                >
                  <span className="is-af5bb0">
                    {f.lastName} {f.firstName?.charAt(0)}.
                  </span>
                  <button
                    onClick={() => removeCard(f.id)}
                    disabled={count === 0}
                    style={{
                      padding: '0 0.35rem',
                      border: '1px solid var(--color-border-dark)',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: count === 0 ? 'not-allowed' : 'pointer',
                      opacity: count === 0 ? 0.4 : 1,
                      lineHeight: 1.4,
                    }}
                  >
                    −
                  </button>
                  <span
                    style={{
                      minWidth: '1.2rem',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: count > 0 ? '#b45309' : 'var(--color-text-light)',
                    }}
                  >
                    {count}
                  </span>
                  <button onClick={() => addCard(f.id)} className="is-c67cf9">
                    +
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Classement final (affiché quand tous les matchs sont terminés) */}
        {allComplete && ranking && (
          <div style={CARD_TOP}>
            <p style={CARD_TITLE}>{t('questPhase.ranking_title')}</p>
            <table className="is-81776f">
              <thead>
                <tr className="is-0727f9">
                  <th className="is-750d9b">{t('questPhase.rank')}</th>
                  <th style={TH_LEFT}>{t('questPhase.fencer')}</th>
                  <th style={TH_CENTER} title={t('questPhase.vm_title')}>
                    {t('questPhase.vm')}
                  </th>
                  <th style={TH_CENTER} title={t('questPhase.pts_title')}>
                    {t('questPhase.pts')}
                  </th>
                  <th style={TH_CENTER} title={t('questPhase.cards_title')}>
                    {t('questPhase.cards')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr
                    key={r.fencer.id}
                    style={{
                      background: i % 2 === 0 ? 'white' : 'var(--color-surface-2)',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        textAlign: 'center',
                        fontWeight: 700,
                        color: r.rank <= 3 ? 'var(--color-primary-dark)' : 'var(--color-text)',
                      }}
                    >
                      {r.rank}
                    </td>
                    <td className="is-138330">
                      {r.fencer.lastName} {r.fencer.firstName}
                      {r.fencer.club && <span className="is-98dde6"> ({r.fencer.club})</span>}
                    </td>
                    <td style={TD_CENTER}>{formatRatio(r.ratio)}</td>
                    <td className="is-bcaaba">{r.questPoints ?? 0}</td>
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        textAlign: 'center',
                        color: (r.totalCards ?? 0) > 0 ? '#b45309' : 'var(--color-text-light)',
                      }}
                    >
                      {r.totalCards ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="is-a23f77">{t('questPhase.criteria')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="content is-9ec166">
      <h2 className="is-9fab89">{t('questPhase.config_title')}</h2>

      {/* Section calcul du nombre de combats */}
      <div style={CARD}>
        <p style={sectionTitle}>{t('questPhase.fight_count')}</p>

        <div className="is-007ec8">
          <div>
            <label style={labelStyle}>{t('questPhase.time_available')}</label>
            <input
              type="number"
              style={inputStyle}
              value={timeMinutes}
              min={5}
              onChange={e => {
                const v = Math.max(5, parseInt(e.target.value) || 5);
                setTimeMinutes(v);
                onConfigUpdate?.({ availableTimeMinutes: v });
              }}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('questPhase.arena_count')}</label>
            <input
              type="number"
              style={inputStyle}
              value={arenas}
              min={1}
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                setArenas(v);
                onConfigUpdate?.({ numberOfArenas: v });
              }}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('questPhase.qualified')}</label>
            <input type="number" style={inputStyle} value={fencers.length} disabled />
          </div>
        </div>

        <div className="is-6c0fc7">
          <span className="is-bac809">
            {t('questPhase.formula', { time: timeMinutes, arenas, fencers: fencers.length })}{' '}
            <strong>{t('questPhase.fights_per_fencer', { n: autoFights })}</strong>
          </span>
        </div>

        <div>
          <label style={labelStyle}>{t('questPhase.manual_override')}</label>
          <input
            type="number"
            style={{ ...inputStyle, maxWidth: '200px' }}
            value={manualFights}
            min={1}
            placeholder={String(autoFights)}
            onChange={e => {
              const v = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1);
              setManualFights(v);
              onConfigUpdate?.({ fightsPerFencer: v === '' ? undefined : Number(v) });
            }}
          />
          <p style={smallText}>
            {t('questPhase.effective')}{' '}
            <strong>{t('questPhase.fights_per_fencer', { n: effectiveFights })}</strong>
            {fencers.length > 1 &&
              t('questPhase.total_fights', {
                n: Math.floor((fencers.length * effectiveFights) / 2),
              })}
          </p>
        </div>
      </div>

      {/* Contrainte d'adversaire */}
      <div style={CARD}>
        <p style={sectionTitle}>{t('questPhase.constraint')}</p>
        <div className="is-a3f0fc">
          {(['none', 'club', 'region', 'nation'] as OpponentConstraint[]).map(c => (
            <label key={c} className="is-fcbedc">
              <input
                type="radio"
                name="constraint"
                value={c}
                checked={constraint === c}
                onChange={() => {
                  setConstraint(c);
                  onConfigUpdate?.({ opponentConstraint: c });
                }}
              />
              {c === 'none' && t('questPhase.c_none')}
              {c === 'club' && t('questPhase.c_club')}
              {c === 'region' && t('questPhase.c_region')}
              {c === 'nation' && t('questPhase.c_nation')}
            </label>
          ))}
        </div>
      </div>

      {/* Actions de génération */}
      <div className="is-f0b24e">
        <button
          className="btn btn-secondary"
          onClick={handleGenerate}
          disabled={fencers.length < 2 || effectiveFights <= 0}
        >
          {schedule.length === 0 ? t('questPhase.generate') : t('questPhase.regenerate')}
        </button>
        {fencers.length < 2 && (
          <p style={{ ...smallText, color: '#dc2626', marginTop: '0.5rem' }}>
            {t('questPhase.need_two')}
          </p>
        )}
      </div>

      {/* Planning généré */}
      {schedule.length > 0 && (
        <div style={CARD}>
          <div className="is-b69013">
            <p style={sectionTitle}>{t('questPhase.schedule_title', { n: schedule.length })}</p>
            {!isValid && <span className="is-47a0db">⚠ {errors[0]}</span>}
          </div>

          <div className="is-ef56f1">
            {schedule.map((fight, index) => (
              <div key={index} className="is-a15791">
                <span className="is-a120ba">{index + 1}.</span>
                <span className="flex-1">
                  <strong>{fight.fencerA.lastName}</strong> {fight.fencerA.firstName}
                  {fight.fencerA.club && <span style={MUTED}> ({fight.fencerA.club})</span>}
                  <span className="is-15ad85">{t('questPhase.vs')}</span>
                  <strong>{fight.fencerB.lastName}</strong> {fight.fencerB.firstName}
                  {fight.fencerB.club && <span style={MUTED}> ({fight.fencerB.club})</span>}
                </span>
                <div className="is-499f0c">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    style={{
                      padding: '0.2rem 0.5rem',
                      border: '1px solid var(--color-border-dark)',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                      opacity: index === 0 ? 0.4 : 1,
                      fontSize: '0.75rem',
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === schedule.length - 1}
                    style={{
                      padding: '0.2rem 0.5rem',
                      border: '1px solid var(--color-border-dark)',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: index === schedule.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: index === schedule.length - 1 ? 0.4 : 1,
                      fontSize: '0.75rem',
                    }}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Récap combats par tireur */}
          <details className="mt-4">
            <summary className="is-1b2297">{t('questPhase.per_fencer')}</summary>
            <div className="is-1a8ae8">
              {fencers.map(f => {
                const count = (fightsPerFencer ?? new Map()).get(f.id) ?? 0;
                return (
                  <span
                    key={f.id}
                    style={{
                      padding: '0.2rem 0.6rem',
                      background: count === effectiveFights ? '#dcfce7' : '#fef9c3',
                      border: `1px solid ${count === effectiveFights ? '#86efac' : '#fde047'}`,
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                    }}
                  >
                    {f.lastName} {f.firstName} : {count}
                  </span>
                );
              })}
            </div>
          </details>
        </div>
      )}

      {/* Bouton lancer */}
      {schedule.length > 0 && (
        <div className="is-2f47ea">
          <button className="btn btn-primary is-1f9e99" onClick={handleLaunch}>
            {t('questPhase.launch')}
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(QuestPhaseView);
