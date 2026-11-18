/**
 * BellePoule Modern - Masque d'escrime (tireurs, barre de la compétition, #1817)
 * Trait façon lucide : coque grillagée + bavette.
 * Licensed under GPL-3.0
 */

import React from 'react';

export const FencingMaskIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    className="ui-icon fencing-mask-icon"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    data-testid="fencing-mask-icon"
  >
    {/* Coque */}
    <path d="M6 9a6 6 0 0 1 12 0v4a6 6 0 0 1-12 0z" />
    {/* Grille */}
    <path d="M9 4.5v13M12 3v16M15 4.5v13M6 9h12M6 13h12" />
    {/* Bavette */}
    <path d="M8 18.5 7 21h10l-1-2.5" />
  </svg>
);

export default FencingMaskIcon;
