/**
 * BellePoule Modern - Boutons de zoom du tableau (extraits de TableauView, #1542)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface BracketZoomControlsProps {
  zoom: number;
  setZoom: (updater: number | ((z: number) => number)) => void;
  setPan: (pan: { x: number; y: number }) => void;
}

const BracketZoomControls: React.FC<BracketZoomControlsProps> = ({ zoom, setZoom, setPan }) => {
  const { t } = useTranslation();
  return (
    <div className="bracket-zoom-controls">
      <button
        className="bracket-zoom-btn"
        onClick={() => setZoom(z => Math.min(2.5, parseFloat((z + 0.1).toFixed(2))))}
        title={t('tableauView.zoom_in')}
      >
        +
      </button>
      <span className="bracket-zoom-level">{Math.round(zoom * 100)}%</span>
      <button
        className="bracket-zoom-btn"
        onClick={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }}
        title={t('tableauView.zoom_reset')}
      >
        ⊙
      </button>
      <button
        className="bracket-zoom-btn"
        onClick={() => setZoom(z => Math.max(0.3, parseFloat((z - 0.1).toFixed(2))))}
        title={t('tableauView.zoom_out')}
      >
        −
      </button>
    </div>
  );
};

export default React.memo(BracketZoomControls);
