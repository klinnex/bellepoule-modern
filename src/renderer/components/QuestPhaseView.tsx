/**
 * BellePoule Modern - Quest Phase View
 * Gestion du Tour Quest (Sabre Laser) : configuration, planning, combats
 * Licensed under GPL-3.0
 */

import React, { useState, useCallback, useMemo } from 'react';
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

          const makeScore = (value: number, isWinner: boolean): Score => ({
            value,
            isVictory: isWinner,
            isAbstention: specialStatus === 'abandon',
            isExclusion: specialStatus === 'exclusion',
            isForfait: specialStatus === 'forfait',
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
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: '0.75rem',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.25rem',
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  };

  const smallText: React.CSSProperties = {
    fontSize: '0.75rem',
    color: '#6b7280',
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
        <div
          style={{
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Tour Quest en cours</h2>
          {allComplete && (
            <button className="btn btn-primary" onClick={() => onQuestComplete(ranking ?? [])}>
              Valider le Tour Quest →
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
          <p style={CARD_TITLE}>Cartons reçus</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
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
                    border: `1px solid ${count > 0 ? '#fbbf24' : '#e5e7eb'}`,
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>
                    {f.lastName} {f.firstName?.charAt(0)}.
                  </span>
                  <button
                    onClick={() => removeCard(f.id)}
                    disabled={count === 0}
                    style={{
                      padding: '0 0.35rem',
                      border: '1px solid #d1d5db',
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
                      color: count > 0 ? '#b45309' : '#6b7280',
                    }}
                  >
                    {count}
                  </span>
                  <button
                    onClick={() => addCard(f.id)}
                    style={{
                      padding: '0 0.35rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: 'pointer',
                      lineHeight: 1.4,
                    }}
                  >
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
            <p style={CARD_TITLE}>Classement Tour Quest</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'center',
                      borderBottom: '2px solid #e5e7eb',
                      width: '3rem',
                    }}
                  >
                    Rg
                  </th>
                  <th style={TH_LEFT}>Tireur</th>
                  <th style={TH_CENTER} title="Victoires / Matchs joués">
                    V/M
                  </th>
                  <th style={TH_CENTER} title="Points Quest">
                    Pts Q
                  </th>
                  <th style={TH_CENTER} title="Cartons reçus (moins = mieux)">
                    Cart.
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr
                    key={r.fencer.id}
                    style={{
                      background: i % 2 === 0 ? 'white' : '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        textAlign: 'center',
                        fontWeight: 700,
                        color: r.rank <= 3 ? '#1d4ed8' : '#374151',
                      }}
                    >
                      {r.rank}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>
                      {r.fencer.lastName} {r.fencer.firstName}
                      {r.fencer.club && (
                        <span style={{ color: '#6b7280', fontWeight: 400 }}>
                          {' '}
                          ({r.fencer.club})
                        </span>
                      )}
                    </td>
                    <td style={TD_CENTER}>{formatRatio(r.ratio)}</td>
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#1d4ed8',
                      }}
                    >
                      {r.questPoints ?? 0}
                    </td>
                    <td
                      style={{
                        padding: '0.5rem 0.75rem',
                        textAlign: 'center',
                        color: (r.totalCards ?? 0) > 0 ? '#b45309' : '#6b7280',
                      }}
                    >
                      {r.totalCards ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.75rem' }}>
              Critères : V/M décroissant → Points Quest décroissants → Cartons croissants
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="content" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
        Configuration du Tour Quest
      </h2>

      {/* Section calcul du nombre de combats */}
      <div style={CARD}>
        <p style={sectionTitle}>Nombre de combats</p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <label style={labelStyle}>Temps disponible (min)</label>
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
            <label style={labelStyle}>Nombre d'arènes</label>
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
            <label style={labelStyle}>Tireurs qualifiés</label>
            <input type="number" style={inputStyle} value={fencers.length} disabled />
          </div>
        </div>

        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '0.75rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.875rem', color: '#1e40af' }}>
            Formule : (2 × {timeMinutes} min × {arenas} arènes) / ({fencers.length} tireurs × 5 min)
            = <strong>{autoFights} combats/tireur</strong>
          </span>
        </div>

        <div>
          <label style={labelStyle}>Override manuel (laissez vide pour utiliser la formule)</label>
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
            Valeur effective : <strong>{effectiveFights} combats/tireur</strong>
            {fencers.length > 1 &&
              ` → ${Math.floor((fencers.length * effectiveFights) / 2)} combats au total`}
          </p>
        </div>
      </div>

      {/* Contrainte d'adversaire */}
      <div style={CARD}>
        <p style={sectionTitle}>Contrainte d'opposition</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {(['none', 'club', 'region', 'nation'] as OpponentConstraint[]).map(c => (
            <label
              key={c}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
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
              {c === 'none' && 'Aucune'}
              {c === 'club' && 'Pas même club (régionale)'}
              {c === 'region' && 'Pas même région (nationale)'}
              {c === 'nation' && 'Pas même nation (internationale)'}
            </label>
          ))}
        </div>
      </div>

      {/* Actions de génération */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          className="btn btn-secondary"
          onClick={handleGenerate}
          disabled={fencers.length < 2 || effectiveFights <= 0}
        >
          {schedule.length === 0 ? 'Générer le planning' : 'Régénérer'}
        </button>
        {fencers.length < 2 && (
          <p style={{ ...smallText, color: '#dc2626', marginTop: '0.5rem' }}>
            Il faut au moins 2 tireurs pour générer un planning.
          </p>
        )}
      </div>

      {/* Planning généré */}
      {schedule.length > 0 && (
        <div style={CARD}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <p style={sectionTitle}>Planning — {schedule.length} combats</p>
            {!isValid && (
              <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>⚠ {errors[0]}</span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxHeight: '400px',
              overflowY: 'auto',
            }}
          >
            {schedule.map((fight, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                }}
              >
                <span style={{ color: '#9ca3af', minWidth: '2rem', textAlign: 'right' }}>
                  {index + 1}.
                </span>
                <span style={{ flex: 1 }}>
                  <strong>{fight.fencerA.lastName}</strong> {fight.fencerA.firstName}
                  {fight.fencerA.club && <span style={MUTED}> ({fight.fencerA.club})</span>}
                  <span style={{ margin: '0 0.5rem', color: '#9ca3af' }}>vs</span>
                  <strong>{fight.fencerB.lastName}</strong> {fight.fencerB.firstName}
                  {fight.fencerB.club && <span style={MUTED}> ({fight.fencerB.club})</span>}
                </span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    style={{
                      padding: '0.2rem 0.5rem',
                      border: '1px solid #d1d5db',
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
                      border: '1px solid #d1d5db',
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
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280' }}>
              Répartition par tireur
            </summary>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={handleLaunch}
            style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}
          >
            Lancer le Tour Quest →
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(QuestPhaseView);
