/**
 * BellePoule Modern - Logo : les 4 armes (épée, fleuret, sabre, sabre laser)
 * rayonnant depuis un anneau central (la piste).
 * Licensed under GPL-3.0
 */

import React, { useId } from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/** Chaque arme est dessinée pointe vers le haut, poignée près du centre (0,0). */
const Grip: React.FC = () => <line x1="0" y1="-7.5" x2="0" y2="-11" strokeWidth="3.2" />;

const Epee: React.FC = () => (
  <g>
    <Grip />
    <path d="M-6 -11.5 A6 6 0 0 1 6 -11.5 Z" fill="currentColor" stroke="none" />
    <line x1="0" y1="-14" x2="0" y2="-29.5" strokeWidth="2.6" />
  </g>
);

const Fleuret: React.FC = () => (
  <g>
    <Grip />
    <path d="M-3.6 -11.5 A3.6 3.6 0 0 1 3.6 -11.5 Z" fill="currentColor" stroke="none" />
    <line x1="0" y1="-13" x2="0" y2="-28" strokeWidth="1.8" />
    <circle cx="0" cy="-29" r="1.7" fill="currentColor" stroke="none" />
  </g>
);

const Sabre: React.FC = () => (
  <g>
    <Grip />
    <path d="M-4 -11.5 L4 -11.5 Q7 -9.5 5.5 -7 Q4.5 -5.5 1.8 -5.8" fill="none" strokeWidth="2.2" />
    <path d="M0 -12 Q3 -21 -0.5 -29.5" strokeWidth="2.6" fill="none" />
  </g>
);

const Laser: React.FC<{ glowId: string }> = ({ glowId }) => (
  <g>
    <rect x="-2" y="-14" width="4" height="8" rx="1.2" fill="currentColor" stroke="none" />
    <line x1="-3.2" y1="-14" x2="3.2" y2="-14" strokeWidth="2" />
    <line
      x1="0"
      y1="-16"
      x2="0"
      y2="-29.5"
      style={{ stroke: 'var(--color-laser, #ef4444)' }}
      strokeWidth="4.2"
      filter={`url(#${glowId})`}
    />
    <line x1="0" y1="-16" x2="0" y2="-29.5" stroke="#fff" strokeWidth="1.3" strokeOpacity="0.9" />
  </g>
);

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 64, className }) => {
  const glowId = `bp-laser-glow-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="BellePoule Modern"
      data-testid="brand-logo"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    >
      <defs>
        <filter id={glowId} filterUnits="userSpaceOnUse" x="-40" y="-40" width="80" height="80">
          <feGaussianBlur stdDeviation="1.3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform="translate(32 32)">
        <circle r="4.6" strokeWidth="2.2" />
        <circle r="1.6" fill="currentColor" stroke="none" />
        <g transform="rotate(-45)">
          <Epee />
        </g>
        <g transform="rotate(45)">
          <Fleuret />
        </g>
        <g transform="rotate(135)">
          <Sabre />
        </g>
        <g transform="rotate(-135)">
          <Laser glowId={glowId} />
        </g>
      </g>
    </svg>
  );
};
