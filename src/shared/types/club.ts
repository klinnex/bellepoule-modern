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
  createdAt: string;
  updatedAt: string;
}

export type ClubMemberInput = Partial<
  Omit<ClubMember, 'id' | 'cardCode' | 'createdAt' | 'updatedAt'>
> & {
  firstName: string;
  lastName: string;
};

/** Identité du club : en-tête des cartes de membre */
export interface ClubSettings {
  name: string;
  /** Logo en data URL image (png, jpeg, webp, svg) ; absent = pas de logo */
  logo?: string;
}

export type ClubSessionStatus = 'open' | 'closed';

/** Séance d'entraînement (une date, N pistes) */
export interface ClubSession {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface ClubSessionInput {
  date: string;
  label?: string;
  weapon?: Weapon;
  stripCount?: number;
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
  getSettings: () => Promise<ClubSettings>;
  /** logo: null efface le logo */
  updateSettings: (data: { name?: string; logo?: string | null }) => Promise<ClubSettings>;
  listMembers: (includeInactive?: boolean) => Promise<ClubMember[]>;
  /** Membre d'après le code lu sur sa carte (actifs seulement) */
  findMemberByCardCode: (code: string) => Promise<ClubMember | null>;
  /** Nouveau code : l'ancienne carte devient invalide */
  regenerateCardCode: (id: string) => Promise<ClubMember | null>;
  createMember: (data: ClubMemberInput) => Promise<ClubMember>;
  updateMember: (id: string, data: Partial<ClubMemberInput>) => Promise<ClubMember | null>;
  /** Effacement définitif (RGPD) : présences et combats compris ; archiver = active:false */
  deleteMember: (id: string) => Promise<void>;
  /** Import en lot : nouveaux créés, existants complétés (licence puis nom), doublons ignorés */
  importMembers: (
    inputs: ClubMemberInput[]
  ) => Promise<import('../utils/clubImport').ClubImportResult>;
  listSessions: (range?: { from?: string; to?: string }) => Promise<ClubSession[]>;
  getSession: (id: string) => Promise<ClubSession | null>;
  createSession: (data: ClubSessionInput) => Promise<ClubSession>;
  updateSession: (id: string, data: Partial<ClubSessionInput>) => Promise<ClubSession | null>;
  /** Ferme la séance : combats non terminés annulés */
  closeSession: (id: string) => Promise<ClubSession | null>;
  reopenSession: (id: string) => Promise<ClubSession | null>;
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
