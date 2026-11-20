/**
 * BellePoule Modern - Médaille de classement (#1532)
 * Icône lucide colorée (or / argent / bronze) à la place des emojis de médaille ; rien au-delà du 3e rang.
 * Décorative (aria-hidden) : le rang reste affiché en texte à côté.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Medal } from 'lucide-react';
import { Icon } from './Icon';
import type { IconSize } from './Icon';

export const RankMedal: React.FC<{ rank: number | null; size?: IconSize }> = ({
  rank,
  size = 20,
}) =>
  rank !== null && rank >= 1 && rank <= 3 ? (
    <Icon icon={Medal} size={size} className={`rank-medal rank-medal-${rank}`} />
  ) : null;

export default RankMedal;
