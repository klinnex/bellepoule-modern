/**
 * BellePoule Modern - Modèle commun des appareils de piste (#1829)
 * Indépendant du protocole : chaque pilote (Cyrano aujourd'hui ; RS422-FPA, Favero série,
 * OPP2/MQTT ensuite) convertit ses trames en `PisteInput` et traduit les `PisteCommand` en
 * trames. Le PisteHub ne connaît que ce modèle.
 * Licensed under GPL-3.0
 */

/** État de l'appareil : assaut, halte, pause (minute de repos), attente, fin en attente d'ACK. */
export type PisteFencingState = 'fencing' | 'halt' | 'pause' | 'waiting' | 'ending';

/** Statut d'un tireur sur l'appareil. */
export type PisteFencerStatus = 'normal' | 'victory' | 'defeat' | 'abandon' | 'exclusion';

/** Côté de l'appareil ; `none` = pas de priorité. */
export type PistePriority = 'none' | 'right' | 'left';

/** Type de rencontre : individuelle, ou par équipes (relais). */
export type PisteMatchType = 'individual' | 'team';

/** État d'un côté (droite / gauche) tel que l'appareil l'affiche. */
export interface PisteSideState {
  /** Identifiant du tireur tel que l'appareil le renvoie (éventuellement tronqué) */
  id?: string;
  name?: string;
  nat?: string;
  score?: number;
  status?: PisteFencerStatus;
  yellowCards?: number;
  redCards?: number;
  /** Cartons P (non-combativité) : jaune, rouges, noirs */
  pYellow?: number;
  pRed?: number;
  pBlack?: number;
  light?: boolean;
  whiteLight?: boolean;
  /** Interventions médicales */
  medical?: number;
  /** Demande d'entrée du remplaçant (équipes) */
  reserve?: boolean;
}

/** État normalisé d'un appareil de piste. */
export interface PisteState {
  state?: PisteFencingState;
  /** Chrono en secondes (centièmes possibles sous 10 s) */
  stopwatch?: number;
  priority?: PistePriority;
  type?: PisteMatchType;
  /** Période (individuel) ou n° de relais (équipes) */
  round?: number;
  right?: PisteSideState;
  left?: PisteSideState;
}

/** Origine d'une entrée : pilote et piste. */
export interface PisteSource {
  driver: string;
  piste: string;
}

interface PisteInputBase {
  source: PisteSource;
  /** Numéro de séquence strictement croissant par piste (fourni par le pilote) */
  seq: number;
}

/** Entrée d'un appareil : état complet, ou touche NEXT / PREV. */
export type PisteInput =
  | (PisteInputBase & { kind: 'state'; state: PisteState })
  | (PisteInputBase & { kind: 'next' })
  | (PisteInputBase & { kind: 'prev' });

/** Tireur à afficher (zone droite ou gauche). */
export interface PisteDisplaySide {
  /** Identifiant stable (jamais le nom) */
  id: string;
  lastName: string;
  firstName: string;
  /** Pays, club, ligue ou équipe : le pilote le réduit à sa longueur */
  nat?: string;
  score?: number;
  /** Cartons déjà donnés (match repris, appareil redémarré) */
  yellowCards?: number;
  redCards?: number;
  pRed?: number;
  pBlack?: number;
}

/** Match (ou relais) à afficher sur l'appareil. */
export interface PisteDisplay {
  type: PisteMatchType;
  /** Phase : 1er tour de poules = 1… ; tableau = dernier tour de poules + 1 (omis : relais) */
  phase?: number;
  /** N° de poule ou identifiant de tableau (`A32`) */
  poulTab?: string;
  match?: number;
  /** Période (individuel) ou n° de relais (équipes, 1 à 9) */
  round?: number;
  time?: string;
  /** Chrono à reprendre, en secondes (match rappelé) */
  stopwatch?: number;
  /** Arme BellePoule ('E' | 'F' | 'S' | 'L' | 'C') */
  weapon: string;
  right: PisteDisplaySide;
  left: PisteDisplaySide;
  referee?: { id: string; name: string; nat?: string };
}

/** Commande envoyée à un appareil. */
export type PisteCommand =
  | {
      kind: 'display';
      display: PisteDisplay;
      /** épreuve (pistes partagées) */ competition?: string;
    }
  | { kind: 'clear' }
  | { kind: 'ack' }
  | { kind: 'nak' };

/**
 * Mode d'une piste :
 * - `master` : appareil maître (score, cartons, chrono viennent de l'appareil) ;
 * - `display` : afficheur (reçoit le match, ses commandes sont ignorées) ;
 * - `manual` : piste hors appareil.
 */
export type PisteMode = 'master' | 'display' | 'manual';

export type PisteLinkState = 'online' | 'stale' | 'offline' | 'never';

/** Liaison d'une piste, telle que le pilote la supervise. */
export interface PisteLink {
  piste: string;
  /** Arène BellePoule rattachée (`/arene{N}`, `/equipe{N}`) */
  arena?: number;
  mode: PisteMode;
  status: PisteLinkState;
}

export type PisteNameLength = 10 | 12 | 15 | 20;

/** Ce que le protocole sait faire : le PisteHub n'exige rien au-delà. */
export interface PisteDriverCapabilities {
  /** L'appareil renvoie les noms des tireurs */
  names: boolean;
  /** Touches NEXT / PREV */
  remote: boolean;
  /** Acquittement de fin (ACK / NAK) */
  ack: boolean;
  chrono: boolean;
  pCards: boolean;
  teams: boolean;
}

export interface PisteDriverEvents {
  /** Entrée d'un appareil ; `link` = état de la piste à la réception */
  input: [input: PisteInput, link: PisteLink];
  /** Changement de statut de liaison */
  status: [link: PisteLink];
}

/** Pilote d'appareils de piste. */
export interface PisteDriver {
  readonly id: string;
  readonly capabilities: PisteDriverCapabilities;
  getStatuses(): PisteLink[];
  findPiste(piste: string): PisteLink | undefined;
  findAllByArena(arena: number): PisteLink[];
  /** Envoie une commande ; false si la piste est inconnue ou le pilote arrêté. */
  send(piste: string, command: PisteCommand): boolean;
  /** Identifiant d'un tireur tel que l'appareil le renverra (troncature du protocole). */
  fencerId(id: string): string;
  /** Longueur des noms affichés, pour les pilotes qui transmettent les noms. */
  setNameLength?(length: PisteNameLength): void;
  on<K extends keyof PisteDriverEvents>(
    event: K,
    listener: (...args: PisteDriverEvents[K]) => void
  ): unknown;
  off<K extends keyof PisteDriverEvents>(
    event: K,
    listener: (...args: PisteDriverEvents[K]) => void
  ): unknown;
}
