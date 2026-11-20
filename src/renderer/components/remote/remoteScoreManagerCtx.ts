/**
 * BellePoule Modern - Contexte partagé des sous-composants de RemoteScoreManager (#1599)
 * Licensed under GPL-3.0
 */
import type { useRemoteServerActions } from '../../hooks/remoteScoreManager/useRemoteServerActions';
import type { useRemoteServerState } from '../../hooks/remoteScoreManager/useRemoteServerState';
import type { RemoteScoreManagerProps } from './remoteScoreManagerShared';

/** Props du composant + sorties des hooks d'état et d'actions */
export type RemoteScoreManagerCtx = RemoteScoreManagerProps &
  ReturnType<typeof useRemoteServerState> &
  ReturnType<typeof useRemoteServerActions>;
