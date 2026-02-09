/**
 * BellePoule Modern - Pool Configuration View
 * Page de configuration des poules entre l'appel et la phase de poules.
 * Permet de choisir le nombre de tireurs par poule ou le nombre de poules.
 * Licensed under GPL-3.0
 */

import React, { useState, useMemo } from 'react';
import { Fencer } from '../../shared/types';
import { calculateOptimalPoolCount } from '../../shared/utils/poolCalculations';
import { useTranslation } from '../hooks/useTranslation';

type ConfigMode = 'fencersPerPool' | 'poolCount';

interface PoolConfigurationViewProps {
  checkedInFencers: Fencer[];
  onGenerate: (poolCount: number) => void;
  onBack: () => void;
}

const PoolConfigurationView: React.FC<PoolConfigurationViewProps> = ({
  checkedInFencers,
  onGenerate,
  onBack,
}) => {
  const { t } = useTranslation();
  const fencerCount = checkedInFencers.length;

  // Calculer la valeur optimale par défaut
  const defaultPoolCount = calculateOptimalPoolCount(fencerCount, 5, 7);
  const defaultFencersPerPool = Math.ceil(fencerCount / defaultPoolCount);

  const [mode, setMode] = useState<ConfigMode>('fencersPerPool');
  const [fencersPerPool, setFencersPerPool] = useState(defaultFencersPerPool);
  const [poolCount, setPoolCount] = useState(defaultPoolCount);

  // Calculer le nombre de poules résultant selon le mode
  const computedPoolCount = useMemo(() => {
    if (mode === 'fencersPerPool') {
      if (fencersPerPool >= fencerCount) return 1;
      return Math.ceil(fencerCount / fencersPerPool);
    }
    return poolCount;
  }, [mode, fencersPerPool, poolCount, fencerCount]);

  // Calculer la répartition prévisionnelle
  const distribution = useMemo(() => {
    const count = computedPoolCount;
    if (count <= 0) return [];

    const base = Math.floor(fencerCount / count);
    const remainder = fencerCount % count;

    const pools: number[] = [];
    for (let i = 0; i < count; i++) {
      pools.push(base + (i < remainder ? 1 : 0));
    }
    return pools;
  }, [computedPoolCount, fencerCount]);

  const minFencersInPool = distribution.length > 0 ? Math.min(...distribution) : 0;
  const maxFencersInPool = distribution.length > 0 ? Math.max(...distribution) : 0;

  const handleGenerate = () => {
    onGenerate(computedPoolCount);
  };

  return (
    <div className="content" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ margin: '0 0 0.5rem 0', color: '#1f2937', fontSize: '1.5rem' }}>
          {t('pool_config.title')}
        </h2>
        <p style={{ margin: '0 0 2rem 0', color: '#6b7280', fontSize: '0.95rem' }}>
          {t('pool_config.description')}
        </p>

        {/* Résumé des tireurs */}
        <div style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '8px',
          padding: '1rem 1.5rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <span style={{ fontSize: '1.5rem' }}>&#x1F93A;</span>
          <div>
            <strong style={{ color: '#0369a1' }}>{fencerCount}</strong>
            <span style={{ color: '#0369a1', marginLeft: '0.25rem' }}>
              {t('pool_config.checked_in_fencers')}
            </span>
          </div>
        </div>

        {/* Choix du mode de configuration */}
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
            {t('pool_config.mode_label')}
          </label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setMode('fencersPerPool')}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: mode === 'fencersPerPool' ? '2px solid #3b82f6' : '2px solid #d1d5db',
                background: mode === 'fencersPerPool' ? '#eff6ff' : 'white',
                color: mode === 'fencersPerPool' ? '#1d4ed8' : '#4b5563',
                cursor: 'pointer',
                fontWeight: mode === 'fencersPerPool' ? '600' : '400',
                fontSize: '0.9rem',
                transition: 'all 0.15s ease',
              }}
            >
              {t('pool_config.mode_fencers_per_pool')}
            </button>
            <button
              onClick={() => setMode('poolCount')}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: mode === 'poolCount' ? '2px solid #3b82f6' : '2px solid #d1d5db',
                background: mode === 'poolCount' ? '#eff6ff' : 'white',
                color: mode === 'poolCount' ? '#1d4ed8' : '#4b5563',
                cursor: 'pointer',
                fontWeight: mode === 'poolCount' ? '600' : '400',
                fontSize: '0.9rem',
                transition: 'all 0.15s ease',
              }}
            >
              {t('pool_config.mode_pool_count')}
            </button>
          </div>
        </div>

        {/* Saisie de la valeur */}
        <div style={{ marginBottom: '2rem' }}>
          {mode === 'fencersPerPool' ? (
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                {t('pool_config.fencers_per_pool_label')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="range"
                  min={3}
                  max={Math.min(fencerCount, 12)}
                  value={fencersPerPool}
                  onChange={(e) => setFencersPerPool(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={3}
                  max={fencerCount}
                  value={fencersPerPool}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 3 && val <= fencerCount) {
                      setFencersPerPool(val);
                    }
                  }}
                  style={{
                    width: '70px',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '1.1rem',
                    textAlign: 'center',
                    fontWeight: '600',
                  }}
                />
              </div>
              {fencersPerPool >= fencerCount && (
                <p style={{ color: '#d97706', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  {t('pool_config.single_pool_warning')}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                {t('pool_config.pool_count_label')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, Math.floor(fencerCount / 3))}
                  value={poolCount}
                  onChange={(e) => setPoolCount(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={1}
                  max={Math.floor(fencerCount / 3)}
                  value={poolCount}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 1 && val <= Math.floor(fencerCount / 3)) {
                      setPoolCount(val);
                    }
                  }}
                  style={{
                    width: '70px',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '1.1rem',
                    textAlign: 'center',
                    fontWeight: '600',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Aperçu de la répartition */}
        <div style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#374151', fontSize: '1.1rem' }}>
            {t('pool_config.preview_title')}
          </h3>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{t('pool_config.number_of_pools')}</span>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>{computedPoolCount}</div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{t('pool_config.fencers_per_pool_preview')}</span>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
                {minFencersInPool === maxFencersInPool
                  ? minFencersInPool
                  : `${minFencersInPool} - ${maxFencersInPool}`}
              </div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{t('pool_config.total_matches')}</span>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
                {distribution.reduce((sum, n) => sum + (n * (n - 1)) / 2, 0)}
              </div>
            </div>
          </div>

          {/* Visualisation des poules */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {distribution.map((count, i) => (
              <div
                key={i}
                style={{
                  background: '#dbeafe',
                  border: '1px solid #93c5fd',
                  borderRadius: '6px',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.85rem',
                  color: '#1e40af',
                  fontWeight: '500',
                }}
              >
                {t('pools.pool_number')} {i + 1}: {count} {t('pool_config.fencers_short')}
              </div>
            ))}
          </div>
        </div>

        {/* Boutons d'action */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onBack}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
            }}
          >
            {t('actions.back')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={computedPoolCount < 1 || fencerCount < 3}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.95rem',
              fontWeight: '600',
            }}
          >
            {t('pool_config.generate_pools')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PoolConfigurationView;
