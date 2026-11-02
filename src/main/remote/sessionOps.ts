/**
 * BellePoule Modern - Création de session et mise à jour de score depuis la base (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { MatchStatus, type Score } from '../../shared/types';
import type { ArenaMatch, RemoteScoreUpdate, RemoteSession } from '../../shared/types/remote';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module. */
export interface SessionOpsContext {
  readonly arenas: S['arenas'];
  readonly db: S['db'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  readonly sessionMatches: S['sessionMatches'];
  readonly assignMatchToArena: S['assignMatchToArena'];
  readonly loadSessionReferees: S['loadSessionReferees'];
  readonly setArenaCount: S['setArenaCount'];
  readonly updateArenaScore: S['updateArenaScore'];
}

export async function createSession(
  ctx: SessionOpsContext,
  competitionId: string,
  strips: number
): Promise<RemoteSession> {
  console.log(
    `[RemoteScoreServer] Création d'une session pour la compétition ${competitionId} avec ${strips} pistes...`
  );

  const competition = ctx.db.getCompetition(competitionId);
  if (!competition) {
    console.error(`[RemoteScoreServer] ERREUR: Compétition ${competitionId} non trouvée`);
    throw new Error('Compétition non trouvée');
  }
  console.log(`[RemoteScoreServer] Compétition trouvée: ${competition.title}`);

  // Le nombre de pistes est déjà défini côté client en fonction du nombre de poules
  // On l'utilise directement pour configurer les arènes
  console.log(`[RemoteScoreServer] Configuration du nombre d'arènes: ${strips}`);
  ctx.setArenaCount(strips);

  // Récupérer les matchs en attente et les assigner aux arènes
  const pendingMatches = ctx.db.getPendingMatches(competitionId);
  console.log(`[RemoteScoreServer] ${pendingMatches.length} matchs en attente trouvés`);

  // Assigner les matchs en attente aux arènes
  pendingMatches.slice(0, strips).forEach((match, index) => {
    const arenaId = `arena${index + 1}`;
    const arenaMatch: ArenaMatch = {
      id: match.id,
      poolId: match.poolId || '',
      fencerA: match.fencerA!,
      fencerB: match.fencerB!,
      scoreA: match.scoreA?.value ?? 0,
      scoreB: match.scoreB?.value ?? 0,
      status: match.status === 'in_progress' ? 'in_progress' : 'pending',
      startTime: match.status === 'in_progress' ? new Date() : null,
      endTime: null,
    };
    ctx.assignMatchToArena(arenaId, arenaMatch);
    console.log(`[RemoteScoreServer] Match ${match.id} assigné à l'arène ${arenaId}`);
  });

  const session: RemoteSession = {
    competitionId,
    strips: Array.from({ length: strips }, (_, i) => ({
      number: i + 1,
      status: pendingMatches[i] ? 'occupied' : 'available',
    })),
    referees: ctx.loadSessionReferees(competitionId),
    activeMatches: [],
    isRunning: true,
    startTime: new Date(),
  };

  console.log(`[RemoteScoreServer] Session créée avec succès ✓`);
  console.log(`[RemoteScoreServer] Détails: ${strips} pistes, ${session.referees.length} arbitres`);
  return session;
}

export async function updateMatchScore(
  ctx: SessionOpsContext,
  matchId: string,
  update: RemoteScoreUpdate
): Promise<void> {
  const scoreA: Score = {
    value: update.scoreA,
    isVictory: update.winner === 'A',
    isAbstention: update.specialStatus === 'abandon' && update.winner !== 'A',
    isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'A',
    isForfait: update.specialStatus === 'forfait' && update.winner !== 'A',
  };

  const scoreB: Score = {
    value: update.scoreB,
    isVictory: update.winner === 'B',
    isAbstention: update.specialStatus === 'abandon' && update.winner !== 'B',
    isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'B',
    isForfait: update.specialStatus === 'forfait' && update.winner !== 'B',
  };

  const dbMatch = ctx.db.getMatch(matchId);
  if (dbMatch) {
    // Match en base de données : mise à jour directe
    ctx.db.updateMatch(matchId, {
      scoreA,
      scoreB,
      status: update.status === 'finished' ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS,
    });
  } else {
    // Match en mémoire uniquement (poule non persistée) : mettre à jour via Socket.IO
    const inMemory = ctx.sessionMatches.find(m => m.id === matchId);
    if (!inMemory) {
      throw new Error('Match non trouvé');
    }
    // Synchroniser les scores dans l'arène en mémoire
    for (const [arenaId, arena] of ctx.arenas) {
      if (arena.currentMatch?.id === matchId) {
        ctx.updateArenaScore(arenaId, update.scoreA, update.scoreB);
        break;
      }
    }
    // Stocker dans sessionMatchScores pour cohérence
    ctx.sessionMatchScores.set(matchId, {
      scoreA,
      scoreB,
      status: update.status === 'finished' ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS,
    });
  }
}
