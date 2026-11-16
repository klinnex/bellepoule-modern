/**
 * BellePoule Modern - Types RGPD (#1882) : droits des personnes, conservation,
 * exposition réseau, archives .bpm chiffrées.
 * Licensed under GPL-3.0
 */

/** Une personne retrouvée dans la base : ses fiches tireur et ses fiches membre */
export interface PrivacyPerson {
  /** Clé de regroupement (licence, sinon nom + prénom + date de naissance) */
  key: string;
  lastName: string;
  firstName: string;
  birthDate: string | null;
  license: string | null;
  club: string | null;
  fencers: Array<{
    fencerId: string;
    competitionId: string;
    competitionTitle: string;
    competitionDate: string | null;
  }>;
  members: Array<{ memberId: string; clubId: string | null; clubName: string }>;
}

/** Fiches visées par une action RGPD */
export interface PrivacyPersonRef {
  fencerIds?: string[];
  memberIds?: string[];
}

type Row = Record<string, unknown>;

/** Export « droit d'accès / portabilité » : lignes brutes par table */
export interface PersonalDataExport {
  format: 'bellepoule-modern/personal-data';
  version: 1;
  exportedAt: string;
  subject: { lastName: string; firstName: string; license: string | null };
  competitions: Array<{ competition: Row | null; fencer: Row; related: Record<string, Row[]> }>;
  club: Array<{ club: Row | null; member: Row; attendance: Row[]; bouts: Row[] }>;
}

export interface RetentionCandidates {
  competitions: Array<{ id: string; title: string; date: string; fencerCount: number }>;
  members: Array<{
    id: string;
    lastName: string;
    firstName: string;
    clubName: string;
    lastActivity: string;
  }>;
}

/** Affichage des noms sur le réseau (pages du serveur distant) */
export type NameMasking = 'full' | 'initial' | 'initials';

export type RetentionAction = 'anonymize' | 'delete';

export interface PrivacySettings {
  /** Noms complets, « NOM P. » ou « N. P. » sur les pages servies en Wi-Fi */
  nameMasking: NameMasking;
  /** Durée de conservation des compétitions (mois) ; 0 = illimitée */
  competitionRetentionMonths: number;
  /** Durée de conservation des membres inactifs du club (mois) ; 0 = illimitée */
  memberRetentionMonths: number;
  /** Action appliquée aux données échues */
  retentionAction: RetentionAction;
  /** Application automatique au démarrage (sinon : rappel et purge assistée) */
  autoPurge: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  nameMasking: 'full',
  competitionRetentionMonths: 0,
  memberRetentionMonths: 0,
  retentionAction: 'anonymize',
  autoPurge: false,
};

export interface RetentionPurgeResult {
  competitions: number;
  members: number;
}

export interface PrivacyAPI {
  getSettings: () => Promise<PrivacySettings>;
  setSettings: (
    settings: Partial<PrivacySettings>
  ) => Promise<{ success: boolean; settings?: PrivacySettings; error?: string }>;
  findPersons: (query: string) => Promise<PrivacyPerson[]>;
  /** Boîte d'enregistrement puis export JSON des données de la personne */
  exportPerson: (
    ref: PrivacyPersonRef,
    defaultName?: string
  ) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
  /** Données de la personne (export PDF côté renderer) */
  getPersonData: (ref: PrivacyPersonRef) => Promise<PersonalDataExport>;
  anonymizePerson: (
    ref: PrivacyPersonRef
  ) => Promise<{ fencers: number; members: number; pseudonym: string }>;
  erasePerson: (ref: PrivacyPersonRef) => Promise<{ fencers: number; members: number }>;
  retentionCandidates: () => Promise<RetentionCandidates>;
  /** Applique l'action de conservation aux éléments choisis (tous les candidats si omis) */
  applyRetention: (selection?: {
    competitionIds?: string[];
    memberIds?: string[];
  }) => Promise<RetentionPurgeResult>;
  /** Exporte une compétition (ou toute la base si null) dans un .bpm chiffré par mot de passe */
  exportEncryptedBpm: (
    competitionId: string | null,
    password: string
  ) => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
  /** Mot de passe de l'archive chiffrée en attente d'ouverture (Fichier → Ouvrir) */
  openEncryptedBpm: (
    password: string
  ) => Promise<{ success: boolean; ids?: string[]; error?: string }>;
  cancelEncryptedBpm: () => Promise<void>;
  onEncryptedBpmRequest: (callback: (fileName: string) => void) => () => void;
}
