/**
 * BellePoule Modern - Remote Score Entry Types
 * Licensed under GPL-3.0
 */

import { Fencer, Match } from '../types';

export interface RemoteMatch extends Match {
  stripNumber: number;
  refereeId?: string;
  refereeName?: string;
  startTime?: Date;
  estimatedDuration?: number;
}

export interface RemoteScoreUpdate {
  matchId: string;
  scoreA: number;
  scoreB: number;
  status: 'in_progress' | 'finished' | 'abandoned';
  winner?: 'A' | 'B';
  specialStatus?: 'abandon' | 'forfait' | 'exclusion';
  timestamp: Date;
  refereeId: string;
}

export interface RemoteReferee {
  id: string;
  name: string;
  code: string; // Code d'accès simple
  isActive: boolean;
  currentMatch?: string;
  lastActivity: Date;
}

export interface RemoteStrip {
  number: number;
  status: 'available' | 'occupied' | 'maintenance';
  currentMatch?: RemoteMatch;
  assignedReferee?: string;
}

export interface RemoteSession {
  competitionId: string;
  strips: RemoteStrip[];
  referees: RemoteReferee[];
  activeMatches: RemoteMatch[];
  isRunning: boolean;
  startTime?: Date;
  weapon?: string;
}

export interface WebSocketMessage {
  type:
    | 'score_update'
    | 'match_assigned'
    | 'match_finished'
    | 'referee_connected'
    | 'referee_disconnected'
    | 'strip_status_change'
    | 'score_update_broadcast';
  data: any;
  timestamp: Date;
  sender: string;
}

// Interface pour l'arbitre (vue tablette)
export interface RefereeInterface {
  referee: RemoteReferee;
  currentMatch: RemoteMatch | null;
  nextMatch: RemoteMatch | null;
  completedMatches: RemoteMatch[];
  strip: RemoteStrip;
}

// Messages client vers serveur
export interface ClientMessage {
  type: 'login' | 'score_update' | 'match_complete' | 'heartbeat' | 'logout';
  data: any;
}

// Messages serveur vers client
export interface ServerMessage {
  type:
    | 'login_success'
    | 'login_error'
    | 'match_assignment'
    | 'score_update_broadcast'
    | 'session_update'
    | 'error';
  data: any;
}

// Arena management
/** Appareil de piste Cyrano relié à l'arène (#1829) : bandeau côté arbitre */
export interface ArenaCyranoLink {
  piste: string;
  mode: 'master' | 'display' | 'manual';
  online: boolean;
}

export interface Arena {
  id: string;
  name: string;
  number: number;
  currentMatch: ArenaMatch | null;
  activePoolId?: string; // dernière poule assignée (persiste après currentMatch=null)
  status: 'idle' | 'ready' | 'in_progress' | 'finished';
  startTime: Date | null;
  settings: ArenaSettings;
  password?: string;
  /** Inversion de vue (miroir de la piste) ; ne change pas les couleurs des tireurs */
  swapped?: boolean;
  /** Match en cours : gaucher (A) contre droitier → A rouge (#1439) */
  leftHanded?: boolean;
  /** Appareil de piste relié à l'arène (#1829) */
  cyrano?: ArenaCyranoLink | null;
  /** Minute de repos sur l'appareil (état P, #1829) */
  resting?: boolean;
}

export type DisplayTheme = 'dark' | 'light' | 'neon' | 'unicorn' | 'custom';

export type ThemeTargetType = 'arena' | 'kiosk' | 'public' | 'referee' | 'pool';

/** Variables CSS personnalisées pour un thème d'arène */
export interface CustomTheme {
  id: string;
  name: string;
  /** Section cible : arena (piste), kiosk, public, referee (tablette arbitre), pool (poule) */
  targetType: ThemeTargetType;
  /** Valeurs des variables CSS (ex: { '--bg': '#000', '--score-green': '#0f0' }) */
  variables: Record<string, string>;
  /** Mode overlay : image en fond, panneaux transparents, suppression des box-shadows */
  overlayMode?: boolean;
}

export interface ArenaSettings {
  matchDuration: number; // in seconds
  breakDuration: number; // between matches
  autoAdvance: boolean; // automatically load next match
  showPhotos?: boolean; // afficher les photos avant le combat
  cardAnnounce?: boolean; // annoncer les cartons avec raison sur les affichages
  theme?: DisplayTheme; // thème visuel de l'affichage distant
  customTheme?: CustomTheme; // thème personnalisé (si theme === 'custom')
  /** Thèmes par type d'écran (public, referee, pool) — indépendants du thème arena */
  screenThemes?: Partial<Record<ThemeTargetType, CustomTheme>>;
}

export interface ArenaMatch {
  id: string;
  poolId?: string; // absent pour les matchs d'élimination directe
  isTableau?: boolean; // true pour les matchs DE (élimination directe)
  fencerA: Fencer;
  fencerB: Fencer;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'in_progress' | 'finished' | 'not_started' | 'ready';
  startTime: Date | null;
  endTime: Date | null;
  duration?: number; // in seconds
  /** Temps de combat réel (chrono en marche, hors repos) remonté par la tablette (#1817) */
  fightSeconds?: number;
  /**
   * Chrono affiché (secondes) au dernier `update_timer` / `pause_timer` de la tablette (#1829) :
   * persisté avec l'arène, renvoyé aux écrans qui (re)joignent après un redémarrage.
   */
  clockSeconds?: number;
  referee?: { id: string; name: string }; // Arbitre assigné au match
  /**
   * Fin validée sur l'appareil de piste (Cyrano, #1720) : présent si le match a été clos par
   * l'appareil ; `winner` force le vainqueur (égalité avec priorité, abandon, exclusion).
   */
  deviceEnd?: { winner?: 'A' | 'B'; reason?: 'priority' | 'abandon' | 'exclusion' };
  /**
   * Carton noir donné par la tablette à la fin du match : l'exclusion suit le chemin
   * historique (remote:fencer_excluded), le score n'est pas écrit par recordScore (#1980).
   */
  blackCardFencer?: 'A' | 'B';
  /**
   * Match rappelé (PREV) qui s'était terminé par un abandon ou une exclusion signalé par
   * l'appareil : tireur concerné, pour renvoyer son statut à l'appareil (#1829).
   */
  recalledOut?: { fencer: 'A' | 'B'; reason: 'abandon' | 'exclusion' };
}

export interface ArenaUpdate {
  arenaId: string;
  match: ArenaMatch | null;
  /** Appareil de piste Cyrano relié à l'arène (#1829) */
  cyrano?: ArenaCyranoLink | null;
  /** Minute de repos sur l'appareil (état P, #1829) */
  resting?: boolean;
  scoreA?: number;
  scoreB?: number;
  time?: number;
  status: Arena['status'];
  fencerA?: Fencer;
  fencerB?: Fencer;
  timerStatus?: 'running' | 'paused' | 'reset';
  /** Mise à jour venue de l'appareil de piste (mode appareil maître, #1720) : tablettes en miroir */
  source?: 'device';
  cardsA?: string[];
  cardsB?: string[];
  suddenDeath?: boolean;
  overtimeType?: string | null;
  waitingOvertime?: boolean;
  showPhotos?: boolean; // afficher les photos avant le combat
  cardAnnounce?: boolean; // annoncer les cartons avec raison sur les affichages
  theme?: DisplayTheme; // thème visuel de l'affichage distant
  customTheme?: CustomTheme; // thème personnalisé (si theme === 'custom')
  /** Thèmes par type d'écran (public, referee, pool) — indépendants du thème arena */
  screenThemes?: Partial<Record<ThemeTargetType, CustomTheme>>;
  nextMatch?: ArenaMatch | null; // prochain combat (affiché quand status=finished)
  swapped?: boolean;
  /** Gaucher (A) contre droitier : A rouge, B vert (#1439) */
  leftHanded?: boolean;
  refereeFeatureEnabled?: boolean; // fonctionnalité arbitres activée
  blackCardEnabled?: boolean; // carton noir activé (paramètre compétition)
  referees?: RemoteReferee[]; // liste de tous les arbitres de la compétition
  timerDuration?: number; // durée du chrono en secondes pour ce match
  restSeconds?: number; // durée du repos entre périodes (escrime olympique, 0 = désactivé)
  modernRules?: boolean; // règles armes modernes (E/F/S, formule ou rapières) (#1118)
  poolComplete?: boolean; // vrai quand tous les matchs de la poule sont terminés
  completedPoolId?: string; // id de la poule terminée
  refereeSelected?: boolean; // vrai quand l'arbitre a explicitement sélectionné le match
  touchesA?: string[]; // zones touchées par le tireur A ('A'|'B'|'C') — Laser Sabre
  touchesB?: string[]; // zones touchées par le tireur B ('A'|'B'|'C') — Laser Sabre
}

export interface RefereeControl {
  startMatch: () => void;
  pauseMatch: () => void;
  addScore: (fencer: 'A' | 'B', points: number) => void;
  setScore: (scoreA: number, scoreB: number) => void;
  finishMatch: () => void;
  nextMatch: () => void;
}

export interface OrgNote {
  type: 'target_time' | 'free';
  message: string; // texte libre affiché sous le titre
  targetTime?: string; // "HH:MM" uniquement pour type target_time
  countdownPrefix?: string; // mot affiché avant l'heure (ex: "Reprise", "Début")
  createdAt: string; // ISO timestamp
}

/** Demande de signature d'un match de tableau renvoyée vers une piste */
export interface MatchSignatureRequest {
  match: {
    id: string;
    fencerA: { id: string; firstName: string; lastName: string };
    fencerB: { id: string; firstName: string; lastName: string };
  };
  scoreA: number;
  scoreB: number;
}

/** Constat du diagnostic pare-feu Windows (saisie distante) : code traduit côté renderer. */
export interface FirewallFinding {
  level: 'ok' | 'warning' | 'error';
  code: string;
  params?: Record<string, string | number>;
}

/** Résultat du diagnostic pare-feu. supported: false hors Windows (rien n'a été lu). */
export interface FirewallDiagnosis {
  supported: boolean;
  port: number;
  networkCategories: string[];
  findings: FirewallFinding[];
  /** Détail technique en cas d'échec de lecture (affiché tel quel, non traduit). */
  detail?: string;
}

/** API de diagnostic pare-feu (fusionnée dans window.electronAPI.remote). */
export interface RemoteFirewallAPI {
  firewallCheck: (port: number) => Promise<FirewallDiagnosis>;
}

/** Appel DT remonté au renderer (`remote:dt_call`) : carton noir ou abandon signalé par l'appareil (#2000). */
export interface DTCallEvent {
  arenaId: string;
  arenaNumber: number | null;
  matchNumber: number | null;
  competitionId: string | null;
  timestamp: number;
  reason?: 'black_card' | 'abandon';
  fencerId?: string | null;
  fencerName?: string | null;
}
