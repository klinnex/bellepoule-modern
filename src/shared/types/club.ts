/**
 * BellePoule Modern - Mode Club (#1872) : membres pré-enregistrés, séances libres,
 * combats sur pistes et statistiques par période.
 * Licensed under GPL-3.0
 */
import type { Weapon } from './index';

export type Laterality = 'R' | 'L';

/** Membre du club, persistant d'une saison à l'autre */
export interface ClubMember {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  license?: string;
  /** 'M' | 'F' | 'X' */
  gender?: string;
  birthYear?: number;
  /** Armes pratiquées (vide = toutes) */
  weapons: Weapon[];
  laterality?: Laterality;
  category?: string;
  notes?: string;
  /** false = archivé (n'apparaît plus dans le pointage, stats conservées) */
  active: boolean;
  /** Code de la carte de club (QR `BPC1:M:<code>`), 10 hex ; régénérable si carte perdue */
  cardCode: string;
  /** Photo en data URL image (png, jpeg, webp) ; absente = initiales */
  photo?: string;
  createdAt: string;
  updatedAt: string;
}

export type ClubMemberInput = Partial<
  Omit<ClubMember, 'id' | 'clubId' | 'cardCode' | 'photo' | 'createdAt' | 'updatedAt'>
> & {
  firstName: string;
  lastName: string;
  /** null efface la photo */
  photo?: string | null;
};

/** Club (plusieurs clubs possibles, #1872) */
export interface Club {
  id: string;
  name: string;
  logo?: string;
  stripCount: number;
  /** Arme par défaut des séances (règles de la saisie distante) */
  weapon?: Weapon;
  createdAt: string;
  updatedAt: string;
}

/** Club vu depuis l'accueil : effectif et séance ouverte */
export interface ClubSummary extends Club {
  membersCount: number;
  openSessionDate: string | null;
}

export interface ClubUpdate {
  name?: string;
  logo?: string | null;
  stripCount?: number;
  weapon?: Weapon | null;
}

/** Identité du club : en-tête des cartes de membre */
export interface ClubSettings {
  name: string;
  weapon?: Weapon;
  /** Logo en data URL image (png, jpeg, webp, svg) ; absent = pas de logo */
  logo?: string;
  /** Nombre de pistes de la salle (QR des pistes, séances) ; 1 par défaut */
  stripCount: number;
}

/** planned : préparée à l'avance ; open : en cours ; closed : terminée */
export type ClubSessionStatus = 'planned' | 'open' | 'closed';

/** Bilan d'une séance : ressenti global et pistes d'amélioration */
export interface ClubSessionFeedback {
  /** Note de la séance, 1 à 5 */
  rating?: number;
  wentWell?: string;
  toImprove?: string;
}

/** Remarque reçue par un tireur lors d'une séance */
export interface ClubMemberFeedback {
  sessionId: string;
  date: string;
  label?: string;
  text: string;
}

/** Exercice du plan de cours d'une séance */
export interface ClubPlanItem {
  id: string;
  title: string;
  /** Durée prévue en minutes */
  minutes: number;
  /** Consignes, matériel, variantes */
  details?: string;
  /** Coché pendant la séance */
  done?: boolean;
}

/** Séance d'entraînement (une date, N pistes) */
export interface ClubSession {
  id: string;
  clubId: string;
  /** Date ISO AAAA-MM-JJ */
  date: string;
  label?: string;
  weapon?: Weapon;
  stripCount: number;
  status: ClubSessionStatus;
  openedAt: string;
  closedAt?: string;
  /** Membres pointés présents */
  attendeeIds: string[];
  /** Objectifs pédagogiques de la séance */
  objectives?: string;
  /** Plan de cours */
  plan: ClubPlanItem[];
  /** Notes / compte rendu du maître d'armes */
  notes?: string;
  /** Bilan de la séance */
  feedback?: ClubSessionFeedback;
  /** Remarque du maître d'armes par tireur présent (memberId → texte) */
  memberFeedback: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ClubSessionInput {
  date: string;
  label?: string;
  weapon?: Weapon;
  stripCount?: number;
  objectives?: string;
  plan?: ClubPlanItem[];
  notes?: string;
  feedback?: ClubSessionFeedback | null;
  /** Préparée à l'avance (statut planned), ouverte plus tard avec startSession */
  planned?: boolean;
}

export type ClubBoutStatus = 'pending' | 'in_progress' | 'finished' | 'cancelled';

/** Qui a saisi le score */
export type ClubEntryMode = 'referee' | 'self' | 'master';

/** Combat libre sur une piste */
export interface ClubBout {
  id: string;
  sessionId: string;
  /** Date de la séance (dénormalisée pour les filtres par période) */
  date: string;
  strip?: number;
  memberAId: string;
  memberBId: string;
  scoreA: number;
  scoreB: number;
  maxScore: number;
  /** Vainqueur (égalité possible : null) */
  winnerId: string | null;
  status: ClubBoutStatus;
  entryMode: ClubEntryMode;
  weapon?: Weapon;
  startedAt?: string;
  finishedAt?: string;
  /** Durée en secondes */
  duration?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClubBoutInput {
  sessionId: string;
  memberAId: string;
  memberBId: string;
  strip?: number;
  maxScore?: number;
  entryMode?: ClubEntryMode;
}

export interface ClubBoutResult {
  scoreA: number;
  scoreB: number;
  /** Vainqueur explicite (touche décisive / priorité) ; sinon déduit du score */
  winnerId?: string | null;
  entryMode?: ClubEntryMode;
  duration?: number;
}

/** Filtre des combats (bornes incluses, dates AAAA-MM-JJ) */
export interface ClubBoutFilter {
  clubId?: string;
  sessionId?: string;
  memberId?: string;
  from?: string;
  to?: string;
  weapon?: Weapon;
  /** Inclure combats non terminés (défaut : false) */
  includeUnfinished?: boolean;
}

export type ClubPeriodKind = 'day' | 'month' | 'quarter' | 'season' | 'year';

export interface ClubPeriod {
  kind: ClubPeriodKind;
  from: string;
  to: string;
  /** Libellé court : 2026-11-16, 2026-11, 2026-T4, 2026-2027, 2026 */
  key: string;
}

/** Statistiques d'un membre sur un ensemble de combats terminés */
export interface ClubMemberStats {
  memberId: string;
  bouts: number;
  victories: number;
  defeats: number;
  draws: number;
  /** Victoires / combats (0..1) */
  winRate: number;
  touchesScored: number;
  touchesReceived: number;
  /** TD - TR */
  indice: number;
  /** Nombre de séances distinctes avec au moins un combat */
  sessions: number;
}

/** Face-à-face entre deux membres */
export interface ClubHeadToHead {
  opponentId: string;
  bouts: number;
  victories: number;
  defeats: number;
  draws: number;
  touchesScored: number;
  touchesReceived: number;
}

/** Fiche statistique d'un membre du club (#1872) */
export interface ClubMemberReport {
  stats: ClubMemberStats;
  headToHead: ClubHeadToHead[];
  progression: Array<{ period: ClubPeriod; stats: ClubMemberStats }>;
}

/** Mode Club : membres, séances, combats libres, statistiques (#1872) */
export interface ClubAPI {
  /** Clubs avec effectif et séance ouverte (accueil) */
  listClubs: () => Promise<ClubSummary[]>;
  getClub: (id: string) => Promise<Club | null>;
  createClub: (data: { name: string; stripCount?: number }) => Promise<Club>;
  /** logo: null efface le logo */
  updateClub: (id: string, data: ClubUpdate) => Promise<Club | null>;
  /** Supprime le club et toutes ses données (membres, séances, combats) */
  deleteClub: (id: string) => Promise<void>;
  /** Saisie distante : serveur d'entraînement actif, URL, nombre d'arènes */
  remoteStatus: () => Promise<{ active: boolean; url: string | null; strips: number }>;
  /** Envoie le combat à la tablette arbitre de sa piste */
  pushBout: (boutId: string) => Promise<'ok' | 'no_server' | 'no_arena' | 'busy'>;
  /** Combat annulé : libère l'arène */
  releaseBout: (boutId: string) => Promise<void>;
  /** Photos d'un ZIP (fichiers nommés par licence, comme en compétition) */
  importPhotos: (clubId: string, filepath: string) => Promise<{ matched: number; total: number }>;
  listMembers: (clubId: string, includeInactive?: boolean) => Promise<ClubMember[]>;
  /** Membre d'après le code lu sur sa carte (actifs seulement ; clubId : de ce club) */
  findMemberByCardCode: (code: string, clubId?: string) => Promise<ClubMember | null>;
  /** Nouveau code : l'ancienne carte devient invalide */
  regenerateCardCode: (id: string) => Promise<ClubMember | null>;
  createMember: (clubId: string, data: ClubMemberInput) => Promise<ClubMember>;
  updateMember: (id: string, data: Partial<ClubMemberInput>) => Promise<ClubMember | null>;
  /** Effacement définitif (RGPD) : présences et combats compris ; archiver = active:false */
  deleteMember: (id: string) => Promise<void>;
  /** Import en lot : nouveaux créés, existants complétés (licence puis nom), doublons ignorés */
  importMembers: (
    clubId: string,
    inputs: ClubMemberInput[]
  ) => Promise<import('../utils/clubImport').ClubImportResult>;
  listSessions: (clubId: string, range?: { from?: string; to?: string }) => Promise<ClubSession[]>;
  getSession: (id: string) => Promise<ClubSession | null>;
  createSession: (clubId: string, data: ClubSessionInput) => Promise<ClubSession>;
  updateSession: (id: string, data: Partial<ClubSessionInput>) => Promise<ClubSession | null>;
  /** Ferme la séance : combats non terminés annulés */
  closeSession: (id: string) => Promise<ClubSession | null>;
  reopenSession: (id: string) => Promise<ClubSession | null>;
  /** Remarque pour un tireur présent (vide = effacée) */
  setMemberFeedback: (sessionId: string, memberId: string, text: string) => Promise<void>;
  /** Remarques reçues par un tireur, plus récentes d'abord */
  getMemberFeedback: (memberId: string) => Promise<ClubMemberFeedback[]>;
  /** Séance préparée → ouverte (une seule séance ouverte par club) */
  startSession: (id: string) => Promise<ClubSession | null>;
  deleteSession: (id: string) => Promise<void>;
  /** Renvoie les présents de la séance */
  setAttendance: (sessionId: string, memberId: string, present: boolean) => Promise<string[]>;
  listBouts: (filter?: ClubBoutFilter) => Promise<ClubBout[]>;
  createBout: (data: ClubBoutInput) => Promise<ClubBout>;
  startBout: (id: string) => Promise<ClubBout | null>;
  updateBoutScore: (id: string, scoreA: number, scoreB: number) => Promise<ClubBout | null>;
  finishBout: (id: string, result: ClubBoutResult) => Promise<ClubBout | null>;
  cancelBout: (id: string) => Promise<ClubBout | null>;
  deleteBout: (id: string) => Promise<void>;
  getLeaderboard: (filter?: ClubBoutFilter) => Promise<ClubMemberStats[]>;
  getMemberReport: (
    memberId: string,
    filter?: ClubBoutFilter,
    groupBy?: ClubPeriodKind
  ) => Promise<ClubMemberReport>;
}
