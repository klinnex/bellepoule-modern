/**
 * BellePoule Modern - Croix rouge médicale (sortie pour raison médicale, #1256)
 * Licensed under GPL-3.0
 */

import React from 'react';

export const MedicalCrossIcon: React.FC = () => (
  <svg
    className="medical-cross-icon"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    aria-hidden="true"
    focusable="false"
    data-testid="medical-cross-icon"
  >
    <path fill="#dc2626" d="M8 2h8v6h6v8h-6v6H8v-6H2V8h6z" />
  </svg>
);
