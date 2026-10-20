/**
 * BellePoule Modern - Routes du serveur distant (extraites de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

import { MatchStatus } from '../../../shared/types';
import { sendHtmlPage } from '../csp';
import { renderArenaJournalPage, renderCompetitionResultsPage } from '../htmlPages';
import type { RouteContext } from './context';

/** Résultats, tableau, historique d'entraînement et journal des matchs. */
export function registerResultsRoutes(ctx: RouteContext): void {
  // API : données de résultats d'une compétition (classements de poules)
  ctx.app.get('/api/competitions/:competitionId/results-data', (req, res) => {
    try {
      const { competitionId } = req.params;
      const competition = ctx.db.getCompetition(competitionId);
      if (!competition) {
        return res.status(404).json({ error: 'competition_not_found' });
      }

      // Priorité : lire les poules depuis le session_state (elles ne sont pas dans les tables SQL)
      const sessionState = ctx.db.getSessionState(competitionId);
      const sessionPools: any[] = sessionState?.pools || [];
      if (sessionPools.length > 0) {
        const poolResults = sessionPools.map((pool: any) => {
          const rankings = (pool.ranking || []).map((r: any) => ({
            id: r.fencer?.id ?? '',
            lastName: r.fencer?.lastName ?? '',
            firstName: r.fencer?.firstName ?? '',
            club: r.fencer?.club ?? '',
            matchesPlayed: r.matchesPlayed ?? 0,
            victories: r.victories ?? 0,
            touchesFor: r.touchesScored ?? 0,
            touchesAgainst: r.touchesReceived ?? 0,
            index: r.index ?? 0,
          }));
          return {
            id: pool.id,
            number: pool.number,
            name: 'Poule ' + pool.number,
            rankings,
          };
        });
        const overallRanking = (sessionState?.overallRanking || []).map((r: any) => ({
          id: r.fencer?.id ?? '',
          lastName: r.fencer?.lastName ?? '',
          firstName: r.fencer?.firstName ?? '',
          club: r.fencer?.club ?? '',
          victories: r.victories ?? 0,
          index: r.index ?? 0,
          touchesFor: r.touchesScored ?? 0,
          touchesAgainst: r.touchesReceived ?? 0,
        }));
        return res.json({
          competition: {
            id: competition.id,
            title: competition.title,
            date: competition.date,
            weapon: competition.weapon,
          },
          pools: poolResults,
          overallRanking,
        });
      }

      // Fallback : tables SQL (cas import/legacy)
      const pools = ctx.db.getCompetitionPools(competitionId);
      const poolResults = pools.map(pool => {
        const fencers = ctx.db.getPoolFencers(pool.id);
        const matches = ctx.db.getMatchesByPool(pool.id);

        // Calcul des statistiques par tireur
        const stats: Record<
          string,
          { matchesPlayed: number; victories: number; touchesFor: number; touchesAgainst: number }
        > = {};
        for (const f of fencers) {
          stats[f.id] = { matchesPlayed: 0, victories: 0, touchesFor: 0, touchesAgainst: 0 };
        }

        for (const match of matches) {
          if (match.status !== MatchStatus.FINISHED) continue;
          const sA = match.scoreA;
          const sB = match.scoreB;
          if (!sA || !sB || !match.fencerA || !match.fencerB) continue;
          const idA = match.fencerA.id;
          const idB = match.fencerB.id;
          if (stats[idA]) {
            stats[idA].matchesPlayed += 1;
            stats[idA].touchesFor += sA.value ?? 0;
            stats[idA].touchesAgainst += sB.value ?? 0;
            if (sA.isVictory) stats[idA].victories += 1;
          }
          if (stats[idB]) {
            stats[idB].matchesPlayed += 1;
            stats[idB].touchesFor += sB.value ?? 0;
            stats[idB].touchesAgainst += sA.value ?? 0;
            if (sB.isVictory) stats[idB].victories += 1;
          }
        }

        const rankings = fencers
          .map(f => ({
            id: f.id,
            lastName: f.lastName,
            firstName: f.firstName,
            club: f.club ?? '',
            matchesPlayed: stats[f.id]?.matchesPlayed ?? 0,
            victories: stats[f.id]?.victories ?? 0,
            touchesFor: stats[f.id]?.touchesFor ?? 0,
            touchesAgainst: stats[f.id]?.touchesAgainst ?? 0,
            index: (stats[f.id]?.touchesFor ?? 0) - (stats[f.id]?.touchesAgainst ?? 0),
          }))
          .sort(
            (a, b) => b.victories - a.victories || b.index - a.index || b.touchesFor - a.touchesFor
          );

        return { id: pool.id, name: pool.name, rankings };
      });

      res.json({
        competition: {
          id: competition.id,
          title: competition.title,
          date: competition.date,
          weapon: competition.weapon,
        },
        pools: poolResults,
      });
    } catch (error) {
      console.error('[RemoteScoreServer] Erreur résultats:', error);
      res.status(500).json({ error: 'results_fetch_failed' });
    }
  });

  // API : historique combats entraînement
  ctx.app.get('/api/training/history', (req, res) => {
    if (!ctx.isTrainingMode) return res.status(404).json({ error: 'not_training' });
    res.json({ history: ctx.trainingHistory });
  });

  // API : matchs à venir dans l'ordre de passage (kiosk vue suivants)
  ctx.app.get('/api/session/upcoming-matches', (req, res) => {
    if (!ctx.session) {
      return res.status(404).json({ error: 'no_session' });
    }
    try {
      // Construire un index des matchs actuellement sur une piste
      const arenaByMatchId = new Map<string, string>();
      for (const [, arena] of ctx.arenas) {
        if (arena.currentMatch?.id) {
          arenaByMatchId.set(arena.currentMatch.id, arena.name);
        }
      }

      const upcoming: any[] = [];

      // Priorité : session_state (pools du renderer avec leurs matchs)
      const sessionState = ctx.db.getSessionState(ctx.session.competitionId);
      const sessionPools: any[] = sessionState?.pools || [];

      if (sessionPools.length > 0) {
        for (const pool of sessionPools) {
          const poolName = 'Poule ' + pool.number;
          const matches: any[] = (pool.matches || [])
            .filter((m: any) => m.status !== MatchStatus.FINISHED && m.status !== 'finished')
            .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
          for (const m of matches) {
            upcoming.push({
              id: m.id,
              number: m.number,
              poolName,
              poolNumber: pool.number,
              fencerA: m.fencerA
                ? {
                    lastName: m.fencerA.lastName,
                    firstName: m.fencerA.firstName,
                    club: m.fencerA.club ?? '',
                  }
                : null,
              fencerB: m.fencerB
                ? {
                    lastName: m.fencerB.lastName,
                    firstName: m.fencerB.firstName,
                    club: m.fencerB.club ?? '',
                  }
                : null,
              status: m.status,
              arenaName: arenaByMatchId.get(m.id) ?? null,
            });
          }
        }
      }

      // Matchs du tableau d'élimination directe (toutes phases confondues)
      const tableauMatches: any[] = sessionState?.tableauMatches || [];
      if (tableauMatches.length > 0) {
        const roundLabels: Record<number, string> = {
          2: 'Finale',
          3: 'Petite finale',
          4: 'Demi-finales',
          8: 'Quarts de finale',
          16: 'Tableau de 16',
          32: 'Tableau de 32',
          64: 'Tableau de 64',
          128: 'Tableau de 128',
        };
        const pendingTableau = tableauMatches
          .filter((m: any) => m.fencerA && m.fencerB && !m.isBye && !m.winner)
          .sort((a: any, b: any) => b.round - a.round || a.position - b.position);
        for (const m of pendingTableau) {
          const inArena = arenaByMatchId.has(m.id);
          upcoming.push({
            id: m.id,
            number: (m.position ?? 0) + 1,
            poolName: roundLabels[m.round] || `Tour de ${m.round}`,
            poolNumber: null,
            fencerA: {
              lastName: m.fencerA.lastName,
              firstName: m.fencerA.firstName,
              club: m.fencerA.club ?? '',
            },
            fencerB: {
              lastName: m.fencerB.lastName,
              firstName: m.fencerB.firstName,
              club: m.fencerB.club ?? '',
            },
            status: inArena ? 'in_progress' : 'not_started',
            arenaName: arenaByMatchId.get(m.id) ?? null,
            isTableau: true,
          });
        }
      }

      if (upcoming.length === 0 && ctx.sessionMatches.length > 0) {
        // Fallback : matchs en mémoire passés depuis le renderer
        const pending = (ctx.sessionMatches as any[])
          .filter(
            (m: any) =>
              m.status !== MatchStatus.FINISHED && m.status !== 'finished' && m.fencerA && m.fencerB
          )
          .sort((a: any, b: any) => {
            const pA =
              a.poolNumber ?? parseInt(String(a.poolId || '').replace(/\D/g, '') || '0', 10);
            const pB =
              b.poolNumber ?? parseInt(String(b.poolId || '').replace(/\D/g, '') || '0', 10);
            return pA !== pB ? pA - pB : (a.number || 0) - (b.number || 0);
          });
        for (const m of pending) {
          const poolNum =
            m.poolNumber ?? parseInt(String(m.poolId || '').replace(/\D/g, '') || '0', 10);
          upcoming.push({
            id: m.id,
            number: m.number,
            poolName: 'Poule ' + (poolNum || '?'),
            poolNumber: poolNum,
            fencerA: m.fencerA
              ? {
                  lastName: m.fencerA.lastName,
                  firstName: m.fencerA.firstName,
                  club: m.fencerA.club ?? '',
                }
              : null,
            fencerB: m.fencerB
              ? {
                  lastName: m.fencerB.lastName,
                  firstName: m.fencerB.firstName,
                  club: m.fencerB.club ?? '',
                }
              : null,
            status: m.status,
            arenaName: arenaByMatchId.get(m.id) ?? null,
          });
        }
      }

      res.json({ upcoming });
    } catch (error) {
      console.error('[RemoteScoreServer] Erreur upcoming-matches:', error);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Données du tableau d'élimination directe pour le kiosk
  ctx.app.get('/api/bracket', (req, res) => {
    try {
      if (!ctx.session) return res.status(404).json({ error: 'no_session' });

      // Lire depuis la DB (inclut les matchs terminés) ; fallback sur sessionMatches (pending only)
      const sessionState = ctx.db.getSessionState(ctx.session.competitionId);
      const dbTableauMatches: any[] = sessionState?.tableauMatches || [];
      const deMatches =
        dbTableauMatches.length > 0
          ? dbTableauMatches
          : (ctx.sessionMatches as any[]).filter((m: any) => m.isTableau);

      if (deMatches.length === 0) {
        return res.json({ tableSize: 0, currentRound: null, rounds: [] });
      }

      const roundLabels: Record<number, string> = {
        2: 'Finale',
        3: 'Petite finale',
        4: 'Demi-finales',
        8: 'Quarts de finale',
        16: '1/8 de finale',
        32: '1/16 de finale',
        64: '1/32 de finale',
        128: '1/64 de finale',
      };

      // Arène par matchId pour l'affichage
      const arenaByMatchId = new Map<string, string>();
      for (const [arenaId, arena] of ctx.arenas.entries()) {
        if (arena.currentMatch) {
          const num = parseInt(arenaId.replace('arena', ''), 10);
          arenaByMatchId.set(arena.currentMatch.id, `Piste ${num}`);
        }
      }

      // Déterminer la taille du tableau (plus grande puissance de 2 couvrant tous les rounds)
      // maxRound (sans petite finale round=3) = taille du tableau (puissance de 2)
      const mainRounds = deMatches.filter((m: any) => m.round !== 3);
      const maxRound =
        mainRounds.length > 0 ? Math.max(...mainRounds.map((m: any) => m.round || 1)) : 4;
      const tableSize = maxRound;

      // Grouper par round, enrichir avec scores live
      const roundMap = new Map<number, any[]>();
      for (const m of deMatches) {
        const round = m.round || 1;
        if (!roundMap.has(round)) roundMap.set(round, []);
        const live = ctx.sessionMatchScores.get(m.id);
        const isFinished =
          (live?.status ?? m.status) === 'finished' ||
          (live?.status ?? m.status) === MatchStatus.FINISHED ||
          !!m.winner;
        const isLive =
          !isFinished &&
          ((live?.status ?? m.status) === 'in_progress' ||
            (live?.status ?? m.status) === MatchStatus.IN_PROGRESS ||
            arenaByMatchId.has(m.id));
        roundMap.get(round)!.push({
          id: m.id,
          position: m.position + 1,
          fencerA: m.fencerA
            ? {
                lastName: m.fencerA.lastName,
                firstName: m.fencerA.firstName,
                club: m.fencerA.club ?? '',
                id: m.fencerA.id,
              }
            : null,
          fencerB: m.fencerB
            ? {
                lastName: m.fencerB.lastName,
                firstName: m.fencerB.firstName,
                club: m.fencerB.club ?? '',
                id: m.fencerB.id,
              }
            : null,
          scoreA: (() => {
            const s = live?.scoreA ?? m.scoreA;
            if (s == null) return null;
            return typeof s === 'number' ? s : ((s as any)?.value ?? null);
          })(),
          scoreB: (() => {
            const s = live?.scoreB ?? m.scoreB;
            if (s == null) return null;
            return typeof s === 'number' ? s : ((s as any)?.value ?? null);
          })(),
          winnerId: m.winner?.id ?? null,
          status: isFinished ? 'finished' : isLive ? 'live' : 'pending',
          isBye: !!m.isBye,
          arenaName: arenaByMatchId.get(m.id) ?? null,
        });
      }

      // Trier les rounds du plus grand (tour initial) au plus petit (finale)
      const rounds = Array.from(roundMap.entries())
        .sort(([a], [b]) => b - a)
        .map(([round, matches]) => ({
          round,
          label: roundLabels[round] ?? `Tour de ${round}`,
          matches: matches.sort((a: any, b: any) => a.position - b.position),
        }));

      // Round actif = premier round non entièrement terminé (du plus grand au plus petit)
      const currentRound =
        rounds.find(r => r.matches.some((m: any) => m.status !== 'finished' && !m.isBye))?.round ??
        null;

      // Classement final calculé par l'application (places distinctes, départage
      // par classement de poules / places jouées) : source de vérité du kiosk (#1013)
      const finalResults = (
        Array.isArray(sessionState?.finalResults) ? sessionState.finalResults : []
      )
        .filter((r: any) => r?.fencer && typeof r.rank === 'number')
        .map((r: any) => ({
          rank: r.rank,
          fencer: {
            id: r.fencer.id,
            lastName: r.fencer.lastName,
            firstName: r.fencer.firstName,
            club: r.fencer.club ?? '',
          },
        }));

      res.json({ tableSize, currentRound, rounds, finalResults });
    } catch (error) {
      console.error('[RemoteScoreServer] Erreur /api/bracket:', error);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Page HTML : résultats d'une compétition (pour les spectateurs)
  ctx.app.get('/competition/:competitionId/results', (req, res) => {
    const { competitionId } = req.params;
    // Identifiant réinjecté dans la page : format strict (anti-XSS réfléchie, #997)
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(competitionId)) {
      return res.status(400).send('Identifiant invalide');
    }
    const html = renderCompetitionResultsPage(competitionId);
    sendHtmlPage(res, html);
  });

  // Journal du match en cours (tablette arbitre - lecture seule)
  ctx.app.get('/api/arena/:arenaId/current-match/events', (req, res) => {
    const arena = ctx.arenas.get(req.params.arenaId);
    if (!arena?.currentMatch?.id) {
      return res.json({ success: true, events: [], matchId: null });
    }
    try {
      const events = ctx.db.getMatchTimeline(arena.currentMatch.id);
      res.json({ success: true, events, matchId: arena.currentMatch.id });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Page HTML journal (match en cours uniquement)
  ctx.app.get('/arene:arenaId/journal', (req, res) => {
    const arenaNum = req.params.arenaId;
    // Numéro réinjecté dans le HTML et le JS : chiffres uniquement (anti-XSS réfléchie, #997)
    if (!/^\d{1,3}$/.test(arenaNum)) {
      return res.status(400).send('Numéro de piste invalide');
    }
    const html = renderArenaJournalPage(arenaNum);
    sendHtmlPage(res, html);
  });
}
