/**
 * BellePoule Modern - Icon
 * Enveloppe lucide : tailles par jetons (16 / 20 / 24), trait harmonisé,
 * aria-hidden par défaut (le bouton porte le nom accessible), `label` si l'icône est seule.
 * Licensed under GPL-3.0
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type IconSize = 16 | 20 | 24;

export const ICON_STROKE_WIDTH = 2;

export interface IconProps {
  /** Composant lucide à afficher */
  icon: LucideIcon;
  size?: IconSize;
  /** Nom accessible : obligatoire quand l'icône est seule (sinon aria-hidden) */
  label?: string;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ icon: Glyph, size = 16, label, className }) => (
  <Glyph
    size={size}
    strokeWidth={ICON_STROKE_WIDTH}
    className={className ? `ui-icon ${className}` : 'ui-icon'}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? 'img' : undefined}
    focusable="false"
  />
);

export default Icon;
