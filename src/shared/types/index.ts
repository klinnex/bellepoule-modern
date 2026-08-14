/**
 * BellePoule Modern - Type Definitions
 * Based on the original BellePoule C++ codebase
 * Licensed under GPL-3.0
 */

// ============================================================================
// Enums
// ============================================================================

export enum Weapon {
  EPEE = 'E',
  FOIL = 'F',
  SABRE = 'S',
  LASER = 'L', // Sabre Laser
  CUSTOM = 'C', // Formule à la carte
}

export enum Gender {
  MALE = 'M',
  FEMALE = 'F',
  MIXED = 'X',
}

export enum FencerStatus {
  QUALIFIED = 'Q', // Qualifié
  ELIMINATED = 'E', // Éliminé
  ABANDONED = 'A', // Abandon
  EXCLUDED = 'X', // Exclu (carton noir)
  NOT_CHECKED_IN = 'N', // Non pointé
  CHECKED_IN = 'P', // Pointé (présent)
  FORFAIT = 'F', // Forfait
}

// ============================================================================
// Card Types (FFE Sabre Laser)
// ============================================================================

export enum CardGroup {
  GROUP_1 = 1, // J → R → R → Exclusion
  GROUP_2 = 2, // R → R → Exclusion
  GROUP_3 = 3, // R → Exclusion
  GROUP_4 = 4, // Noir immédiat
}

export enum CardReason {
  EARLY_START = 'early_start',
  LATE_STOP = 'late_stop',
  BODY_CONTACT = 'body_contact',
  COUNTER_ATTACK = 'counter_attack',
  TARGET_SUBSTITUTION = 'target_substitution',
  VOLUNTARY_DROP = 'voluntary_drop',
  TIME_WASTING = 'time_wasting',
  NON_COMPLIANT_GEAR = 'non_compliant_gear',
  ESTOC = 'estoc',
  UNARMED_HAND = 'unarmed_hand',
  VOLUNTARY_EXIT = 'voluntary_exit',
  HEAVY_HIT = 'heavy_hit',
  BRUTALITY = 'brutality',
  DANGEROUS = 'dangerous',
  REFUSAL = 'refusal',
  UNSPORTSMANLIKE = 'unsportsmanlike',
  CHEATING = 'cheating',
}

export interface Card {
  id: string;
  matchId: string;
  fencerId: string;
  type: string; // CardType from penalties feature
  reason: CardReason;
  group: CardGroup;
  timestamp: Date;
  pointsAwarded: number;
  resultingExclusion: boolean;
}

export interface WeaponCardScoreImpact {
  white: number;
  yellow: number;
  red: number;
  black: number;
}

export interface WeaponCardConfig {
  availableReasons: CardReason[];
  reasonToGroup: Partial<Record<CardReason, CardGroup>>;
  scoreImpact: WeaponCardScoreImpact;
}

// ============================================================================
// Match Mode (Sudden Death)
// ============================================================================

export enum MatchMode {
  NORMAL = 'normal',
  SUDDEN_DEATH_CHALLENGER = 'sudden_death_challenger',
  SUDDEN_DEATH_TIMEOUT = 'sudden_death_timeout',
  SUPPLEMENTARY_TIME = 'supplementary_time',
}

// ============================================================================
// Target Zone (Sabre Laser Scoring)
// ============================================================================

export enum TargetZone {
  ZONE_A = 'A', // 1 point: Main, poignets, arme
  ZONE_B = 'B', // 3 points: Bras, jambes
  ZONE_C = 'C', // 5 points: Tête, tronc
}

export const ZONE_POINTS: Record<TargetZone, number> = {
  [TargetZone.ZONE_A]: 1,
  [TargetZone.ZONE_B]: 3,
  [TargetZone.ZONE_C]: 5,
};

export const ZONE_LABELS: Record<TargetZone, string> = {
  [TargetZone.ZONE_A]: 'Main/Arme',
  [TargetZone.ZONE_B]: 'Bras/Jambes',
  [TargetZone.ZONE_C]: 'Tête/Tronc',
};

export interface Touch {
  id: string;
  matchId: string;
  fencerId: string;
  zone: TargetZone;
  points: number;
  timestamp: Date;
  isValidInSuddenDeath: boolean;
  isReversed?: boolean; // For reversal in sudden death
}

// ============================================================================
// Penalty Types (Arena Exit)
// ============================================================================

export enum PenaltyType {
  ARENA_EXIT = 'arena_exit',
  ARENA_EXIT_VOLUNTARY = 'arena_exit_voluntary',
}

export enum MatchStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

export enum PhaseType {
  CHECKIN = 'checkin',
  POOL = 'pool',
  QUEST = 'quest',
  DIRECT_ELIMINATION = 'direct_elimination',
  CLASSIFICATION = 'classification',
}

export enum Category {
  U11 = 'U11', // Poussins
  U13 = 'U13', // Benjamins
  U15 = 'U15', // Minimes
  U17 = 'U17', // Cadets
  U20 = 'U20', // Juniors
  SENIOR = 'SEN', // Seniors
  V1 = 'V1', // Vétérans 1 (40-49)
  V2 = 'V2', // Vétérans 2 (50-59)
  V3 = 'V3', // Vétérans 3 (60-69)
  V4 = 'V4', // Vétérans 4 (70+)
}

// ============================================================================
// Base Types
// ============================================================================

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Fencer (Tireur)
// ============================================================================

export interface Fencer extends BaseEntity {
  ref: number; // Numéro de référence unique dans la compétition
  lastName: string; // Nom
  firstName: string; // Prénom
  birthDate?: Date; // Date de naissance
  gender: Gender; // Sexe
  nationality: string; // Nation (code ISO)
  region?: string; // Région
  club?: string; // Club
  license?: string; // Numéro de licence
  ranking?: number; // Classement
  status: FencerStatus; // Statut dans la compétition
  seedNumber?: number; // Tête de série
  initialRanking?: number; // Classement initial
  finalRanking?: number; // Classement final

  // Stats calculées dans les poules
  poolStats?: PoolStats;

  // Photo du tireur (base64)
  photo?: string;

  // Sabre Laser specific
  competitionCards?: Card[];
  isExcluded?: boolean;
}

export interface PoolStats {
  victories: number; // Victoires
  defeats: number; // Défaites
  touchesScored: number; // Touches données (TD)
  touchesReceived: number; // Touches reçues (TR)
  index: number; // Indice (TD - TR)
  matchesPlayed: number; // Matchs joués
  victoryRatio: number; // V/M (ratio victoires/matchs)
  maxSingleMatchScore?: number; // Meilleur score marqué en un seul match
  poolRank?: number; // Rang dans la poule
  overallRank?: number; // Rang général après poules
}

// ============================================================================
// Referee (Arbitre)
// ============================================================================

export interface Referee extends BaseEntity {
  ref: number;
  lastName: string;
  firstName: string;
  birthDate?: Date;
  gender: Gender;
  nationality: string;
  region?: string;
  club?: string; // Club d'affiliation pour éviter les conflits d'intérêts
  license?: string;
  category?: string; // Niveau d'arbitrage (Régional, National, International)
  status: 'available' | 'assigned' | 'unavailable';
  assignedMatches?: number; // Nombre de matchs arbitrés
  lastAssignmentTime?: Date; // Dernière assignation pour rotation
  maxMatchesPerDay?: number; // Limite de matchs par jour
  restPeriodMinutes?: number; // Temps de repos minimum entre matchs
}

// ============================================================================
// Score
// ============================================================================

export interface Score {
  value: number | null; // Score numérique ou null si non renseigné
  isVictory: boolean; // V pour victoire
  isAbstention: boolean; // A pour abstention/abandon
  isExclusion: boolean; // X pour exclusion (carton noir)
  isForfait: boolean; // F pour forfait
}

// ============================================================================
// Match
// ============================================================================

export interface Match extends BaseEntity {
  number: number; // Numéro du match
  fencerA: Fencer | null; // Premier tireur
  fencerB: Fencer | null; // Deuxième tireur
  scoreA: Score | null; // Score du tireur A
  scoreB: Score | null; // Score du tireur B
  maxScore: number; // Score maximum (5 en poule, 10/15 en tableau)
  status: MatchStatus;
  referee?: Referee; // Arbitre assigné
  strip?: number; // Piste
  startTime?: Date; // Heure de début prévue
  endTime?: Date; // Heure de fin
  duration?: number; // Durée en secondes
  poolId?: string; // ID de la poule (si match de poule)
  tableId?: string; // ID du tableau (si match de tableau)
  round?: number; // Tour du tableau (64, 32, 16, 8, 4, 2, 1)
  position?: number; // Position dans le tour

  // Sabre Laser specific
  mode?: MatchMode;
  cards?: Card[];
  penalties?: { type: PenaltyType; pointsAwarded: number; timestamp: Date }[];
  suddenDeathStartTime?: Date;
  touches?: Touch[];
}

// ============================================================================
// Pool (Poule)
// ============================================================================

export interface Pool extends BaseEntity {
  number: number; // Numéro de la poule
  phaseId: string; // ID de la phase de poules
  fencers: Fencer[]; // Tireurs dans la poule
  matches: Match[]; // Matchs de la poule
  referees: Referee[]; // Arbitres assignés
  strip?: number; // Piste assignée
  startTime?: Date; // Heure de début
  isComplete: boolean; // Tous les matchs terminés
  hasError: boolean; // Erreur détectée dans les scores
  ranking: PoolRanking[]; // Classement calculé
}

export interface PoolRanking {
  fencer: Fencer;
  rank: number;
  victories: number;
  defeats: number;
  matchesPlayed: number;
  touchesScored: number;
  touchesReceived: number;
  index: number;
  ratio: number;
  // Points Quest (Sabre Laser uniquement)
  questPoints?: number; // Total des points Quest
  questVictories4?: number; // Nombre de victoires à 4 points (écart ≥12)
  questVictories3?: number; // Nombre de victoires à 3 points (écart 8-11)
  questVictories2?: number; // Nombre de victoires à 2 points (écart 4-7)
  questVictories1?: number; // Nombre de victoires à 1 point (écart ≤3)
  totalCards?: number;      // Nombre total de cartons reçus (critère de départage Quest)
  maxSingleMatchScore?: number; // Meilleur score marqué en un seul match
}

// ============================================================================
// Statistiques par combattant
// ============================================================================

export interface FencerCompetitionStats {
  fencerId: string;
  fencerLastName: string;
  fencerFirstName: string;
  fencerClub?: string;
  competitionId: string;
  // Touches Laser Sabre (zones A=1pt, B=3pts, C=5pts)
  touchesZoneA: number;
  touchesZoneB: number;
  touchesZoneC: number;
  totalTouchPoints: number;
  // Cartons
  whiteCards: number;
  yellowCards: number;
  redCards: number;
  cardsByReason: Partial<Record<CardReason, number>>;
  // Sorties d'arène
  arenaExits: number;
  // Durée des matchs
  matchesPlayed: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  matchesFinishedEarly: number; // durée < 180s (avant le temps réglementaire)
}

// ============================================================================
// Pool Phase (Tour de poules)
// ============================================================================

export interface PoolPhase extends BaseEntity {
  competitionId: string;
  phaseNumber: number; // Numéro du tour de poules (1, 2, etc.)
  maxScore: number; // Score max par match (généralement 5)
  pools: Pool[]; // Liste des poules
  config: PoolPhaseConfig; // Configuration
  qualifiedCount?: number; // Nombre de qualifiés pour la phase suivante
  isComplete: boolean;
  ranking: PoolRanking[]; // Classement général après ce tour
}

export interface PoolPhaseConfig {
  minPoolSize: number; // Taille minimum des poules (défaut: 5)
  maxPoolSize: number; // Taille maximum des poules (défaut: 8)
  balanced: boolean; // Équilibrer les poules
  seeding: 'serpentine' | 'sequential' | 'random'; // Méthode de répartition
  separation: {
    byClub: boolean; // Séparer par club
    byRegion: boolean; // Séparer par région
    byNation: boolean; // Séparer par nation
  };
}

// ============================================================================
// Custom Formula Types (Arme CUSTOM — Formule à la carte)
// ============================================================================

export type RankingCriterionId =
  | 'vm_ratio'
  | 'index'
  | 'touches_scored'
  | 'touches_received'
  | 'direct_bout'
  | 'initial_ranking'
  | 'custom_points';

export interface RankingCriterion {
  id: RankingCriterionId;
  direction: 'asc' | 'desc';
  enabled: boolean;
}

export type AdvancementMode = 'all' | 'percentage' | 'fixed_count' | 'fixed_bracket' | 'pool_winner';

// Critère de séparation post-poules en deux tableaux distincts (compétition couplée)
export type PostPoolSplitCriteria = 'gender';

export interface AdvancementRule {
  mode: AdvancementMode;
  percentage?: number; // 0-100, utilisé si mode === 'percentage'
  count?: number; // utilisé si mode === 'fixed_count' ou 'fixed_bracket'
}

export interface CustomTouchZone {
  id: string;
  label: string; // ex: "Tête", "Corps", "Bras"
  points: number; // ex: 3, 2, 1
  color?: string; // couleur pour l'UI
}

export interface CustomScoringConfig {
  type: 'standard' | 'zones';
  maxScore: number;
  zones?: CustomTouchZone[]; // si type === 'zones'
}

export interface CustomPoolRoundConfig extends PoolPhaseConfig {
  roundIndex: number;
  maxScore: number;
  timerSeconds: number;
  scoring: CustomScoringConfig;
  rankingCriteria: RankingCriterion[];
  advancementRule: AdvancementRule;
}

export interface CustomDEConfig extends DirectEliminationConfig {
  timerSeconds: number;
  bracketSizeOverride?: number; // forcer 32/64/etc au lieu d'auto
  fifthPlaceMatch?: boolean;
  scoring: CustomScoringConfig;
}

export type FormulaPhaseNodeType = 'pool_round' | 'direct_elimination' | 'classification';

export interface FormulaPhaseNode {
  id: string;
  type: FormulaPhaseNodeType;
  label?: string;
  config: CustomPoolRoundConfig | CustomDEConfig;
}

export interface CustomFormulaConfig {
  version: 1;
  phases: FormulaPhaseNode[];
  formulaName?: string;
  notes?: string;
}

export interface FormulaPhaseSimulation {
  phaseIndex: number;
  type: FormulaPhaseNodeType;
  inputFencers: number;
  poolCount?: number;
  poolSizes?: number[];
  matchCount?: number;
  advancingFencers?: number;
  bracketSize?: number;
}

export interface FormulaSimulation {
  phases: FormulaPhaseSimulation[];
  totalMatches: number;
  estimatedDurationMinutes: number;
  warnings: string[];
}

// ============================================================================
// Direct Elimination Table (Tableau)
// ============================================================================

export interface TableNode extends BaseEntity {
  position: number; // Position dans le tableau (0 = finale)
  round: number; // Tour (1=finale, 2=demi, 4=quart, etc.)
  match?: Match; // Match à ce noeud
  winner?: Fencer; // Gagnant qui avance
  fencerA?: Fencer; // Tireur haut
  fencerB?: Fencer; // Tireur bas
  parentA?: string; // ID du noeud parent haut
  parentB?: string; // ID du noeud parent bas
  isBye: boolean; // Exempt (avance directement)
}

export interface DirectEliminationTable extends BaseEntity {
  competitionId: string;
  name: string; // "Tableau principal", "3ème place", etc.
  size: number; // Taille du tableau (64, 32, 16, etc.)
  maxScore: number; // Score max (10 ou 15)
  nodes: TableNode[]; // Structure arborescente
  isComplete: boolean;
  ranking: TableRanking[]; // Classement final
  firstPlace: number; // Première place couverte (1, 5, 9, etc.)
}

export interface TableRanking {
  fencer: Fencer;
  rank: number;
  eliminatedAt: number; // Tour d'élimination
}

// ============================================================================
// Competition (Compétition)
// ============================================================================

export interface Competition extends BaseEntity {
  // Informations générales
  title: string; // Titre long
  shortTitle?: string; // Titre court
  date: Date; // Date de la compétition
  location?: string; // Lieu
  organizer?: string; // Organisateur
  organizerUrl?: string; // Site web de l'organisateur

  // Configuration
  weapon: Weapon; // Arme
  gender: Gender; // Sexe
  category: Category; // Catégorie d'âge
  championship?: string; // Type de championnat (FFE, FIE, etc.)
  color: string; // Couleur associée (hex)

  // Horaires
  checkInTime?: Date; // Heure d'appel
  scratchTime?: Date; // Heure de scratch
  startTime?: Date; // Heure de début

  // Participants
  fencers: Fencer[]; // Liste des tireurs
  referees: Referee[]; // Liste des arbitres

  // Phases
  phases: Phase[]; // Phases de la compétition
  currentPhaseIndex: number; // Phase en cours

  // Paramètres
  settings: CompetitionSettings;

  // État
  isTeamEvent: boolean; // Compétition par équipes
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
}

// ============================================================================
// Quest Phase Configuration (Sabre Laser)
// ============================================================================

export interface QuestPhaseConfig {
  enabled: boolean;
  hasPreliminaryPools: boolean;
  qualifiersCount?: number;
  fightsPerFencer?: number;
  availableTimeMinutes?: number;
  numberOfArenas?: number;
  opponentConstraint: 'none' | 'club' | 'region' | 'nation';
}

export interface TrainingCustomRules {
  matchDurationSeconds: number;
  allowedZones: TargetZone[];    // vide = toutes les zones autorisées
  disableSuddenDeath: boolean;
}

export interface CompetitionSettings {
  defaultPoolMaxScore: number; // Score max en poules (défaut: 5)
  defaultTableMaxScore: number; // Score max en tableau (défaut: 10 ou 15)
  defaultPoolTimerSeconds: number; // Durée chrono poules en secondes (défaut: 180)
  defaultTableTimerSeconds: number; // Durée chrono tableau en secondes (défaut: 180)
  poolRounds: number; // Nombre de tours de poules (défaut: 1)
  hasDirectElimination: boolean; // Phase d'élimination directe activée (défaut: true)
  thirdPlaceMatch: boolean; // Match pour la 3ème place activé (défaut: false)
  signTableauMatches?: boolean; // Signature des combattants sur tablette après chaque match du tableau (défaut: true)
  manualRanking: boolean; // Classement manuel
  defaultRanking: number; // Classement par défaut pour non-classés
  randomScore: boolean; // Scores aléatoires (pour tests)
  minTeamSize: number; // Taille équipe = nombre de titulaires (compétitions par équipes)
  teamReserveCount?: number; // Nombre de réservistes par équipe (défaut: 1)
  laserTeamMode?: 'touches' | 'points'; // Cible équipe Sabre Laser : touches (défaut) ou points de zone cumulés
  teamRelayStepSize?: number; // Palier de progression par relais (défaut: 5, cf. règle FIE)
  // 'fie-relay' (défaut) = relais classique à cible cumulée progressive. 'laser-arena' = format
  // arène Sabre Laser (assauts indépendants plafonnés à 5 touches/3min, score = total de points).
  teamFormat?: 'fie-relay' | 'laser-arena';
  questConfig?: QuestPhaseConfig; // Configuration du Tour Quest (Sabre Laser uniquement)
  refereeFeatureEnabled?: boolean; // Activer la gestion des arbitres sur arènes et saisie distante
  customFormula?: CustomFormulaConfig; // Formule à la carte (arme CUSTOM uniquement)
  playAllPositions?: boolean; // Jouer toutes les places (tableaux de classement)
  expertMode?: boolean; // Mode expert : édition avancée des pistes et arbitres
  maxRefereesPerPool?: number; // Nombre max d'arbitres par poule (mode expert)
  maxRefereesPerMatch?: number; // Nombre max d'arbitres par match DE (mode expert)
  // Modes spéciaux post-poules
  poolWinnersOnly?: boolean; // Seuls les 1ers de chaque poule accèdent au tableau
  postPoolSplitCriteria?: PostPoolSplitCriteria; // Séparation en deux tableaux après les poules
}

export interface Phase extends BaseEntity {
  competitionId: string;
  type: PhaseType;
  order: number; // Ordre dans la compétition
  name: string;
  isComplete: boolean;
  nextPhaseId?: string; // ID de la phase suivante
  config: PoolPhaseConfig | DirectEliminationConfig | CheckInConfig;
}

export interface DirectEliminationConfig {
  maxScore: number;
  placesToFence: number[]; // Places à tirer (ex: [1, 3, 5, 7] pour 8)
  thirdPlaceMatch: boolean; // Match pour la 3ème place
}

export interface CheckInConfig {
  allowLateRegistration: boolean;
  autoQualify: boolean;
}

// ============================================================================
// Piste/Strip Configuration
// ============================================================================

export interface Strip {
  id: string;
  number: number;
  name?: string;
  isAvailable: boolean;
  currentMatch?: Match;
}

// ============================================================================
// Import/Export Types
// ============================================================================

export interface ImportResult {
  success: boolean;
  fencersImported: number;
  refereesImported: number;
  errors: string[];
  warnings: string[];
}

export interface ExportFormat {
  type: 'xml' | 'csv' | 'json' | 'pdf' | 'html';
  includeResults: boolean;
  includeStats: boolean;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface AppState {
  currentCompetition: Competition | null;
  competitions: Competition[];
  selectedPhase: Phase | null;
  selectedPool: Pool | null;
  selectedTable: DirectEliminationTable | null;
  isLoading: boolean;
  error: string | null;
}

export interface UISettings {
  language: 'fr' | 'en' | 'de' | 'es' | 'br' | 'ca' | 'zh-HK';
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  showTips: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // En secondes
}

// ============================================================================
// Match Timeline (Audit Log) Types
// ============================================================================

export type MatchEventType = 'score_change' | 'touch' | 'card' | 'arena_exit';

export interface MatchEventEntry {
  id: string;
  matchId: string;
  eventType: MatchEventType;
  timestamp: string; // ISO 8601
  fencerId: string | null;
  fencerLastName: string | null;
  fencerFirstName: string | null;
  fencerSide: 'A' | 'B' | null;
  // score_change
  previousScoreA: { value: number | null } | null;
  previousScoreB: { value: number | null } | null;
  newScoreA: { value: number | null } | null;
  newScoreB: { value: number | null } | null;
  changedBy: string | null;
  refereeName: string | null;
  ipAddress: string | null;
  changeReason: string | null;
  // touch
  zone: string | null;
  points: number | null;
  // card
  cardType: string | null;
  cardReason: string | null;
  cardGroup: number | null;
  resultingExclusion: boolean | null;
  // arena_exit
  exitType: string | null;
}
