/**
 * BellePoule Modern - Bus OPP2 (#1960)
 * Ce que le pilote OPP2 attend du broker : publier, s'abonner. Le broker intégré
 * (`MqttBroker`) l'implémente sans socket ; un client vers un broker externe l'implémentera.
 * Licensed under GPL-3.0
 */

import type { QoS } from './mqttPacket';

export type Opp2BusMessageHandler = (
  topic: string,
  payload: Buffer,
  meta: { retained: boolean }
) => void;

export interface Opp2Bus {
  publish(topic: string, payload: Buffer | string, opts?: { qos?: QoS; retain?: boolean }): void;
  /** Abonnement ; les messages retenus correspondants sont livrés aussitôt. Renvoie le désabonnement. */
  subscribe(filter: string, handler: Opp2BusMessageHandler): () => void;
}
