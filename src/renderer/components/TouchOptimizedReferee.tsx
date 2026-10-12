/**
 * BellePoule Modern - Touch-Optimized Tablet Interface for Referees
 * Enhanced remote scoring interface with touch optimization
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  Fencer,
  Match,
  MatchStatus,
  TargetZone,
  MatchMode,
  MatchEventEntry,
} from '../../shared/types';
import {
  checkTimeoutSuddenDeath,
  checkChallengerSuddenDeath,
  isValidSuddenDeathTouch,
  getSuddenDeathOvertimeDuration,
  drawWinner,
  isSupplementaryTime,
} from '../../shared/utils/suddenDeath';
import TiebreakerAnimation from './TiebreakerAnimation';
import { useMatchAuditStore } from '../../features/matchAuditLog/hooks/useMatchAuditStore';

interface TouchOptimizedRefereeProps {
  match: Match;
  fencerA: Fencer;
  fencerB: Fencer;
  maxScore: number;
  onScoreUpdate: (scoreA: number, scoreB: number) => void;
  onMatchEnd: (winner: 'A' | 'B') => void;
  onVoiceCommand?: (command: string) => void;
}

const ZONES = [
  { zone: TargetZone.ZONE_A, points: 1, label: 'A', desc: 'Main', color: 'bg-blue-500' },
  { zone: TargetZone.ZONE_B, points: 3, label: 'B', desc: 'Bras', color: 'bg-purple-500' },
  { zone: TargetZone.ZONE_C, points: 5, label: 'C', desc: 'Tête', color: 'bg-pink-500' },
];

function chipFromEntry(
  entry: MatchEventEntry,
  nameA: string,
  nameB: string
): {
  key: string;
  name: string;
  delta: string;
  score: string;
  bg: string;
  border: string;
  textColor: string;
} | null {
  const side = entry.fencerSide;
  const isA = side === 'A';
  const isB = side === 'B';
  const name = isA ? nameA : isB ? nameB : '—';

  if (entry.eventType === 'score_change') {
    const prevA = entry.previousScoreA?.value ?? 0;
    const newA = entry.newScoreA?.value ?? 0;
    const prevB = entry.previousScoreB?.value ?? 0;
    const newB = entry.newScoreB?.value ?? 0;
    const d = isA ? newA - prevA : isB ? newB - prevB : 0;
    const isCorr = d < 0;
    return {
      key: entry.id,
      name,
      delta: d > 0 ? `+${d}` : `${d}`,
      score: `${newA}–${newB}`,
      bg: isCorr ? '#f3f4f6' : isA ? '#dcfce7' : isB ? '#fee2e2' : '#f3f4f6',
      border: isCorr ? '#d1d5db' : isA ? '#16a34a' : isB ? '#dc2626' : '#d1d5db',
      textColor: isCorr ? '#6b7280' : isA ? '#15803d' : isB ? '#b91c1c' : '#6b7280',
    };
  }

  if (entry.eventType === 'card') {
    const icon =
      entry.cardType === 'yellow'
        ? '🟨'
        : entry.cardType === 'red'
          ? '🟥'
          : entry.cardType === 'black'
            ? '⬛'
            : '🃏';
    return {
      key: entry.id,
      name,
      delta: icon,
      score: entry.cardType ?? 'carton',
      bg: '#fffbeb',
      border: '#f59e0b',
      textColor: '#b45309',
    };
  }

  if (entry.eventType === 'arena_exit') {
    return {
      key: entry.id,
      name,
      delta: '↗',
      score: entry.exitType ?? 'sortie',
      bg: '#fef3c7',
      border: '#f59e0b',
      textColor: '#92400e',
    };
  }

  // touch — moins fréquent, affiché sobrement
  if (entry.eventType === 'touch' && entry.points) {
    return {
      key: entry.id,
      name,
      delta: `+${entry.points}`,
      score: entry.zone ?? '',
      bg: isA ? '#dbeafe' : '#fce7f3',
      border: isA ? '#3b82f6' : '#ec4899',
      textColor: isA ? '#1d4ed8' : '#9d174d',
    };
  }

  return null;
}

const TouchOptimizedReferee_: React.FC<TouchOptimizedRefereeProps> = ({
  match,
  fencerA,
  fencerB,
  maxScore,
  onScoreUpdate,
  onMatchEnd,
  onVoiceCommand,
}) => {
  const [scoreA, setScoreA] = useState(match.scoreA?.value || 0);
  const [scoreB, setScoreB] = useState(match.scoreB?.value || 0);
  const [matchTime, setMatchTime] = useState(180);
  const [isRunning, setIsRunning] = useState(match.status === MatchStatus.IN_PROGRESS);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [matchMode, setMatchMode] = useState<MatchMode>(MatchMode.NORMAL);
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [overtimeActive, setOvertimeActive] = useState(false);
  const [supplementaryActive, setSupplementaryActive] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);

  const { entries, loadMatchTimeline, reset: resetAuditLog } = useMatchAuditStore();
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Charge le log depuis la DB au montage, nettoie en sortie
  useEffect(() => {
    loadMatchTimeline(match.id);
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      resetAuditLog();
    };
  }, [match.id]);

  // Déclenche un rechargement ~500ms après un événement (laisse le temps à la couche parent d'écrire en DB)
  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      loadMatchTimeline(match.id);
    }, 500);
  }, [match.id, loadMatchTimeline]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Refs pour éviter les stale closures dans le timer
  const matchModeRef = useRef(matchMode);
  const scoreARef = useRef(scoreA);
  const scoreBRef = useRef(scoreB);
  const handleTimeUpRef = useRef<() => void>(() => {});
  const [timerPhase, setTimerPhase] = useState(0);

  // Mise à jour des refs pendant le rendu (pattern "latest value cache")
  matchModeRef.current = matchMode;
  scoreARef.current = scoreA;
  scoreBRef.current = scoreB;

  // Timer management (countdown)
  useEffect(() => {
    if (isRunning && matchTime > 0) {
      intervalRef.current = setInterval(() => {
        setMatchTime(prev => {
          const next = prev - 1;
          if (next <= 0) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            handleTimeUpRef.current();
            return 0;
          }
          return next;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timerPhase]);

  // Touch gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };

    const deltaX = touchEnd.x - touchStartRef.current.x;
    const deltaY = Math.abs(touchEnd.y - touchStartRef.current.y);

    // Horizontal swipe detected (more horizontal than vertical)
    if (Math.abs(deltaX) > 50 && deltaY < 100) {
      if (deltaX > 0) {
        setSwipeDirection('right');
        handleScoreIncrement('B');
      } else {
        setSwipeDirection('left');
        handleScoreIncrement('A');
      }

      setTimeout(() => setSwipeDirection(null), 300);
    }

    touchStartRef.current = null;
  }, []);

  // Voice recognition
  useEffect(() => {
    if (!voiceEnabled || !onVoiceCommand) return;

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'fr-FR';

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const command = event.results[last][0].transcript.toLowerCase();

      onVoiceCommand(command);
      processVoiceCommand(command);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    if (isListening) {
      recognition.start();
    }

    return () => {
      recognition.stop();
    };
  }, [voiceEnabled, isListening, onVoiceCommand]);

  const processVoiceCommand = (command: string) => {
    // Simple voice commands
    if (command.includes('point') || command.includes('touche')) {
      if (command.includes('vert') || command.includes('a')) {
        handleScoreIncrement('A');
      } else if (command.includes('rouge') || command.includes('b')) {
        handleScoreIncrement('B');
      }
    } else if (command.includes('annuler')) {
      handleScoreDecrement('A');
      handleScoreDecrement('B');
    } else if (command.includes('terminer') || command.includes('fin')) {
      handleMatchEnd();
    } else if (command.includes('pause') || command.includes('arrêter')) {
      setIsRunning(false);
    } else if (command.includes('reprendre') || command.includes('continuer')) {
      setIsRunning(true);
    }
  };

  const handleScoreIncrement = (fencer: 'A' | 'B', points: number = 1) => {
    if (fencer === 'A') {
      const newScore = Math.min(scoreA + points, maxScore);
      setScoreA(newScore);
      onScoreUpdate(newScore, scoreB);
      scheduleReload();

      if (newScore >= maxScore) {
        // Pause le chronomètre pour permettre une correction d'arbitrage
        setIsRunning(false);
      }
    } else {
      const newScore = Math.min(scoreB + points, maxScore);
      setScoreB(newScore);
      onScoreUpdate(scoreA, newScore);
      scheduleReload();

      if (newScore >= maxScore) {
        // Pause le chronomètre pour permettre une correction d'arbitrage
        setIsRunning(false);
      }
    }
  };

  const handleZoneScore = (fencer: 'A' | 'B', zone: TargetZone, points: number) => {
    if (
      matchMode === MatchMode.SUDDEN_DEATH_CHALLENGER ||
      matchMode === MatchMode.SUDDEN_DEATH_TIMEOUT ||
      matchMode === MatchMode.SUPPLEMENTARY_TIME
    ) {
      const validation = isValidSuddenDeathTouch(zone, matchMode);
      if (!validation.isValid) {
        return;
      }
    }

    // Calcul des nouveaux scores avant setState (React ne met pas à jour synchroniquement)
    const newScoreA = fencer === 'A' ? Math.min(scoreA + points, maxScore) : scoreA;
    const newScoreB = fencer === 'B' ? Math.min(scoreB + points, maxScore) : scoreB;

    handleScoreIncrement(fencer, points);

    // Vérifications post-touche pour les modes spéciaux
    if (
      matchMode === MatchMode.SUPPLEMENTARY_TIME ||
      matchMode === MatchMode.SUDDEN_DEATH_TIMEOUT ||
      matchMode === MatchMode.SUDDEN_DEATH_CHALLENGER
    ) {
      if (newScoreA !== newScoreB) {
        setIsRunning(false);
        onMatchEnd(newScoreA > newScoreB ? 'A' : 'B');
        return;
      }
      if (matchMode === MatchMode.SUPPLEMENTARY_TIME) {
        if (checkChallengerSuddenDeath(newScoreA, newScoreB).shouldTrigger) {
          setMatchMode(MatchMode.SUDDEN_DEATH_TIMEOUT);
        }
      }
    }
  };

  const handleMatchEnd = () => {
    setIsRunning(false);
    setSupplementaryActive(false);
    if (scoreA === scoreB) {
      setShowTiebreaker(true);
    } else {
      onMatchEnd(scoreA > scoreB ? 'A' : 'B');
    }
  };

  const handleTiebreakerComplete = (winner: 'A' | 'B') => {
    setShowTiebreaker(false);
    setIsRunning(false);
    setSupplementaryActive(false);
    onMatchEnd(winner);
  };

  const handleScoreDecrement = (fencer: 'A' | 'B') => {
    if (fencer === 'A') {
      const newScore = Math.max(scoreA - 1, 0);
      setScoreA(newScore);
      onScoreUpdate(newScore, scoreB);
      scheduleReload();
    } else {
      const newScore = Math.max(scoreB - 1, 0);
      setScoreB(newScore);
      onScoreUpdate(scoreA, newScore);
      scheduleReload();
    }
  };

  const handleTimeUp = useCallback(() => {
    const mode = matchModeRef.current;
    const sA = scoreARef.current;
    const sB = scoreBRef.current;

    if (mode === MatchMode.SUPPLEMENTARY_TIME || mode === MatchMode.SUDDEN_DEATH_TIMEOUT) {
      if (sA === sB) {
        setShowTiebreaker(true);
      } else {
        setIsRunning(false);
        onMatchEnd(sA > sB ? 'A' : 'B');
      }
      return;
    }

    const suddenDeath = checkTimeoutSuddenDeath(0, sA, sB);
    if (suddenDeath.shouldTrigger) {
      setMatchMode(suddenDeath.mode!);
      setOvertimeActive(true);
      if (suddenDeath.mode === MatchMode.SUPPLEMENTARY_TIME) {
        setSupplementaryActive(true);
      }
      setMatchTime(getSuddenDeathOvertimeDuration());
      // timerPhase force le re-démarrage de l'intervalle même si isRunning ne change pas
      setTimerPhase(p => p + 1);
    } else {
      setIsRunning(false);
      setSupplementaryActive(false);
      onMatchEnd(sA > sB ? 'A' : 'B');
    }
  }, [onMatchEnd]);

  useEffect(() => {
    handleTimeUpRef.current = handleTimeUp;
  }, [handleTimeUp]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSwipeAnimation = () => {
    if (!swipeDirection) return '';
    return swipeDirection === 'left' ? 'animate-swipe-left' : 'animate-swipe-right';
  };

  // DB entries sont chronologiques (plus ancien en premier) — on inverse pour afficher le plus récent d'abord
  const reversedEntries = [...entries].reverse();
  const visibleEntries = showFullLog ? reversedEntries : reversedEntries.slice(0, 5);
  const chips = visibleEntries
    .map(e => chipFromEntry(e, fencerA.lastName, fencerB.lastName))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <div
      className="touch-referee-interface h-screen bg-gray-100 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="bg-white shadow-md p-4">
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold text-gray-800">Piste {match.number || 1}</div>
          <div className="flex items-center space-x-4">
            {overtimeActive &&
              (matchMode === MatchMode.SUDDEN_DEATH_TIMEOUT ||
                matchMode === MatchMode.SUDDEN_DEATH_CHALLENGER) && (
                <div className="px-3 py-1 rounded-full text-sm font-bold animate-pulse bg-orange-100 text-orange-700">
                  ⚡ MORT SUBITE
                </div>
              )}
            {overtimeActive &&
              (matchMode === MatchMode.SUPPLEMENTARY_TIME || supplementaryActive) && (
                <div className="px-3 py-1 rounded-full text-sm font-bold animate-pulse bg-blue-100 text-blue-700">
                  ⏱ 30s SUPPLEMENTAIRE
                </div>
              )}
            <div
              className={`text-xl font-mono ${overtimeActive ? 'text-yellow-600 font-bold' : ''}`}
            >
              {formatTime(matchTime)}
            </div>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`px-4 py-2 rounded-lg font-medium ${
                isRunning ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
              }`}
            >
              {isRunning ? 'PAUSE' : 'START'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Score Area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {/* Fencers */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* Fencer A */}
            <div className={`text-center ${getSwipeAnimation()}`}>
              <div className="bg-green-500 text-white rounded-lg p-6 mb-4">
                <div className="text-lg font-medium">
                  {fencerA.firstName} {fencerA.lastName}
                </div>
                <div className="text-sm opacity-75">N°{fencerA.ref}</div>
              </div>
              <div className="bg-white rounded-lg shadow-lg p-8">
                <div className="text-6xl font-digital font-bold text-gray-800 mb-4">{scoreA}</div>
                {/* Zone buttons for Sabre Laser */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {ZONES.map(({ zone, points, label, desc, color }) => (
                    <button
                      key={zone}
                      onClick={() => handleZoneScore('A', zone, points)}
                      className={`${color} text-white rounded-lg p-3 flex flex-col items-center active:scale-95 transition-transform min-h-[80px]`}
                    >
                      <span className="text-2xl font-bold">{label}</span>
                      <span className="text-lg font-medium">+{points}</span>
                      <span className="text-xs opacity-80">{desc}</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={() => handleScoreDecrement('A')}
                    className="w-16 h-16 bg-gray-300 text-gray-700 rounded-full text-2xl font-bold active:scale-95 transition-transform"
                  >
                    -1
                  </button>
                  <button
                    onClick={() => {
                      setScoreA(0);
                      onScoreUpdate(0, scoreB);
                      scheduleReload();
                    }}
                    className="w-16 h-16 bg-red-500 text-white rounded-full text-xl font-bold active:scale-95 transition-transform"
                  >
                    0
                  </button>
                </div>
              </div>
              <div className="mt-4 text-sm text-gray-600 text-center">
                Glisser vers la gauche ou toucher +1 pour ajouter un point
              </div>
            </div>

            {/* VS */}
            <div className="flex items-center justify-center">
              <div className="text-3xl font-bold text-gray-400">VS</div>
            </div>

            {/* Fencer B */}
            <div className={`text-center ${getSwipeAnimation()}`}>
              <div className="bg-red-500 text-white rounded-lg p-6 mb-4">
                <div className="text-lg font-medium">
                  {fencerB.firstName} {fencerB.lastName}
                </div>
                <div className="text-sm opacity-75">N°{fencerB.ref}</div>
              </div>
              <div className="bg-white rounded-lg shadow-lg p-8">
                <div className="text-6xl font-digital font-bold text-gray-800 mb-4">{scoreB}</div>
                {/* Zone buttons for Sabre Laser */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {ZONES.map(({ zone, points, label, desc, color }) => (
                    <button
                      key={zone}
                      onClick={() => handleZoneScore('B', zone, points)}
                      className={`${color} text-white rounded-lg p-3 flex flex-col items-center active:scale-95 transition-transform min-h-[80px]`}
                    >
                      <span className="text-2xl font-bold">{label}</span>
                      <span className="text-lg font-medium">+{points}</span>
                      <span className="text-xs opacity-80">{desc}</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={() => handleScoreDecrement('B')}
                    className="w-16 h-16 bg-gray-300 text-gray-700 rounded-full text-2xl font-bold active:scale-95 transition-transform"
                  >
                    -1
                  </button>
                  <button
                    onClick={() => {
                      setScoreB(0);
                      onScoreUpdate(scoreA, 0);
                      scheduleReload();
                    }}
                    className="w-16 h-16 bg-red-500 text-white rounded-full text-xl font-bold active:scale-95 transition-transform"
                  >
                    0
                  </button>
                </div>
              </div>
              <div className="mt-4 text-sm text-gray-600 text-center">
                Glisser vers la droite ou toucher +1 pour ajouter un point
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-white rounded-lg p-4 mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>
                {scoreA} / {maxScore}
              </span>
              <span>Premier à {maxScore} points</span>
              <span>
                {scoreB} / {maxScore}
              </span>
            </div>
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full flex" style={{ width: '100%' }}>
                <div
                  className="bg-green-500 transition-all duration-300"
                  style={{ width: `${(scoreA / maxScore) * 100}%` }}
                />
                <div
                  className="bg-red-500 transition-all duration-300"
                  style={{ width: `${(scoreB / maxScore) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Combat Log — DB-backed, reload après chaque événement */}
          <div className="bg-white rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Log du combat
                {entries.length > 0 && (
                  <span className="ml-2 font-normal text-gray-400">({entries.length})</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {entries.length > 5 && (
                  <button
                    onClick={() => setShowFullLog(v => !v)}
                    className="text-xs text-blue-500 underline"
                  >
                    {showFullLog ? 'Réduire' : `Tout voir`}
                  </button>
                )}
                <button
                  onClick={() => loadMatchTimeline(match.id)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="Actualiser"
                >
                  ↺
                </button>
              </div>
            </div>
            {chips.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">
                Aucun événement enregistré
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {chips.map(chip => (
                  <div
                    key={chip.key}
                    style={{
                      background: chip.bg,
                      border: `1.5px solid ${chip.border}`,
                      borderRadius: '8px',
                      padding: '4px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: '60px',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: chip.textColor }}>
                      {chip.name}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: chip.textColor }}>
                      {chip.delta}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        color: '#6b7280',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {chip.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setScoreA(0);
                setScoreB(0);
                onScoreUpdate(0, 0);
                scheduleReload();
              }}
              className="bg-yellow-500 text-white px-6 py-4 rounded-lg font-medium text-lg active:scale-95 transition-transform"
            >
              Réinitialiser Score
            </button>
            <button
              onClick={handleMatchEnd}
              className="bg-blue-500 text-white px-6 py-4 rounded-lg font-medium text-lg active:scale-95 transition-transform"
            >
              Terminer Match
            </button>
          </div>
        </div>
      </div>

      {/* Voice Control Footer */}
      <div className="bg-white shadow-md p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setVoiceEnabled(!voiceEnabled);
                if (!voiceEnabled) {
                  setIsListening(true);
                }
              }}
              className={`px-4 py-2 rounded-lg font-medium ${
                voiceEnabled ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}
            >
              🎤 {voiceEnabled ? 'Actif' : 'Inactif'}
            </button>
            {isListening && (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-gray-600">Écoute...</span>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            Commandes: "Point rouge/vert", "Pause", "Reprendre", "Terminer"
          </div>
        </div>
      </div>

      {showTiebreaker && (
        <TiebreakerAnimation
          fencerA={fencerA}
          fencerB={fencerB}
          onComplete={handleTiebreakerComplete}
        />
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes swipe-left {
          0% { transform: translateX(0); }
          50% { transform: translateX(-20px); }
          100% { transform: translateX(0); }
        }

        @keyframes swipe-right {
          0% { transform: translateX(0); }
          50% { transform: translateX(20px); }
          100% { transform: translateX(0); }
        }

        .animate-swipe-left {
          animation: swipe-left 0.3s ease-out;
        }

        .animate-swipe-right {
          animation: swipe-right 0.3s ease-out;
        }
      `,
        }}
      />
    </div>
  );
};

export const TouchOptimizedReferee = memo(TouchOptimizedReferee_);
