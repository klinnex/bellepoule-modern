/**
 * BellePoule Modern - Presentation Mode Component
 * Affichage optimisé pour écrans publics/salles d'armes
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Competition, Pool, MatchStatus } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';

interface PresentationModeProps {
  competition: Competition;
  pools: Pool[];
  onClose: () => void;
}

export const PresentationMode: React.FC<PresentationModeProps> = ({
  competition,
  pools,
  onClose,
}) => {
  const { t } = useTranslation();
  const [currentPoolIndex, setCurrentPoolIndex] = useState(0);
  const [, setIsFullscreen] = useState(false);

  // Active le mode plein écran
  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (error) {
        logger.warn(
          LogCategory.UI,
          "Impossible d'activer le plein écran",
          undefined,
          error as Error
        );
      }
    };

    enterFullscreen();

    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Écouteur pour la touche Echap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        setCurrentPoolIndex(prev => Math.min(prev + 1, pools.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentPoolIndex(prev => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pools.length]);

  // Rotation automatique toutes les 10 secondes
  useEffect(() => {
    if (pools.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentPoolIndex(prev => (prev + 1) % pools.length);
    }, 10000);

    return () => clearInterval(interval);
  }, [pools.length]);

  const currentPool = pools[currentPoolIndex];
  if (!currentPool) return null;

  const completedMatches = currentPool.matches.filter(
    m => m.status === MatchStatus.FINISHED
  ).length;
  const totalMatches = currentPool.matches.length;
  const progress = totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;

  return (
    <div className="presentation-mode-1">
      {/* Header */}
      <div className="presentation-mode-2">
        <div>
          <h1 className="presentation-mode-3">{competition.title}</h1>
          <p className="presentation-mode-4">
            {t('presentation.pool_of', { n: currentPool.number, total: pools.length })}
          </p>
        </div>
        <div className="presentation-mode-5">
          <div className="presentation-mode-6">
            {completedMatches}/{totalMatches}
          </div>
          <div className="presentation-mode-7">{t('presentation.finished')}</div>
        </div>
      </div>

      {/* Barre de progression */}
      <div className="presentation-mode-8">
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            backgroundColor: '#3b82f6',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      {/* Grille des scores */}
      <div className="presentation-mode-9">
        {/* Liste des tireurs */}
        <div className="flex-1">
          <h2 className="presentation-mode-10">{t('presentation.ranking')}</h2>
          <div className="presentation-mode-11">
            {currentPool.ranking?.slice(0, 8).map((rank, index) => (
              <div
                key={rank.fencer.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '20px',
                  backgroundColor: index < 3 ? '#1e3a5f' : '#1e293b',
                  borderRadius: '12px',
                  border: index < 3 ? '2px solid #3b82f6' : '2px solid transparent',
                }}
              >
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    backgroundColor: index < 3 ? '#3b82f6' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    marginRight: '20px',
                  }}
                >
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="presentation-mode-12">
                    {rank.fencer.lastName} {rank.fencer.firstName}
                  </div>
                  <div className="presentation-mode-7">{rank.fencer.club || 'Sans club'}</div>
                </div>
                <div className="presentation-mode-5">
                  <div className="presentation-mode-13">
                    {rank.victories}V - {rank.defeats}D
                  </div>
                  <div className="presentation-mode-7">
                    {t('presentation.td_tr', { td: rank.touchesScored, tr: rank.touchesReceived })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Matchs en cours */}
        <div className="presentation-mode-14">
          <h2 className="presentation-mode-10">{t('presentation.in_progress')}</h2>
          <div className="presentation-mode-11">
            {currentPool.matches
              .filter(m => m.status === MatchStatus.IN_PROGRESS)
              .slice(0, 3)
              .map((match, idx) => (
                <div key={match.id} className="presentation-mode-15">
                  <div className="presentation-mode-16">
                    <span>{match.fencerA?.lastName || 'TBD'}</span>
                    <span className="presentation-mode-17">VS</span>
                    <span>{match.fencerB?.lastName || 'TBD'}</span>
                  </div>
                  <div className="presentation-mode-18">
                    {t('presentation.strip_live', { n: match.strip || idx + 1 })}
                  </div>
                </div>
              ))}

            {currentPool.matches.filter(m => m.status === MatchStatus.IN_PROGRESS).length === 0 && (
              <div className="presentation-mode-19">{t('presentation.none')}</div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="presentation-mode-20">{t('presentation.keys')}</div>
    </div>
  );
};

export default React.memo(PresentationMode);
