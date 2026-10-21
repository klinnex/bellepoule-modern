/**
 * BellePoule Modern - Presentation Mode Component
 * Affichage optimisé pour écrans publics/salles d'armes
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Competition, Pool, Match, MatchStatus } from '../../shared/types';
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
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0f172a',
        color: 'white',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          borderBottom: '2px solid #334155',
          paddingBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold' }}>{competition.title}</h1>
          <p style={{ margin: '10px 0 0 0', fontSize: '1.2rem', color: '#94a3b8' }}>
            {t('presentation.pool_of', { n: currentPool.number, total: pools.length })}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#3b82f6' }}>
            {completedMatches}/{totalMatches}
          </div>
          <div style={{ fontSize: '1rem', color: '#64748b' }}>{t('presentation.finished')}</div>
        </div>
      </div>

      {/* Barre de progression */}
      <div
        style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#1e293b',
          borderRadius: '4px',
          marginBottom: '40px',
          overflow: 'hidden',
        }}
      >
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
      <div style={{ flex: 1, display: 'flex', gap: '30px' }}>
        {/* Liste des tireurs */}
        <div className="flex-1">
          <h2 style={{ marginBottom: '20px', fontSize: '1.5rem', color: '#94a3b8' }}>
            {t('presentation.ranking')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                    {rank.fencer.lastName} {rank.fencer.firstName}
                  </div>
                  <div style={{ fontSize: '1rem', color: '#64748b' }}>
                    {rank.fencer.club || 'Sans club'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#3b82f6' }}>
                    {rank.victories}V - {rank.defeats}D
                  </div>
                  <div style={{ fontSize: '1rem', color: '#64748b' }}>
                    {t('presentation.td_tr', { td: rank.touchesScored, tr: rank.touchesReceived })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Matchs en cours */}
        <div style={{ width: '400px' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '1.5rem', color: '#94a3b8' }}>
            {t('presentation.in_progress')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {currentPool.matches
              .filter(m => m.status === MatchStatus.IN_PROGRESS)
              .slice(0, 3)
              .map((match, idx) => (
                <div
                  key={match.id}
                  style={{
                    padding: '20px',
                    backgroundColor: '#dc2626',
                    borderRadius: '12px',
                    animation: 'pulse 2s infinite',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '1.3rem',
                      fontWeight: 'bold',
                    }}
                  >
                    <span>{match.fencerA?.lastName || 'TBD'}</span>
                    <span style={{ color: '#fca5a5' }}>VS</span>
                    <span>{match.fencerB?.lastName || 'TBD'}</span>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '1.1rem' }}>
                    {t('presentation.strip_live', { n: match.strip || idx + 1 })}
                  </div>
                </div>
              ))}

            {currentPool.matches.filter(m => m.status === MatchStatus.IN_PROGRESS).length === 0 && (
              <div
                style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '1.2rem',
                }}
              >
                {t('presentation.none')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          fontSize: '0.9rem',
          color: '#475569',
        }}
      >
        {t('presentation.keys')}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default React.memo(PresentationMode);
