/**
 * BellePoule Modern - Tiebreaker Animation Component
 * Animated 3D coin flip to determine winner after sudden death overtime
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Fencer } from '../../shared/types';
import { drawWinner } from '../../shared/utils/suddenDeath';

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

    const t = setTimeout(() => setPhase('done'), 3600);
    return () => clearTimeout(t);
  }, []);

  const handleContinue = useCallback(() => {
    if (winner) onComplete(winner);
  }, [winner, onComplete]);

  const nameA = `${fencerA.lastName} ${fencerA.firstName}`.trim();
  const nameB = `${fencerB.lastName} ${fencerB.firstName}`.trim();

  return (
    <div className="tiebreaker-overlay" onClick={e => e.stopPropagation()}>
      <div className="tiebreaker-container">
        <h2 className="tiebreaker-title">Tirage au sort</h2>
        <p className="tiebreaker-subtitle">Temps écoulé — Égalité persistante</p>

        <div className="coin-scene">
          <div className="coin-3d" ref={coinRef}>
            {/* Face verte — Tireur A */}
            <div className="coin-face coin-green">
              <span className="coin-color-label">VERT</span>
              <span className="coin-fencer-name">{nameA}</span>
            </div>
            {/* Face rouge — Tireur B */}
            <div className="coin-face coin-red">
              <span className="coin-color-label">ROUGE</span>
              <span className="coin-fencer-name">{nameB}</span>
            </div>
          </div>
        </div>

        {phase === 'done' && winner && (
          <div className={`tiebreaker-result ${winner === 'A' ? 'result-green' : 'result-red'}`}>
            🏆 {winner === 'A' ? nameA : nameB} gagne !
            <span className="result-color">({winner === 'A' ? 'VERT' : 'ROUGE'})</span>
          </div>
        )}

        {phase === 'done' && (
          <button className="btn btn-primary btn-continue" onClick={handleContinue}>
            Continuer
          </button>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .tiebreaker-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: tieFadeIn 0.3s ease-out;
        }

        .tiebreaker-container {
          background: #111827;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          padding: 2.5rem 2rem;
          max-width: 520px;
          width: 90%;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          animation: tieScaleIn 0.4s ease-out;
        }

        .tiebreaker-title {
          font-size: 2rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .tiebreaker-subtitle {
          color: #9ca3af;
          margin: -1rem 0 0;
          font-size: 0.9rem;
        }

        .coin-scene {
          perspective: 1000px;
          width: 220px;
          height: 220px;
        }

        .coin-3d {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          position: relative;
        }

        .coin-face {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          backface-visibility: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 0 30px rgba(0,0,0,0.5), inset 0 0 15px rgba(255,255,255,0.12);
        }

        .coin-green {
          background: radial-gradient(circle at 35% 35%, #4ade80, #16a34a 60%, #14532d);
          border: 5px solid rgba(255,255,255,0.2);
        }

        .coin-red {
          background: radial-gradient(circle at 35% 35%, #f87171, #dc2626 60%, #7f1d1d);
          border: 5px solid rgba(255,255,255,0.2);
          transform: rotateY(180deg);
        }

        .coin-color-label {
          font-size: 0.85rem;
          font-weight: 800;
          color: rgba(255,255,255,0.8);
          text-transform: uppercase;
          letter-spacing: 0.2em;
        }

        .coin-fencer-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: #fff;
          text-align: center;
          padding: 0 0.5rem;
          word-break: break-word;
          max-width: 85%;
          text-shadow: 0 2px 6px rgba(0,0,0,0.4);
        }

        .tiebreaker-result {
          font-size: 1.4rem;
          font-weight: 800;
          padding: 0.75rem 2rem;
          border-radius: 12px;
          animation: resultPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .tiebreaker-result.result-green {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.12);
          border: 2px solid #22c55e;
        }

        .tiebreaker-result.result-red {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.12);
          border: 2px solid #ef4444;
        }

        .result-color {
          font-size: 0.85rem;
          opacity: 0.75;
          font-weight: 600;
        }

        .btn-continue {
          padding: 0.85rem 2.5rem;
          font-size: 1.1rem;
          background: #3b82f6;
          color: #fff;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          transition: background 0.2s;
        }
        .btn-continue:hover { background: #2563eb; }

        @keyframes tieFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes tieScaleIn {
          from { transform: scale(0.85); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        @keyframes resultPop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `,
        }}
      />
    </div>
  );
};

export default React.memo(TiebreakerAnimation);
