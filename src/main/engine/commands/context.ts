/**
 * BellePoule Modern - Couche domaine (#1880) : logique métier du process main partagée
 * par le serveur MCP, le mode --headless et, à terme, les handlers IPC de l'écran.
 * Licensed under GPL-3.0
 */
import type { DatabaseManager } from '../../../database';
import type { EventAuthor } from '../../../database/repos/eventLogRepo';

/** Écriture faite hors de l'écran : l'écran ouvert recharge les données concernées */
export interface DomainChange {
  /** Nature : épreuves (liste, réglages), tireurs, arbitres, réglages du poste, état de session */
  scope: 'competitions' | 'fencers' | 'referees' | 'settings' | 'session';
  /** Épreuves touchées (vide = liste entière) */
  competitionIds: string[];
}

export interface CommandContext {
  db: DatabaseManager;
  /** Notifie l'écran d'une écriture hors écran (bus competition:event) */
  emitChange?: (change: DomainChange) => void;
  /**
   * Dossiers où l'agent (MCP) peut écrire des fichiers ; absent = aucune restriction
   * (tests, opérateur en ligne de commande).
   */
  allowedRoots?: () => string[];
  /** Auteur et source des écritures, inscrits au journal de l'épreuve (#1980) ; défaut : moteur */
  actor?: EventAuthor;
  /** Commande en cours (runCommand) : commune à ses événements du journal (ADR-0007) */
  commandId?: string;
  /**
   * Détails du journal des scores (score_audit_log) connus de l'appelant : arbitre, adresse
   * de la tablette (détection de conflit), motif (#1980)
   */
  scoreAudit?: { refereeId?: string; refereeName?: string; ipAddress?: string; reason?: string };
}

/** Erreur métier : message destiné à l'opérateur (ou à l'agent), code stable */
export class CommandError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CommandError';
  }
}
