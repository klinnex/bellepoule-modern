/**
 * BellePoule Modern - Icône de carton (#1532)
 * Carré lucide plein (blanc / jaune / rouge / noir) à la place des emojis de carton.
 * Décorative (aria-hidden) sauf si `label` est fourni (icône seule, ex. en-tête de colonne).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Square } from 'lucide-react';
import { Icon } from './Icon';

export type CardIconType = 'white' | 'yellow' | 'red' | 'black';

export const CardIcon: React.FC<{ type: CardIconType | string; label?: string }> = ({
  type,
  label,
}) => <Icon icon={Square} label={label} className={`card-icon card-icon-${type.toLowerCase()}`} />;

export default CardIcon;
