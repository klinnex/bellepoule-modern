/**
 * BellePoule Modern - Tiebreaker Animation Component
 * Animated 3D coin flip to determine winner after sudden death overtime
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Fencer } from '../../shared/types';
import { drawWinner } from '../../shared/utils/suddenDeath';
import { useTranslation } from '../hooks/useTranslation';

interface TiebreakerAnimationProps {
  fencerA: Fencer;
  fencerB: Fencer;
  onComplete: (winner: 'A' | 'B') => void;
}

const TiebreakerAnimation: React.FC<TiebreakerAnimationProps> = ({
  fencerA,
  fencerB,
  onComplete,
}) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'spinning' | 'done'>('spinning');
  const [winner, setWinner] = useState<'A' | 'B' | null>(null);
  const coinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const decided = drawWinner();
    setWinner(decided);

    // Face verte (front) = tireur A  → 0° / 3600°
    // Face rouge (back)  = tireur B  → 180° / 3780°
    const finalDeg = decided === 'A' ? 3600 : 3780;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (coinRef.current) {
          coinRef.current.style.transition = 'transform 3.5s cubic-bezier(0.33, 1, 0.68, 1)';
          coinRef.current.style.transform = `rotateY(${finalDeg}deg)`;
        }
      });
    });

    const timer = setTimeout(() => setPhase('done'), 3600);
    return () => clearTimeout(timer);
  }, []);

  const handleContinue = useCallback(() => {
    if (winner) onComplete(winner);
  }, [winner, onComplete]);

  const nameA = `${fencerA.lastName} ${fencerA.firstName}`.trim();
  const nameB = `${fencerB.lastName} ${fencerB.firstName}`.trim();

  return (
    <div className="tiebreaker-overlay" onClick={e => e.stopPropagation()}>
      <div className="tiebreaker-container">
        <h2 className="tiebreaker-title">{t('tiebreaker.title')}</h2>
        <p className="tiebreaker-subtitle">{t('tiebreaker.subtitle')}</p>

        <div className="coin-scene">
          <div className="coin-3d" ref={coinRef}>
            {/* Face verte — Tireur A */}
            <div className="coin-face coin-green">
              <span className="coin-color-label">{t('tiebreaker.green')}</span>
              <span className="coin-fencer-name">{nameA}</span>
            </div>
            {/* Face rouge — Tireur B */}
            <div className="coin-face coin-red">
              <span className="coin-color-label">{t('tiebreaker.red')}</span>
              <span className="coin-fencer-name">{nameB}</span>
            </div>
          </div>
        </div>

        {phase === 'done' && winner && (
          <div className={`tiebreaker-result ${winner === 'A' ? 'result-green' : 'result-red'}`}>
            {t('tiebreaker.wins', { name: winner === 'A' ? nameA : nameB })}
            <span className="result-color">
              ({winner === 'A' ? t('tiebreaker.green') : t('tiebreaker.red')})
            </span>
          </div>
        )}

        {phase === 'done' && (
          <button className="btn btn-primary btn-continue" onClick={handleContinue}>
            {t('tiebreaker.continue')}
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(TiebreakerAnimation);
