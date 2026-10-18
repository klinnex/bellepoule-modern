/**
 * BellePoule Modern - Contexte passé aux modules de routes du serveur distant (#1065).
 * Les modules n'accèdent qu'à cet état, exposé par RemoteScoreServer.routeContext()
 * sous forme d'accesseurs (valeurs toujours à jour, même après réassignation).
 * Licensed under GPL-3.0
 */
import type express from 'express';
import type { DatabaseManager } from '../../../database';
import type { Arena, RemoteSession } from '../../../shared/types/remote';
import type { ScheduleMatchInput } from '../fencerSchedule';

/** Match de session tel que transmis par le renderer (forme libre, champs usuels typés). */
export type SessionMatch = ScheduleMatchInput & Record<string, unknown>;

export interface TrainingRecord {
  id: string;
  arenaId: string;
  arenaNumber: number;
  weapon: string;
  scoreA: number;
  scoreB: number;
  durationSec: number;
  finishedAt: string;
}

export interface PhaseEtaSummary {
  finishAt: string;
  basis: string;
  remainingMatches: number;
  perMatchMinutes: number;
  /** Phase estimée : poules, ou tour de tableau en cours (taille, ex. 16). */
  phase: 'pools' | 'tableau';
  round: number | null;
}

export interface RouteContext {
  readonly app: express.Application;
  readonly db: DatabaseManager;
  readonly session: RemoteSession | null;
  readonly isTrainingMode: boolean;
  readonly arenas: Map<string, Arena>;
  readonly sessionMatches: SessionMatch[];
  /** Piste prévue par poule (poolId → n°), pour le suivi tireur avant le début des matchs. */
  readonly sessionPoolArenas: ReadonlyMap<string, number>;
  readonly sessionMatchScores: Map<
    string,
    { scoreA: ScheduleMatchInput['scoreA']; scoreB: ScheduleMatchInput['scoreB']; status: string }
  >;
  readonly trainingHistory: TrainingRecord[];
  sendHtmlFromMemory(filename: string, res: express.Response): void;
  checkArenaAuth(arenaId: string, cookieHeader: string | undefined): boolean;
  hasAnyValidToken(cookieHeader: string | undefined): boolean;
  computePhaseEta(): PhaseEtaSummary;
}
