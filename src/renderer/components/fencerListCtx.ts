/**
 * BellePoule Modern - Contexte partagé des sous-composants de FencerList (#1599)
 * Licensed under GPL-3.0
 */
import type { useFencerListState } from '../hooks/fencerList/useFencerListState';
import type { FencerListProps } from './fencerListShared';

/** Props du composant + sorties du hook d'état */
export type FencerListCtx = FencerListProps & ReturnType<typeof useFencerListState>;
