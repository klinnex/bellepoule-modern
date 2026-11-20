/**
 * BellePoule Modern - Icônes lucide des phases de compétition (#1532)
 * Licensed under GPL-3.0
 */

import {
  ChartColumn,
  ClipboardList,
  Flag,
  Gavel,
  ScrollText,
  Settings,
  SkipForward,
  Swords,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '../common/Icon';

export const PHASE_ICONS = {
  checkin: ClipboardList,
  poolprep: Settings,
  pools: Target,
  skipPools: SkipForward,
  quest: Swords,
  ranking: ChartColumn,
  tableau: Trophy,
  results: Flag,
  logs: ScrollText,
  referees: Gavel,
} satisfies Record<string, LucideIcon>;

/** Icônes des phases du format par équipes (ordre de TEAM_PHASE_VIEWS) */
export const TEAM_PHASE_ICONS: LucideIcon[] = [Users, Target, Trophy, Flag];

/** Pictogramme des états vides de phase */
export const PhaseEmptyIcon = () => <Icon icon={Target} size={24} />;
