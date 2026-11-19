/**
 * BellePoule Modern - Masque d'escrime (tireurs, barre de la compétition, #1817)
 * Trait façon lucide : coque grillagée + bavette, occupe toute la largeur du cadre 24×24.
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
    <path d="M5 9a7 7 0 0 1 14 0v4a7 7 0 0 1-14 0z" />
    {/* Grille */}
    <path d="M8.5 3.5v15M12 2v18M15.5 3.5v15M5 9h14M5 13h14" />
    {/* Bavette */}
    <path d="M7.5 19 6.5 22h11l-1-3" />
  </svg>
);

export default FencingMaskIcon;
