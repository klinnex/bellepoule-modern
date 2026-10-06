/**
 * BellePoule Modern - Pool Preparation View Component
 * Allows configuring pools before starting matches
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Fencer, Pool, Match, MatchStatus } from '../../shared/types';
import {
  calculateOptimalPoolCount,
  distributeFencersToPoolsSerpentine,
  generatePoolMatchOrder,
  SeparationCriterionKey,
} from '../../shared/utils/poolCalculations';
import PoolMatchOrderModal from './pool/PoolMatchOrderModal';

interface PoolPrepViewProps {
  fencers: Fencer[];
  initialPools?: Pool[];
  maxScore: number;
  minFencersPerPool?: number;
  maxFencersPerPool?: number;
  expertMode?: boolean;
  onPoolsConfirm: (pools: Pool[]) => void;
  onSkipPools?: () => void;
  onSettingsChange?: (min: number, max: number) => void;
  /** Expose le bouton « Lancer les poules » à la barre de navigation (#945) */
  onLaunchActionChange?: (action: PoolPrepLaunchAction | null) => void;
}

export interface PoolPrepLaunchAction {
  label: string;
  disabled: boolean;
  action: () => void;
}

interface PoolStateHistory {
  pools: Pool[];
  poolCount: number;
  minFencersPerPool: number;
  maxFencersPerPool: number;
  timestamp: number;
}

const PoolPrepView: React.FC<PoolPrepViewProps> = ({
  fencers,
  initialPools,
  maxScore,
  minFencersPerPool: initialMin = 5,
  maxFencersPerPool: initialMax = 7,
  expertMode = false,
  onPoolsConfirm,
  onSkipPools,
  onSettingsChange,
  onLaunchActionChange,
}) => {
  const [poolCount, setPoolCount] = useState<number>(0);
  const [minFencersPerPool, setMinFencersPerPool] = useState<number>(initialMin);
  const [maxFencersPerPool, setMaxFencersPerPool] = useState<number>(initialMax);
  const [pools, setPools] = useState<Pool[]>(initialPools || []);
  const [draggedFencer, setDraggedFencer] = useState<{ fencer: Fencer; poolIndex: number } | null>(
    null
  );

  interface SeparationCriterion {
    key: SeparationCriterionKey;
    label: string;
    enabled: boolean;
  }
  const [separationCriteria, setSeparationCriteria] = useState<SeparationCriterion[]>([
    { key: 'byClub', label: 'Club', enabled: true },
    { key: 'byRegion', label: 'Région', enabled: true },
    { key: 'byNation', label: 'Nation', enabled: false },
  ]);
  const [dragCriterionIdx, setDragCriterionIdx] = useState<number | null>(null);

  const getActiveCriteria = (criteria: SeparationCriterion[]): SeparationCriterionKey[] =>
    criteria.filter(c => c.enabled).map(c => c.key);

  // Empêche la réinitialisation si initialPools arrive en retard (async restore)
  const hasInitialized = useRef(false);

  // Initialisation de l'historique au premier setPools non vide
  const historyInitialized = useRef(false);

  // Historique des modifications pour la fonction restore
  const [history, setHistory] = useState<PoolStateHistory[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
  const [timeSinceLastChange, setTimeSinceLastChange] = useState<number>(0);
  const [showMatchOrderModal, setShowMatchOrderModal] = useState(false);
  const RESTORE_WINDOW_MINUTES = 5;

  // Timer pour mettre à jour le temps écoulé
  useEffect(() => {
    const interval = setInterval(() => {
      if (history.length > 0 && currentHistoryIndex >= 0) {
        const lastChange = history[currentHistoryIndex]?.timestamp || Date.now();
        const elapsed = Math.floor((Date.now() - lastChange) / 1000);
        setTimeSinceLastChange(elapsed);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [history, currentHistoryIndex]);

  // Initialisation de l'historique à la première génération de poules
  useEffect(() => {
    if (pools.length > 0 && !historyInitialized.current) {
      historyInitialized.current = true;
      const initialState: PoolStateHistory = {
        pools: JSON.parse(JSON.stringify(pools)),
        poolCount,
        minFencersPerPool,
        maxFencersPerPool,
        timestamp: Date.now(),
      };
      setHistory([initialState]);
      setCurrentHistoryIndex(0);
    }
  }, [pools]);

  // Sauvegarder l'état actuel dans l'historique
  const saveToHistory = () => {
    const now = Date.now();
    const newState: PoolStateHistory = {
      pools: JSON.parse(JSON.stringify(pools)),
      poolCount,
      minFencersPerPool,
      maxFencersPerPool,
      timestamp: now,
    };

    const newHistory = history.slice(0, currentHistoryIndex + 1);
    newHistory.push(newState);

    const cutoffTime = now - RESTORE_WINDOW_MINUTES * 60 * 1000;
    const filteredHistory = newHistory.filter(state => state.timestamp >= cutoffTime);

    if (filteredHistory.length > 20) {
      filteredHistory.shift();
    }

    setHistory(filteredHistory);
    setCurrentHistoryIndex(filteredHistory.length - 1);
    setTimeSinceLastChange(0);
  };

  // Restaurer l'état précédent
  const handleRestore = () => {
    if (currentHistoryIndex > 0) {
      const previousState = history[currentHistoryIndex - 1];
      setPools(previousState.pools);
      setPoolCount(previousState.poolCount);
      setMinFencersPerPool(previousState.minFencersPerPool);
      setMaxFencersPerPool(previousState.maxFencersPerPool);
      setCurrentHistoryIndex(currentHistoryIndex - 1);
      setTimeSinceLastChange(0);
    }
  };

  const canRestore = (): boolean => {
    if (currentHistoryIndex <= 0) return false;

    const previousState = history[currentHistoryIndex - 1];
    if (!previousState) return false;

    const elapsed = Date.now() - previousState.timestamp;
    return elapsed <= RESTORE_WINDOW_MINUTES * 60 * 1000;
  };

  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  // Génère les poules avec la config passée explicitement (évite les closures périmées)
  const generatePools = (count: number, criteria: SeparationCriterion[]) => {
    if (fencers.length === 0 || count <= 0) return;

    const distribution = distributeFencersToPoolsSerpentine(
      fencers,
      count,
      getActiveCriteria(criteria)
    );

    const generatedPools: Pool[] = distribution.map((poolFencers, index) => {
      const matchOrder = generatePoolMatchOrder(poolFencers.length);
      const now = new Date();
      // IDs uniques : persistés en DB (clé primaire globale, toutes compétitions confondues)
      const poolId = crypto.randomUUID();

      const matches: Match[] = matchOrder.map(([a, b], matchIndex) => ({
        id: crypto.randomUUID(),
        number: matchIndex + 1,
        fencerA: poolFencers[a - 1],
        fencerB: poolFencers[b - 1],
        scoreA: null,
        scoreB: null,
        maxScore,
        status: MatchStatus.NOT_STARTED,
        poolId,
        createdAt: now,
        updatedAt: now,
      }));

      return {
        id: poolId,
        number: index + 1,
        phaseId: 'phase-pools',
        fencers: poolFencers,
        matches,
        referees: [],
        isComplete: false,
        hasError: false,
        ranking: [],
        createdAt: now,
        updatedAt: now,
      };
    });

    setPools(generatedPools);
  };

  // Initialisation unique : depuis initialPools (session restaurée) ou calcul optimal
  // Le ref hasInitialized empêche la réinitialisation si initialPools arrive en retard (async DB)
  useEffect(() => {
    if (initialPools && initialPools.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      historyInitialized.current = true;
      setPools(initialPools);
      setPoolCount(initialPools.length);
      const initialState: PoolStateHistory = {
        pools: JSON.parse(JSON.stringify(initialPools)),
        poolCount: initialPools.length,
        minFencersPerPool,
        maxFencersPerPool,
        timestamp: Date.now(),
      };
      setHistory([initialState]);
      setCurrentHistoryIndex(0);
    } else if (fencers.length > 0 && pools.length === 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      const optimalCount = calculateOptimalPoolCount(
        fencers.length,
        minFencersPerPool,
        maxFencersPerPool
      );
      setPoolCount(optimalCount);
      generatePools(optimalCount, separationCriteria);
    }
  }, [fencers.length, initialPools]);

  const handlePoolCountChange = (newCount: number) => {
    if (newCount >= 0 && newCount <= Math.ceil(fencers.length / 3)) {
      saveToHistory();
      setPoolCount(newCount);
      if (newCount === 0) {
        setPools([]);
      } else {
        generatePools(newCount, separationCriteria);
      }
    }
  };

  const handleMinFencersChange = (value: number) => {
    if (value >= 3 && value <= maxFencersPerPool) {
      saveToHistory();
      setMinFencersPerPool(value);
      onSettingsChange?.(value, maxFencersPerPool);
    }
  };

  const handleMaxFencersChange = (value: number) => {
    if (value >= minFencersPerPool && value <= 64) {
      saveToHistory();
      setMaxFencersPerPool(value);
      onSettingsChange?.(minFencersPerPool, value);
    }
  };

  const regenerateMatches = (pool: Pool): Pool => {
    const matchOrder = generatePoolMatchOrder(pool.fencers.length);
    const now = new Date();

    const newMatches: Match[] = matchOrder.map(([a, b], matchIndex) => ({
      id: crypto.randomUUID(),
      number: matchIndex + 1,
      fencerA: pool.fencers[a - 1],
      fencerB: pool.fencers[b - 1],
      scoreA: null,
      scoreB: null,
      maxScore,
      status: MatchStatus.NOT_STARTED,
      poolId: pool.id,
      createdAt: now,
      updatedAt: now,
    }));

    return {
      ...pool,
      matches: newMatches,
      isComplete: false,
      ranking: [],
      updatedAt: now,
    };
  };

  const handleDragStart = (fencer: Fencer, poolIndex: number) => {
    setDraggedFencer({ fencer, poolIndex });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetPoolIndex: number) => {
    e.preventDefault();

    if (!draggedFencer || draggedFencer.poolIndex === targetPoolIndex) {
      setDraggedFencer(null);
      return;
    }

    saveToHistory();

    const movedFencer = draggedFencer.fencer;
    const fromPoolIndex = draggedFencer.poolIndex;

    const updatedPools = pools.map((pool, index) => {
      if (index === fromPoolIndex) {
        const newFencers = pool.fencers.filter(f => f.id !== movedFencer.id);
        return regenerateMatches({ ...pool, fencers: newFencers });
      }
      if (index === targetPoolIndex) {
        const newFencers = [...pool.fencers, movedFencer];
        return regenerateMatches({ ...pool, fencers: newFencers });
      }
      return pool;
    });

    setPools(updatedPools);
    setDraggedFencer(null);
  };

  const handleMoveFencer = (fencerId: string, fromPoolIndex: number, toPoolIndex: number) => {
    if (fromPoolIndex === toPoolIndex) return;

    const movedFencer = pools[fromPoolIndex].fencers.find(f => f.id === fencerId);
    if (!movedFencer) return;

    saveToHistory();

    const updatedPools = pools.map((pool, index) => {
      if (index === fromPoolIndex) {
        const newFencers = pool.fencers.filter(f => f.id !== fencerId);
        return regenerateMatches({ ...pool, fencers: newFencers });
      }
      if (index === toPoolIndex) {
        const newFencers = [...pool.fencers, movedFencer];
        return regenerateMatches({ ...pool, fencers: newFencers });
      }
      return pool;
    });

    setPools(updatedPools);
  };

  const handleMoveFencerUp = (poolIndex: number, fencerIndex: number) => {
    if (fencerIndex === 0) return;

    saveToHistory();

    const pool = pools[poolIndex];
    const newFencers = [...pool.fencers];
    [newFencers[fencerIndex - 1], newFencers[fencerIndex]] = [
      newFencers[fencerIndex],
      newFencers[fencerIndex - 1],
    ];

    const updatedPools = pools.map((p, i) =>
      i === poolIndex ? regenerateMatches({ ...p, fencers: newFencers }) : p
    );

    setPools(updatedPools);
  };

  const handleMoveFencerDown = (poolIndex: number, fencerIndex: number) => {
    const pool = pools[poolIndex];
    if (fencerIndex >= pool.fencers.length - 1) return;

    saveToHistory();

    const newFencers = [...pool.fencers];
    [newFencers[fencerIndex], newFencers[fencerIndex + 1]] = [
      newFencers[fencerIndex + 1],
      newFencers[fencerIndex],
    ];

    const updatedPools = pools.map((p, i) =>
      i === poolIndex ? regenerateMatches({ ...p, fencers: newFencers }) : p
    );

    setPools(updatedPools);
  };

  const handleStripChange = (poolIndex: number, strip: number | undefined) => {
    setPools(pools.map((p, i) => (i === poolIndex ? { ...p, strip } : p)));
  };

  const getFencerCountStats = () => {
    if (pools.length === 0) return { min: 0, max: 0, avg: 0 };

    const counts = pools.map(p => p.fencers.length);
    return {
      min: Math.min(...counts),
      max: Math.max(...counts),
      avg: (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1),
    };
  };

  const stats = getFencerCountStats();

  const POOL_ACCENTS = ['#3B5BDB', '#0D9488', '#7C3AED', '#D97706', '#DB2777', '#16A34A'];
  const POOL_ACCENT_BGS = [
    'rgba(59,91,219,0.10)',
    'rgba(13,148,136,0.10)',
    'rgba(124,58,237,0.10)',
    'rgba(217,119,6,0.10)',
    'rgba(219,39,119,0.10)',
    'rgba(22,163,74,0.10)',
  ];

  const getPoolClubConflicts = (pool: Pool): Set<string> => {
    const counts = new Map<string, number>();
    pool.fencers.forEach(f => {
      if (f.club) counts.set(f.club, (counts.get(f.club) || 0) + 1);
    });
    const conflicts = new Set<string>();
    counts.forEach((n, club) => {
      if (n > 1) conflicts.add(club);
    });
    return conflicts;
  };

  const launchDisabled =
    poolCount > 0 && (pools.length === 0 || pools.some(p => p.fencers.length < 3));
  const launchLabel = poolCount === 0 ? 'Passer au classement initial' : 'Lancer les poules';
  const handleLaunch = () => (poolCount === 0 ? onSkipPools?.() : onPoolsConfirm(pools));
  const handleLaunchRef = useRef(handleLaunch);
  useEffect(() => {
    handleLaunchRef.current = handleLaunch;
  });

  useEffect(() => {
    onLaunchActionChange?.({
      label: launchLabel,
      disabled: launchDisabled,
      action: () => handleLaunchRef.current(),
    });
  }, [onLaunchActionChange, launchLabel, launchDisabled]);

  useEffect(() => () => onLaunchActionChange?.(null), [onLaunchActionChange]);

  return (
    <>
      <div style={{ padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Configuration Panel */}
        <div
          className="pool-prep-config"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
            display: 'flex',
            gap: '1.5rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {/* Pool count stepper */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.7rem',
                fontWeight: 600,
                marginBottom: '0.4rem',
                color: 'var(--color-text-light)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Nombre de poules
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="pool-prep-stepper">
                <button
                  className="pool-prep-stepper-btn"
                  onClick={() => handlePoolCountChange(poolCount - 1)}
                  disabled={poolCount <= 0}
                >
                  −
                </button>
                <span className="pool-prep-stepper-value">{poolCount}</span>
                <button
                  className="pool-prep-stepper-btn"
                  onClick={() => handlePoolCountChange(poolCount + 1)}
                  disabled={poolCount >= Math.ceil(fencers.length / 3)}
                >
                  +
                </button>
              </div>
              {poolCount !== 1 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handlePoolCountChange(1)}
                  title="Mettre tous les tireurs dans une seule poule"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.65rem', borderRadius: '999px' }}
                >
                  Poule unique
                </button>
              )}
            </div>
          </div>

          {/* Min / Max fencers */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.7rem',
                fontWeight: 600,
                marginBottom: '0.4rem',
                color: 'var(--color-text-light)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Tireurs / poule
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                type="number"
                value={minFencersPerPool}
                onChange={e => handleMinFencersChange(parseInt(e.target.value) || 5)}
                min={3}
                max={maxFencersPerPool}
                style={{
                  width: '60px',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.875rem',
                  textAlign: 'center',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                }}
              />
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>–</span>
              <input
                type="number"
                value={maxFencersPerPool}
                onChange={e => handleMaxFencersChange(parseInt(e.target.value) || 7)}
                min={minFencersPerPool}
                max={64}
                style={{
                  width: '60px',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.875rem',
                  textAlign: 'center',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          </div>

          {/* Separation pill toggles with drag-and-drop priority */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.7rem',
                fontWeight: 600,
                marginBottom: '0.4rem',
                color: 'var(--color-text-light)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Séparation{' '}
              <span
                style={{
                  fontWeight: 400,
                  textTransform: 'none',
                  fontSize: '0.65rem',
                  opacity: 0.7,
                }}
              >
                (glisser pour priorité)
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {separationCriteria.map((criterion, idx) => (
                <button
                  key={criterion.key}
                  draggable
                  onDragStart={() => setDragCriterionIdx(idx)}
                  onDragOver={e => {
                    e.preventDefault();
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragCriterionIdx === null || dragCriterionIdx === idx) return;
                    const next = [...separationCriteria];
                    const [moved] = next.splice(dragCriterionIdx, 1);
                    next.splice(idx, 0, moved);
                    setSeparationCriteria(next);
                    setDragCriterionIdx(null);
                    if (poolCount > 0) generatePools(poolCount, next);
                  }}
                  onDragEnd={() => setDragCriterionIdx(null)}
                  onClick={() => {
                    const next = separationCriteria.map((c, i) =>
                      i === idx ? { ...c, enabled: !c.enabled } : c
                    );
                    setSeparationCriteria(next);
                    if (poolCount > 0) generatePools(poolCount, next);
                  }}
                  className={`pool-prep-pill-toggle${criterion.enabled ? ' active' : ''}`}
                  style={{ cursor: 'grab', userSelect: 'none' }}
                  title={`Priorité ${idx + 1} — glisser pour réordonner`}
                >
                  <span style={{ fontSize: '0.6rem', opacity: 0.6, marginRight: '0.2rem' }}>
                    {idx + 1}.
                  </span>
                  {criterion.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => setShowMatchOrderModal(true)}
            title="Afficher l'ordre officiel FIE/FFE des matchs par taille de poule"
            style={{
              fontSize: '0.8rem',
              padding: '0.35rem 0.8rem',
              alignSelf: 'flex-end',
              whiteSpace: 'nowrap',
            }}
          >
            Ordre des matchs
          </button>

          <div style={{ marginLeft: 'auto' }} className="pool-prep-stats-badge">
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {fencers.length} tireurs répartis
            </span>
            <span
              style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}
            >
              Min {stats.min} · Max {stats.max} · Moy {stats.avg}
            </span>
          </div>
        </div>

        {/* Pools Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: poolCount === 0 ? 'flex' : 'grid',
            gridTemplateColumns:
              poolCount === 0 ? undefined : 'repeat(auto-fill, minmax(280px, 1fr))',
            alignItems: poolCount === 0 ? 'center' : undefined,
            justifyContent: poolCount === 0 ? 'center' : undefined,
            gap: '1rem',
            padding: '0.5rem',
          }}
        >
          {poolCount === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏭</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Aucune poule
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                Passage direct au classement initial des tireurs
              </div>
            </div>
          ) : null}

          {pools.map((pool, poolIndex) => {
            const accent = POOL_ACCENTS[poolIndex % POOL_ACCENTS.length];
            const accentBg = POOL_ACCENT_BGS[poolIndex % POOL_ACCENT_BGS.length];
            const clubConflicts = separationCriteria.find(c => c.key === 'byClub')?.enabled
              ? getPoolClubConflicts(pool)
              : new Set<string>();
            const hasConflicts = clubConflicts.size > 0;
            const isOutOfRange =
              pools.length > 1 &&
              (pool.fencers.length < minFencersPerPool || pool.fencers.length > maxFencersPerPool);

            return (
              <div
                key={pool.id}
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, poolIndex)}
                className={`pool-prep-card${draggedFencer?.poolIndex === poolIndex ? ' pool-prep-card-active' : ''}`}
                style={
                  { '--pool-accent': accent, '--pool-accent-bg': accentBg } as React.CSSProperties
                }
              >
                <div
                  className="pool-prep-card-header"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: accent }}>
                      Poule {pool.number}
                    </h3>
                    {pools.length === 1 && <span className="pool-prep-badge-unique">unique</span>}
                    {hasConflicts && (
                      <span
                        className="pool-prep-conflict-warning"
                        title="Même club dans cette poule"
                      >
                        ⚠ club
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {expertMode && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.78rem',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Piste
                        <input
                          type="number"
                          min={1}
                          value={pool.strip ?? ''}
                          placeholder="–"
                          onChange={e => {
                            const val = e.target.value;
                            handleStripChange(
                              poolIndex,
                              val === '' ? undefined : Math.max(1, parseInt(val))
                            );
                          }}
                          style={{
                            width: '48px',
                            padding: '0.1rem 0.3rem',
                            fontSize: '0.78rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                          }}
                        />
                      </label>
                    )}
                    <span className={`pool-prep-count-badge${isOutOfRange ? ' danger' : ''}`}>
                      {pool.fencers.length}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {pool.fencers.map((fencer, fencerIndex) => {
                    const hasClubConflict = fencer.club ? clubConflicts.has(fencer.club) : false;
                    return (
                      <div
                        key={fencer.id}
                        draggable
                        onDragStart={() => handleDragStart(fencer, poolIndex)}
                        className={`pool-prep-fencer-row${draggedFencer?.fencer.id === fencer.id ? ' pool-prep-fencer-row-dragging' : ''}`}
                      >
                        <span className="pool-prep-drag-handle">⠿</span>
                        <span className="pool-prep-position">{fencerIndex + 1}</span>
                        <span
                          style={{
                            flex: 1,
                            fontWeight: 500,
                            fontSize: '0.85rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fencer.firstName} {fencer.lastName.charAt(0)}.
                        </span>
                        {fencer.club && (
                          <span
                            className="pool-prep-club-pill"
                            title={fencer.club}
                            style={
                              hasClubConflict
                                ? {
                                    borderColor: 'var(--color-warning)',
                                    color: 'var(--color-warning)',
                                    background: 'rgba(217,119,6,0.08)',
                                  }
                                : undefined
                            }
                          >
                            {fencer.club}
                          </span>
                        )}
                        {hasClubConflict && <span className="pool-prep-conflict-dot" />}
                        <div className="pool-prep-row-actions">
                          {fencerIndex > 0 && (
                            <button
                              onClick={() => handleMoveFencerUp(poolIndex, fencerIndex)}
                              title="Monter"
                              className="pool-prep-btn-move"
                            >
                              ↑
                            </button>
                          )}
                          {fencerIndex < pool.fencers.length - 1 && (
                            <button
                              onClick={() => handleMoveFencerDown(poolIndex, fencerIndex)}
                              title="Descendre"
                              className="pool-prep-btn-move"
                            >
                              ↓
                            </button>
                          )}
                          {poolIndex > 0 && (
                            <button
                              onClick={() => handleMoveFencer(fencer.id, poolIndex, poolIndex - 1)}
                              title="Poule précédente"
                              className="pool-prep-btn-shift"
                            >
                              ←
                            </button>
                          )}
                          {poolIndex < pools.length - 1 && (
                            <button
                              onClick={() => handleMoveFencer(fencer.id, poolIndex, poolIndex + 1)}
                              title="Poule suivante"
                              className="pool-prep-btn-shift"
                            >
                              →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {pool.fencers.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '2rem',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.875rem',
                    }}
                  >
                    Déposez des tireurs ici
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Instructions */}
        <div className="pool-prep-hint">
          Glissez-déposez les tireurs entre poules ou utilisez les flèches (← →) pour déplacer, (↑
          ↓) pour réordonner.
        </div>

        {/* Footer */}
        <div
          className="pool-prep-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '1rem',
            paddingTop: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={handleRestore}
              disabled={!canRestore()}
              style={{
                fontSize: '0.875rem',
                padding: '0.5rem 1rem',
                opacity: canRestore() ? 1 : 0.5,
              }}
            >
              ↩ Annuler
            </button>
            {canRestore() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div className="pool-prep-undo-bar">
                  <div
                    className={`pool-prep-undo-bar-fill${timeSinceLastChange > RESTORE_WINDOW_MINUTES * 60 - 60 ? ' expiring' : ''}`}
                    style={{
                      width: `${Math.max(0, (1 - timeSinceLastChange / (RESTORE_WINDOW_MINUTES * 60)) * 100)}%`,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    color:
                      timeSinceLastChange > RESTORE_WINDOW_MINUTES * 60 - 60
                        ? 'var(--color-danger)'
                        : 'var(--color-text-muted)',
                  }}
                >
                  {formatElapsedTime(timeSinceLastChange)} / {RESTORE_WINDOW_MINUTES}min
                </span>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleLaunch}
            disabled={launchDisabled}
            style={{ fontSize: '1rem', padding: '0.75rem 2rem', borderRadius: '10px' }}
          >
            {launchLabel} →
          </button>
        </div>
      </div>
      {showMatchOrderModal && <PoolMatchOrderModal onClose={() => setShowMatchOrderModal(false)} />}
    </>
  );
};

export default React.memo(PoolPrepView);
