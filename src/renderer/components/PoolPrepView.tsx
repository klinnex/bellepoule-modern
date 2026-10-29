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
import {
  countConflicts,
  minConflicts,
  optimizePoolConflicts,
} from '../../shared/utils/poolOptimizer';
import PoolMatchOrderModal from './pool/PoolMatchOrderModal';
import { appendHistory } from './poolPrepHistory';
import { useTranslation } from '../hooks/useTranslation';

const HINT_DISMISSED_KEY = 'bp_poolprep_hint_dismissed';

const CRITERION_NOUN: Record<SeparationCriterionKey, string> = {
  byClub: 'pools.prep_crit_club',
  byRegion: 'pools.prep_crit_region',
  byNation: 'pools.prep_crit_nation',
};

const CRITERION_LABEL: Record<SeparationCriterionKey, string> = {
  byClub: 'pools.prep_sep_club',
  byRegion: 'pools.prep_sep_region',
  byNation: 'pools.prep_sep_nation',
};

interface PoolPrepViewProps {
  fencers: Fencer[];
  initialPools?: Pool[];
  maxScore: number;
  minFencersPerPool?: number;
  maxFencersPerPool?: number;
  expertMode?: boolean;
  /** Nombre de pistes de la saisie distante (choix de piste en mode expert) */
  arenaCount?: number;
  /** Piste modifiée : appliquée immédiatement si la poule est déjà lancée (#1037) */
  onStripChange?: (poolId: string, strip: number | undefined) => void;
  onPoolsConfirm: (pools: Pool[]) => void;
  onSkipPools?: () => void;
  onSettingsChange?: (min: number, max: number) => void;
  /** Expose le bouton « Lancer les poules » à la barre de navigation (#945) */
  onLaunchActionChange?: (action: PoolPrepLaunchAction | null) => void;
  /**
   * Répartition spécifique (tournoi des rapières : regroupement par niveau).
   * Remplace la répartition serpentin et désactive les critères de séparation.
   */
  customDistribution?: (fencers: Fencer[], poolCount: number) => Fencer[][];
  /** Ordre des matchs spécifique (paires 1-indexées), ex. vagues des rapières */
  customMatchOrder?: (poolFencers: Fencer[]) => [number, number][];
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
  arenaCount = 1,
  onStripChange,
  onPoolsConfirm,
  onSkipPools,
  onSettingsChange,
  onLaunchActionChange,
  customDistribution,
  customMatchOrder,
}) => {
  const { t } = useTranslation();
  const [poolCount, setPoolCount] = useState<number>(0);
  const [minFencersPerPool, setMinFencersPerPool] = useState<number>(initialMin);
  const [maxFencersPerPool, setMaxFencersPerPool] = useState<number>(initialMax);
  const [pools, setPools] = useState<Pool[]>(initialPools || []);
  const [draggedFencer, setDraggedFencer] = useState<{ fencer: Fencer; poolIndex: number } | null>(
    null
  );
  const [dropTarget, setDropTarget] = useState<{ poolIndex: number; index: number } | null>(null);

  interface SeparationCriterion {
    key: SeparationCriterionKey;
    label: string;
    enabled: boolean;
  }
  const [separationCriteria, setSeparationCriteria] = useState<SeparationCriterion[]>([
    { key: 'byClub', label: 'Club', enabled: !customDistribution },
    { key: 'byRegion', label: 'Région', enabled: !customDistribution },
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
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HINT_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const dismissHint = () => {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_DISMISSED_KEY, '1');
    } catch {
      // stockage indisponible : masqué pour la session seulement
    }
  };
  const RESTORE_WINDOW_MINUTES = 5;

  // Décompte uniquement quand la barre d'annulation est affichée et dans la fenêtre de restauration
  const undoBarActive = currentHistoryIndex > 0;
  useEffect(() => {
    if (!undoBarActive) return;
    const windowSec = RESTORE_WINDOW_MINUTES * 60;
    const interval = setInterval(() => {
      const lastChange = history[currentHistoryIndex]?.timestamp || Date.now();
      const elapsed = Math.floor((Date.now() - lastChange) / 1000);
      setTimeSinceLastChange(elapsed);
      if (elapsed >= windowSec) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [undoBarActive, history, currentHistoryIndex]);

  // Initialisation de l'historique à la première génération de poules
  useEffect(() => {
    if (pools.length > 0 && !historyInitialized.current) {
      historyInitialized.current = true;
      const initialState: PoolStateHistory = {
        pools: structuredClone(pools),
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
      pools: structuredClone(pools),
      poolCount,
      minFencersPerPool,
      maxFencersPerPool,
      timestamp: now,
    };

    const filteredHistory = appendHistory(
      history,
      currentHistoryIndex,
      newState,
      RESTORE_WINDOW_MINUTES * 60 * 1000
    );

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

    const distribution = customDistribution
      ? customDistribution(fencers, count)
      : distributeFencersToPoolsSerpentine(fencers, count, getActiveCriteria(criteria));

    const generatedPools: Pool[] = distribution.map((poolFencers, index) => {
      const matchOrder = customMatchOrder
        ? customMatchOrder(poolFencers)
        : generatePoolMatchOrder(poolFencers.length);
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
        pools: structuredClone(initialPools),
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
    const matchOrder = customMatchOrder
      ? customMatchOrder(pool.fencers)
      : generatePoolMatchOrder(pool.fencers.length);
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

  // Dépose un tireur dans une poule, à la position targetIndex (fin de poule par défaut).
  // Même poule → réordonnancement par glisser vers le haut / bas (#1037).
  const handleDrop = (e: React.DragEvent, targetPoolIndex: number, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    if (!draggedFencer) return;
    const movedFencer = draggedFencer.fencer;
    const fromPoolIndex = draggedFencer.poolIndex;
    setDraggedFencer(null);

    const source = pools[fromPoolIndex];
    const fromIndex = source.fencers.findIndex(f => f.id === movedFencer.id);
    if (fromIndex < 0) return;

    if (fromPoolIndex === targetPoolIndex) {
      let insertAt = targetIndex ?? source.fencers.length;
      if (insertAt > fromIndex) insertAt--;
      if (insertAt === fromIndex) return;
      saveToHistory();
      const newFencers = source.fencers.filter(f => f.id !== movedFencer.id);
      newFencers.splice(insertAt, 0, movedFencer);
      setPools(
        pools.map((p, i) =>
          i === targetPoolIndex ? regenerateMatches({ ...p, fencers: newFencers }) : p
        )
      );
      return;
    }

    saveToHistory();
    const updatedPools = pools.map((pool, index) => {
      if (index === fromPoolIndex) {
        const newFencers = pool.fencers.filter(f => f.id !== movedFencer.id);
        return regenerateMatches({ ...pool, fencers: newFencers });
      }
      if (index === targetPoolIndex) {
        const newFencers = [...pool.fencers];
        newFencers.splice(targetIndex ?? newFencers.length, 0, movedFencer);
        return regenerateMatches({ ...pool, fencers: newFencers });
      }
      return pool;
    });

    setPools(updatedPools);
  };

  // Échanges de tireurs entre poules pour atteindre le minimum de conflits
  const handleOptimize = () => {
    const optimized = optimizePoolConflicts(
      pools.map(p => p.fencers),
      getActiveCriteria(separationCriteria)
    );
    const changed = optimized.some((fs, i) => fs.some((f, j) => f.id !== pools[i].fencers[j]?.id));
    if (!changed) return;
    saveToHistory();
    setPools(
      pools.map((p, i) =>
        optimized[i].every((f, j) => f.id === p.fencers[j]?.id)
          ? p
          : regenerateMatches({ ...p, fencers: optimized[i] })
      )
    );
  };

  const handleStripChange = (poolIndex: number, strip: number | undefined) => {
    const pool = pools[poolIndex];
    setPools(pools.map((p, i) => (i === poolIndex ? { ...p, strip } : p)));
    if (pool) onStripChange?.(pool.id, strip);
  };

  // Pistes attribuées à plusieurs poules → signalées en rouge
  const duplicateStrips = new Set<number>();
  {
    const seen = new Set<number>();
    pools.forEach(p => {
      if (p.strip == null) return;
      if (seen.has(p.strip)) duplicateStrips.add(p.strip);
      seen.add(p.strip);
    });
  }
  const stripOptions = Array.from(
    { length: Math.max(arenaCount, ...pools.map(p => p.strip ?? 0)) },
    (_, i) => i + 1
  );

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

  // Conflits actuels vs minimum théorique, par critère actif
  const fencerPools = pools.map(p => p.fencers);
  const conflictSummary = getActiveCriteria(separationCriteria).map(key => ({
    key,
    current: countConflicts(fencerPools, key),
    min: minConflicts(fencerPools, key),
  }));
  const canOptimize = conflictSummary.some(c => c.current > c.min);

  const suggestedPoolCount =
    fencers.length > 0
      ? calculateOptimalPoolCount(fencers.length, minFencersPerPool, maxFencersPerPool)
      : 0;

  const POOL_ACCENTS = ['#3B5BDB', '#0D9488', '#7C3AED', '#D97706', '#DB2777', '#16A34A'];
  const POOL_ACCENT_BGS = [
    'rgba(59,91,219,0.10)',
    'rgba(13,148,136,0.10)',
    'rgba(124,58,237,0.10)',
    'rgba(217,119,6,0.10)',
    'rgba(219,39,119,0.10)',
    'rgba(22,163,74,0.10)',
  ];

  /** Valeurs en double dans une poule (club, région…) → nombre d'occurrences */
  const getPoolConflicts = (
    pool: Pool,
    pick: (f: Fencer) => string | undefined
  ): Map<string, number> => {
    const counts = new Map<string, number>();
    pool.fencers.forEach(f => {
      const v = pick(f)?.trim();
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    });
    counts.forEach((n, v) => {
      if (n < 2) counts.delete(v);
    });
    return counts;
  };

  const isCriterionEnabled = (key: SeparationCriterionKey) =>
    separationCriteria.some(c => c.key === key && c.enabled);

  /** « Club Street Fighter » → « Street Fighter » (gain de place, nom complet en infobulle) */
  const shortClub = (club: string) => club.replace(/^club\s+/i, '');

  const formatConflicts = (conflicts: Map<string, number>) =>
    [...conflicts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `${n}× ${v}`)
      .join(', ');

  /** Classement moyen des tireurs classés de la poule (force de la poule) */
  const getPoolAvgRanking = (pool: Pool): number | null => {
    const ranks = pool.fencers.map(f => f.ranking).filter((r): r is number => r != null && r > 0);
    return ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null;
  };

  const launchDisabled =
    poolCount > 0 && (pools.length === 0 || pools.some(p => p.fencers.length < 3));
  const launchLabel = poolCount === 0 ? t('pools.prep_skip_pools') : t('pools.prep_launch');
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
              {t('pools.prep_pool_count')}
            </label>
            <div className="u-row">
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
                  title={t('pools.prep_single_title')}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.65rem', borderRadius: '999px' }}
                >
                  {t('pools.prep_single')}
                </button>
              )}
              {poolCount > 0 && suggestedPoolCount > 0 && suggestedPoolCount !== poolCount && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handlePoolCountChange(suggestedPoolCount)}
                  title={t('pools.prep_suggested_title', {
                    min: minFencersPerPool,
                    max: maxFencersPerPool,
                  })}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.65rem', borderRadius: '999px' }}
                >
                  {t('pools.prep_suggested', { n: suggestedPoolCount })}
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
              {t('pools.prep_per_pool')}
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
          {!customDistribution && (
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
                {t('pools.prep_separation')}{' '}
                <span
                  style={{
                    fontWeight: 400,
                    textTransform: 'none',
                    fontSize: '0.65rem',
                    opacity: 0.7,
                  }}
                >
                  {t('pools.prep_drag_priority')}
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
                    aria-pressed={criterion.enabled}
                    title={t(
                      criterion.enabled ? 'pools.prep_sep_title_on' : 'pools.prep_sep_title_off',
                      { n: String(idx + 1) }
                    )}
                  >
                    <span className="pool-prep-pill-grip" aria-hidden="true">
                      ⠿
                    </span>
                    <span style={{ fontSize: '0.6rem', opacity: 0.6, marginRight: '0.2rem' }}>
                      {idx + 1}.
                    </span>
                    {t(CRITERION_LABEL[criterion.key])}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => setShowMatchOrderModal(true)}
            title={t('pools.prep_match_order_title')}
            style={{
              fontSize: '0.8rem',
              padding: '0.35rem 0.8rem',
              alignSelf: 'flex-end',
              whiteSpace: 'nowrap',
            }}
          >
            {t('pools.prep_match_order')}
          </button>

          {conflictSummary.length > 0 && pools.length > 1 && (
            <div className="pool-prep-conflict-summary">
              {conflictSummary.map(c => (
                <span
                  key={c.key}
                  className={c.current > c.min ? 'over' : undefined}
                  title={t('pools.prep_conflicts_title', {
                    crit: t(CRITERION_NOUN[c.key]),
                    n: c.current,
                    min: c.min,
                  })}
                >
                  {t(CRITERION_NOUN[c.key])} {c.current}
                  <span style={{ opacity: 0.6 }}> / min {c.min}</span>
                </span>
              ))}
              <button
                className="btn btn-secondary"
                onClick={handleOptimize}
                disabled={!canOptimize}
                title={canOptimize ? t('pools.prep_optimize_title') : t('pools.prep_optimize_min')}
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.65rem', borderRadius: '999px' }}
              >
                {t('pools.prep_optimize')}
              </button>
            </div>
          )}

          <div style={{ marginLeft: 'auto' }} className="pool-prep-stats-badge">
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {t('pools.prep_pools', { count: pools.length })} ·{' '}
              {t('pools.prep_fencers', { count: fencers.length })}
            </span>
            <span
              style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}
            >
              {t('pools.prep_stats', { min: stats.min, max: stats.max, avg: stats.avg })}
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
                {t('pools.prep_no_pool')}
              </div>
              <div style={{ fontSize: '0.9rem' }}>{t('pools.prep_no_pool_hint')}</div>
            </div>
          ) : null}

          {pools.map((pool, poolIndex) => {
            const accent = POOL_ACCENTS[poolIndex % POOL_ACCENTS.length];
            const accentBg = POOL_ACCENT_BGS[poolIndex % POOL_ACCENT_BGS.length];
            const clubConflicts = isCriterionEnabled('byClub')
              ? getPoolConflicts(pool, f => f.club)
              : new Map<string, number>();
            const regionConflicts = isCriterionEnabled('byRegion')
              ? getPoolConflicts(pool, f => f.region)
              : new Map<string, number>();
            const topClubConflict = [...clubConflicts.entries()].sort((a, b) => b[1] - a[1])[0];
            const avgRanking = getPoolAvgRanking(pool);
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
                <div className="pool-prep-card-header u-row-between">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: accent }}>
                      {t('pools.prep_pool_n', { n: pool.number })}
                    </h3>
                    {pools.length === 1 && (
                      <span className="pool-prep-badge-unique">{t('pools.prep_unique')}</span>
                    )}
                    {topClubConflict && (
                      <span
                        className="pool-prep-conflict-warning"
                        title={t('pools.prep_same_club', { list: formatConflicts(clubConflicts) })}
                      >
                        ⚠ {topClubConflict[1]}× {shortClub(topClubConflict[0])}
                        {clubConflicts.size > 1 && ` +${clubConflicts.size - 1}`}
                      </span>
                    )}
                    {regionConflicts.size > 0 && (
                      <span
                        className="pool-prep-conflict-warning"
                        title={t('pools.prep_same_region', {
                          list: formatConflicts(regionConflicts),
                        })}
                      >
                        {t('pools.prep_region_warn')}
                      </span>
                    )}
                  </div>
                  <div className="u-row">
                    {avgRanking != null && (
                      <span
                        className="pool-prep-strength"
                        title={t('pools.prep_avg_ranking_title')}
                      >
                        {t('pools.prep_avg', { n: avgRanking })}
                      </span>
                    )}
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
                        {t('pools.prep_strip')}
                        <select
                          value={pool.strip ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            handleStripChange(
                              poolIndex,
                              val === '' ? undefined : parseInt(val, 10)
                            );
                          }}
                          title={
                            pool.strip != null && duplicateStrips.has(pool.strip)
                              ? t('pools.prep_strip_duplicate')
                              : t('pools.prep_strip_title')
                          }
                          className={`pool-prep-strip-select${pool.strip != null && duplicateStrips.has(pool.strip) ? ' duplicate' : ''}`}
                        >
                          <option value="">–</option>
                          {stripOptions.map(n => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <span className={`pool-prep-count-badge${isOutOfRange ? ' danger' : ''}`}>
                      {pool.fencers.length}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {pool.fencers.map((fencer, fencerIndex) => {
                    const hasClubConflict = fencer.club
                      ? clubConflicts.has(fencer.club.trim())
                      : false;
                    return (
                      <div
                        key={fencer.id}
                        draggable
                        onDragStart={() => handleDragStart(fencer, poolIndex)}
                        onDragEnd={() => {
                          setDraggedFencer(null);
                          setDropTarget(null);
                        }}
                        onDragOver={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          const index =
                            e.clientY < r.top + r.height / 2 ? fencerIndex : fencerIndex + 1;
                          if (dropTarget?.poolIndex !== poolIndex || dropTarget.index !== index) {
                            setDropTarget({ poolIndex, index });
                          }
                        }}
                        onDrop={e => handleDrop(e, poolIndex, dropTarget?.index ?? fencerIndex)}
                        className={`pool-prep-fencer-row${draggedFencer?.fencer.id === fencer.id ? ' pool-prep-fencer-row-dragging' : ''}${dropTarget?.poolIndex === poolIndex && dropTarget.index === fencerIndex ? ' drop-before' : ''}${dropTarget?.poolIndex === poolIndex && dropTarget.index === fencerIndex + 1 && fencerIndex === pool.fencers.length - 1 ? ' drop-after' : ''}`}
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
                        {fencer.ranking != null && fencer.ranking > 0 && (
                          <span
                            className="pool-prep-ranking"
                            title={t('pools.prep_initial_ranking')}
                          >
                            #{fencer.ranking}
                          </span>
                        )}
                        {fencer.club && (
                          <span
                            className={`pool-prep-club-pill${hasClubConflict ? ' conflict' : ''}`}
                            title={
                              fencer.region ? `${fencer.club} — ${fencer.region}` : fencer.club
                            }
                          >
                            {shortClub(fencer.club)}
                          </span>
                        )}
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
                    {t('pools.prep_drop_here')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Instructions (masquables) */}
        {!hintDismissed && (
          <div className="pool-prep-hint">
            <span>{t('pools.prep_hint')}</span>
            <button
              className="pool-prep-hint-close"
              onClick={dismissHint}
              aria-label={t('pools.prep_hide_help')}
              title={t('pools.prep_hide_help')}
            >
              ×
            </button>
          </div>
        )}

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
              {t('pools.prep_undo')}
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
                  {t('pools.prep_window', {
                    elapsed: formatElapsedTime(timeSinceLastChange),
                    max: RESTORE_WINDOW_MINUTES,
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Bouton déjà présent dans la barre de navigation (#945) : pas de doublon */}
          {!onLaunchActionChange && (
            <button
              className="btn btn-primary"
              onClick={handleLaunch}
              disabled={launchDisabled}
              style={{ fontSize: '1rem', padding: '0.75rem 2rem', borderRadius: '10px' }}
            >
              {launchLabel} →
            </button>
          )}
        </div>
      </div>
      {showMatchOrderModal && <PoolMatchOrderModal onClose={() => setShowMatchOrderModal(false)} />}
    </>
  );
};

export default React.memo(PoolPrepView);
