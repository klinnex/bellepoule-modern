/**
 * BellePoule Modern - Match Timer Component
 * Real-time match timer for FFE Sabre Laser (3 minutes)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';

interface MatchTimerProps {
  duration?: number;
  isRunning: boolean;
  isPaused: boolean;
  onTimeUp: () => void;
  onTick?: (remaining: number) => void;
  size?: 'small' | 'large';
  showControls?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}

const DEFAULT_DURATION = 180;

export const MatchTimer: React.FC<MatchTimerProps> = ({
  duration = DEFAULT_DURATION,
  isRunning,
  isPaused,
  onTimeUp,
  onTick,
  size = 'large',
  showControls = false,
  onPause,
  onResume,
}) => {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCalledOnTimeUp = useRef(false);

  useEffect(() => {
    setRemaining(duration);
    hasCalledOnTimeUp.current = false;
  }, [duration]);

  useEffect(() => {
    if (isRunning && !isPaused && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          const newVal = prev - 1;
          onTick?.(newVal);

          if (newVal <= 0) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            if (!hasCalledOnTimeUp.current) {
              hasCalledOnTimeUp.current = true;
              onTimeUp();
            }
          }

          return newVal;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused, remaining, onTimeUp, onTick]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getTimerStyle = () => {
    if (remaining <= 10) return 'bg-red-500 text-white animate-pulse';
    if (remaining <= 30) return 'bg-red-100 text-red-600';
    if (remaining <= 60) return 'bg-yellow-100 text-yellow-600';
    return 'bg-gray-100 text-gray-800';
  };

  const sizeClasses = size === 'large' ? 'text-8xl md:text-9xl px-12 py-8' : 'text-4xl px-6 py-3';

  return (
    <div className="timer-container flex flex-col items-center gap-4">
      <div className={`timer font-digital font-bold rounded-2xl ${sizeClasses} ${getTimerStyle()}`}>
        {formatTime(remaining)}
      </div>

      {showControls && (
        <div className="flex gap-4">
          {isPaused ? (
            <button
              onClick={onResume}
              className="px-6 py-3 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors"
            >
              {t('matchTimer.resume')}
            </button>
          ) : (
            <button
              onClick={onPause}
              className="px-6 py-3 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 transition-colors"
            >
              {t('matchTimer.pause')}
            </button>
          )}
        </div>
      )}

      {isPaused && (
        <div className="text-yellow-600 font-bold animate-pulse">{t('matchTimer.paused')}</div>
      )}
    </div>
  );
};

export default React.memo(MatchTimer);
