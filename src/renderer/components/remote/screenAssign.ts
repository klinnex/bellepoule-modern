/**
 * BellePoule Modern - Affectation d'un écran connecté (rôle + arène)
 * Partagé entre la télécommande TV (XiaomiRemotePanel) et la section « Écrans connectés »
 * de la saisie distante (ConnectedScreensPanel).
 * Licensed under GPL-3.0
 */

import type { ConnectedClient } from '@shared/types/preload';

export type AssignRole = 'affichage' | 'arbitre' | 'kiosk';

export interface ScreenAssignment {
  role: AssignRole;
  arena: number;
}

type Translate = (key: string, params?: { [key: string]: string | number }) => string;

export function buildAssignRoles(t: Translate): { value: AssignRole; label: string }[] {
  return [
    { value: 'affichage', label: t('remote_score.screen_type_display') },
    { value: 'arbitre', label: t('referee.arbitre') },
    { value: 'kiosk', label: t('xiaomi.client_type_kiosk') },
  ];
}

export function arenaNum(client: ConnectedClient): number {
  if (!client.arenaId) return 1;
  return parseInt(client.arenaId.replace('arena', ''), 10) || 1;
}

/** Affectation déduite du type actuel de l'écran. */
export function defaultAssign(client: ConnectedClient): ScreenAssignment {
  if (client.clientType === 'referee') return { role: 'arbitre', arena: arenaNum(client) };
  if (client.clientType === 'kiosk') return { role: 'kiosk', arena: arenaNum(client) };
  if (client.clientType === 'arena') return { role: 'affichage', arena: arenaNum(client) };
  return { role: 'affichage', arena: 1 }; // lobby et autres
}

/** URL de navigation pour un rôle/arène. `base` vide = chemin relatif (même origine). */
export function assignUrl(base: string, role: AssignRole, arena: number): string {
  if (role === 'kiosk') return `${base}/kiosk`;
  if (role === 'arbitre') return `${base}/arene${arena}/arbitre`;
  return `${base}/arene${arena}`;
}

/** Un écran peut-il recevoir une affectation (rôle/arène) depuis la télécommande ? */
export function isAssignable(client: ConnectedClient): boolean {
  return (
    client.clientType === 'arena' ||
    client.clientType === 'lobby' ||
    client.clientType === 'referee' ||
    client.clientType === 'kiosk'
  );
}
