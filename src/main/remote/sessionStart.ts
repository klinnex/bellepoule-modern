/**
 * BellePoule Modern - Démarrage d’une session de saisie distante (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { RemoteSession, ArenaMatch } from '../../shared/types/remote';
import { Weapon } from '../../shared/types';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface SessionStartContext {
  readonly applyCompetitionSettings: S['applyCompetitionSettings'];
  readonly arenaMatchQueue: S['arenaMatchQueue'];
  readonly arenaNextMatchIndex: S['arenaNextMatchIndex'];
  readonly arenas: S['arenas'];
  readonly assignMatchToArena: S['assignMatchToArena'];
  readonly db: S['db'];
  readonly loadSessionReferees: S['loadSessionReferees'];
  readonly notifyKioskData: S['notifyKioskData'];
  readonly poolFencersCache: S['poolFencersCache'];
  readonly poolSignaturesCache: S['poolSignaturesCache'];
  session: S['session'];
  sessionBlackCardEnabled: S['sessionBlackCardEnabled'];
  sessionCardAnnounce: S['sessionCardAnnounce'];
  sessionCustomScoring: S['sessionCustomScoring'];
  sessionKioskViews: S['sessionKioskViews'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  sessionMatches: S['sessionMatches'];
  sessionPoolArenas: S['sessionPoolArenas'];
  sessionRefereeFeatureEnabled: S['sessionRefereeFeatureEnabled'];
  sessionShowPhotos: S['sessionShowPhotos'];
  sessionWeapon: S['sessionWeapon'];
  readonly setArenaCount: S['setArenaCount'];
}

export async function startSession(
  ctx: SessionStartContext,
  competitionId: string,
  strips: number,
  matchesFromRenderer?: any[],
  showPhotos?: boolean,
  kioskViews?: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean },
  cardAnnounce?: boolean
): Promise<RemoteSession> {
  if (ctx.session) throw new Error('Session déjà active');

  const competition = ctx.db.getCompetition(competitionId);
  if (!competition) throw new Error('Compétition non trouvée');

  // Stocker le réglage d'affichage des photos
  ctx.sessionShowPhotos = showPhotos ?? false;

  // Stocker le réglage d'annonce de carton
  ctx.sessionCardAnnounce = cardAnnounce ?? false;

  // Stocker l'activation de la gestion des arbitres
  ctx.sessionRefereeFeatureEnabled = competition.settings?.refereeFeatureEnabled ?? false;

  // Carton noir : désactivé par défaut, activable dans les propriétés de la compétition
  ctx.sessionBlackCardEnabled = competition.settings?.blackCardEnabled === true;

  // Stocker les vues kiosk activées
  ctx.sessionKioskViews = {
    tableau: true,
    ...(kioskViews ?? {
      poules: true,
      classement: true,
      direct: true,
      suivants: true,
    }),
  };

  // Stocker le type d'arme pour l'arrêt automatique à 15 points en Laser Sabre
  ctx.sessionWeapon = competition.weapon || null;
  const formulaPhases = competition.settings?.customFormula?.phases ?? [];
  ctx.sessionCustomScoring =
    ctx.sessionWeapon === Weapon.CUSTOM
      ? {
          pool: formulaPhases.find(p => p.type === 'pool_round')?.config.scoring,
          de: formulaPhases.find(p => p.type === 'direct_elimination')?.config.scoring,
        }
      : null;
  ctx.applyCompetitionSettings(competition);
  console.log(`[RemoteScoreServer] Type d'arme de la compétition: ${ctx.sessionWeapon}`);

  // Auto-detect number of strips from pool count if not specified or too small.
  // Ne pas ajuster pour une session DE pure (uniquement des matchs tableau) car le nombre de
  // poules de la phase précédente ne doit pas gonfler le nombre d'arènes d'élimination.
  const poolCount = ctx.db.getPoolCount(competitionId);
  const isDeOnlySession =
    matchesFromRenderer &&
    matchesFromRenderer.length > 0 &&
    matchesFromRenderer.every((m: any) => m.isTableau || m.__poolFencers);
  if (!isDeOnlySession && strips <= 0) {
    const actualStrips = poolCount > 0 ? poolCount : 1;
    console.log(
      `[RemoteScoreServer] Strips invalide (${strips}), ajustement automatique: ${actualStrips} (basé sur ${poolCount} poules)`
    );
    strips = actualStrips;
  }

  // Pistes assignées aux poules (pool.strip) : poolId → n° de piste.
  // Le nombre d'arènes est étendu si une poule vise une piste au-delà du nombre configuré.
  const poolStripMap = new Map<string, number>();
  for (const m of matchesFromRenderer ?? []) {
    const s = Number((m as any).__poolFencers ? (m as any).strip : NaN);
    if (Number.isInteger(s) && s > 0 && s <= 20) poolStripMap.set(m.poolId, s);
  }
  const maxPoolStrip = Math.max(0, ...poolStripMap.values());
  if (maxPoolStrip > strips) {
    console.log(
      `[RemoteScoreServer] Nombre d'arènes étendu de ${strips} à ${maxPoolStrip} (piste assignée à une poule)`
    );
    strips = maxPoolStrip;
  }

  // Configurer le nombre d'arènes
  ctx.setArenaCount(strips);

  // Réinitialiser les caches pour éviter toute pollution d'une session précédente
  ctx.poolFencersCache.clear();
  ctx.poolSignaturesCache.clear();

  // Utiliser les matches passés depuis le renderer si disponibles, sinon chercher dans la DB
  let allMatches: any[];
  const poolNumberMap = new Map<string, number>();
  if (matchesFromRenderer && matchesFromRenderer.length > 0) {
    console.log(`[RemoteScoreServer] ${matchesFromRenderer.length} matchs reçus du renderer`);

    // Extraire les marqueurs d'ordre des tireurs injectés par le renderer (__poolFencers)
    // Nécessaire car l'ordre FIE (ex: 4 tireurs: [1,4],[2,3],...) ne permet pas de reconstruire
    // l'ordre correct par simple extraction des paires de matchs.
    const fencerOrderMap = new Map<string, any[]>();
    const realMatches: any[] = [];
    for (const m of matchesFromRenderer) {
      if ((m as any).__poolFencers) {
        fencerOrderMap.set(m.poolId, m.fencers);
        if ((m as any).poolNumber != null) poolNumberMap.set(m.poolId, (m as any).poolNumber);
      } else {
        realMatches.push(m);
      }
    }
    // Pré-remplir le cache uniquement si la liste de tireurs est non vide
    for (const [poolId, fencers] of fencerOrderMap) {
      if (fencers && fencers.length > 0) {
        ctx.poolFencersCache.set(poolId, fencers);
        console.log(
          `[RemoteScoreServer] Cache tireurs pre-rempli pour pool ${poolId}: ${fencers.length} tireurs`
        );
      } else {
        console.warn(
          `[RemoteScoreServer] Marqueur __poolFencers vide pour pool ${poolId}, fallback DB`
        );
      }
    }

    allMatches = realMatches.filter(
      m =>
        m.isTableau
          ? (!m.status || m.status === 'not_started' || m.status === 'in_progress') &&
            m.fencerA &&
            m.fencerB
          : true // Tous les matchs de poule, y compris finished (nécessaires pour la grille)
    );
    console.log(`[RemoteScoreServer] ${allMatches.length} matchs après filtrage`);
  } else {
    // Récupérer les matchs en attente depuis la DB
    console.log('[RemoteScoreServer] Pas de matches reçus, recherche dans la DB...');
    const pendingMatches = ctx.db.getPendingMatches(competitionId);
    console.log(
      `[RemoteScoreServer] ${pendingMatches.length} matchs en attente trouvés pour la compétition ${competitionId}`
    );

    // Si pas de matchs trouvés via getPendingMatches (phases), essayer de récupérer via pool_fencers
    allMatches = pendingMatches;
    if (pendingMatches.length === 0) {
      console.log('[RemoteScoreServer] Tentative de récupération des matchs via pool_fencers...');
      allMatches = ctx.db.getAllPendingMatchesFromPools(competitionId);
      console.log(`[RemoteScoreServer] ${allMatches.length} matchs trouvés via fallback`);
    }
  }

  // Stocker les matches pour pouvoir les utiliser pour charger le match suivant
  ctx.sessionMatches = allMatches;
  console.log(`[RemoteScoreServer] ${ctx.sessionMatches.length} matches stockés en mémoire`);

  // Grouper les matches par pool
  const matchesByPool = new Map<string, any[]>();
  for (const match of allMatches) {
    if (match.isTableau) continue; // Les matchs DE sont traités séparément plus bas
    const poolId = match.poolId || match.pool?.id || `pool-${match.poolNumber || match.number}`;
    if (!matchesByPool.has(poolId)) {
      matchesByPool.set(poolId, []);
    }
    matchesByPool.get(poolId)!.push(match);
  }
  console.log(
    `[RemoteScoreServer] ${matchesByPool.size} pools trouvées:`,
    Array.from(matchesByPool.keys())
  );

  // Construire le cache des tireurs par pool depuis la DB (ordre par position)
  // Note: les pools déjà remplis via les marqueurs __poolFencers du renderer sont conservés.
  ctx.sessionMatchScores.clear();
  for (const [poolId, poolMatches] of matchesByPool) {
    // Déjà rempli par les marqueurs du renderer → ordre correct garanti
    if (ctx.poolFencersCache.has(poolId)) continue;
    const dbFencers = ctx.db.getPoolFencers(poolId);
    if (dbFencers.length > 0) {
      ctx.poolFencersCache.set(poolId, dbFencers);
    } else {
      // Fallback si poolId synthétique (pool-N) sans correspondance DB.
      // Trier par number avant d'extraire pour reconstruire l'ordre naturel du pool :
      // la première apparition de chaque tireur dans l'ordre des matchs FIE correspond
      // à sa position dans la poule (match 1 : pos1 vs pos4, match 2 : pos2 vs pos3…).
      const sortedMatches = [...poolMatches].sort(
        (a: any, b: any) => (a.number || 0) - (b.number || 0)
      );
      const fencerMap = new Map<string, any>();
      for (const match of sortedMatches) {
        if (match.fencerA?.id) fencerMap.set(match.fencerA.id, match.fencerA);
        if (match.fencerB?.id) fencerMap.set(match.fencerB.id, match.fencerB);
      }
      ctx.poolFencersCache.set(poolId, Array.from(fencerMap.values()));
    }
  }

  // Assigner les matchs aux arènes par pool (Pool 1 -> Arena 1, Pool 2 -> Arena 2, etc.)
  console.log(`[RemoteScoreServer] Assignation des matches par pool aux ${strips} arènes`);

  // Trier les poules par numéro pour garantir Poule 1 → Arène 1, Poule 2 → Arène 2, etc.
  // poolNumberMap est peuplé par les marqueurs __poolFencers du renderer ;
  // le fallback extrait les chiffres du poolId (ex: "pool-0" → 0, "pool-1" → 1).
  const sortedPoolEntries = Array.from(matchesByPool.entries()).sort((a, b) => {
    const numA = poolNumberMap.get(a[0]) ?? parseInt(a[0].replace(/\D/g, '') || '999', 10);
    const numB = poolNumberMap.get(b[0]) ?? parseInt(b[0].replace(/\D/g, '') || '999', 10);
    return numA - numB;
  });

  // Piste cible par poule : pool.strip si défini, sinon première piste libre (ordre des poules)
  const poolArenaMap = new Map<string, number>();
  const usedStrips = new Set(poolStripMap.values());
  let nextFreeStrip = 1;
  for (const [poolId] of sortedPoolEntries) {
    const assigned = poolStripMap.get(poolId);
    if (assigned) {
      poolArenaMap.set(poolId, assigned);
      continue;
    }
    while (usedStrips.has(nextFreeStrip)) nextFreeStrip++;
    if (nextFreeStrip > strips) continue;
    poolArenaMap.set(poolId, nextFreeStrip);
    usedStrips.add(nextFreeStrip);
  }

  ctx.sessionPoolArenas = poolArenaMap;

  for (const [poolId, poolMatches] of sortedPoolEntries) {
    const arenaNumber = poolArenaMap.get(poolId);
    if (!arenaNumber) continue;

    const arenaId = `arena${arenaNumber}`;

    // Premier match non terminé et non en cours (évite le curseur orange au démarrage)
    const firstMatch = poolMatches.find(m => m.status !== 'finished' && m.status !== 'in_progress');

    if (!firstMatch) {
      // Tous les matchs sont terminés ou en cours : lier la pool à l'arène sans assigner de match
      const anyMatch = poolMatches[0];
      const arena = ctx.arenas.get(arenaId);
      if (anyMatch && arena && !arena.currentMatch) {
        arena.activePoolId = poolId;
        ctx.arenaNextMatchIndex.set(arenaId, poolMatches.length);
      }
      continue;
    }

    console.log(
      `[RemoteScoreServer] Pool ${poolId} -> Arène ${arenaId}, ${poolMatches.length} matches`
    );

    const arenaMatch: ArenaMatch = {
      id: firstMatch.id,
      poolId: poolId,
      fencerA: firstMatch.fencerA!,
      fencerB: firstMatch.fencerB!,
      scoreA: firstMatch.scoreA?.value ?? 0,
      scoreB: firstMatch.scoreB?.value ?? 0,
      status: 'not_started',
      startTime: null,
      endTime: null,
    };

    if (ctx.arenas.get(arenaId)?.currentMatch) {
      // Piste déjà occupée par une autre poule → cette poule enchaîne ensuite (file)
      const queue = ctx.arenaMatchQueue.get(arenaId) || [];
      ctx.arenaMatchQueue.set(arenaId, [...queue, arenaMatch]);
      console.log(
        `[RemoteScoreServer] Pool ${poolId} mise en file sur l'arène ${arenaId} (piste partagée)`
      );
      continue;
    }

    ctx.assignMatchToArena(arenaId, arenaMatch);

    // Index du prochain match = position de firstMatch + 1 dans la liste originale
    const firstMatchIndex = poolMatches.findIndex(m => m.id === firstMatch.id);
    ctx.arenaNextMatchIndex.set(arenaId, firstMatchIndex + 1);

    console.log(
      `[RemoteScoreServer] Match ${firstMatch.id} (Pool ${poolId}) assigné à l'arène ${arenaId}`
    );
  }

  // Distribuer les matchs d'élimination directe (sans poolId) dans les files par arène
  // Tri décroissant : 8ès en premier, finale en dernier → pistes chargées dans l'ordre logique
  const deMatches = allMatches
    .filter(m => !m.poolId && (m.round !== undefined || m.isTableau) && m.fencerA && m.fencerB)
    .sort((a: any, b: any) => (b.round || 0) - (a.round || 0));

  if (deMatches.length > 0) {
    console.log(
      `[RemoteScoreServer] ${deMatches.length} matchs DE à distribuer sur ${strips} arènes`
    );
    const queuesByArena = new Map<string, ArenaMatch[]>();
    for (let i = 1; i <= strips; i++) queuesByArena.set(`arena${i}`, []);

    for (const match of deMatches) {
      if (!match.arena) continue; // pas de piste assignée → ne pas distribuer
      const targetArenaId = `arena${match.arena}`;
      if (!queuesByArena.has(targetArenaId)) continue; // hors plage → ignorer
      queuesByArena.get(targetArenaId)!.push({
        id: match.id,
        fencerA: match.fencerA,
        fencerB: match.fencerB,
        scoreA: 0,
        scoreB: 0,
        status: 'not_started',
        startTime: null,
        endTime: null,
        isTableau: true,
      });
    }

    for (const [arenaId, queue] of queuesByArena) {
      const arena = ctx.arenas.get(arenaId);
      if (!arena) continue;
      const firstPlayable = !arena.currentMatch && queue.length > 0 ? queue[0] : undefined;
      if (firstPlayable) {
        // Arène libre → charger le premier match non bloqué directement
        ctx.assignMatchToArena(arenaId, firstPlayable);
        ctx.arenaMatchQueue.set(
          arenaId,
          queue.filter(m => m.id !== firstPlayable.id)
        );
        console.log(
          `[RemoteScoreServer] Match DE ${firstPlayable.id} chargé sur arène ${arenaId}, ${queue.length - 1} en file`
        );
      } else {
        // Arène occupée ou tous les matchs bloqués → tout en file
        const existing = ctx.arenaMatchQueue.get(arenaId) || [];
        ctx.arenaMatchQueue.set(arenaId, [...existing, ...queue]);
        console.log(
          `[RemoteScoreServer] ${queue.length} matchs DE mis en file sur arène ${arenaId}`
        );
      }
    }
  }

  // Créer la session - utiliser allMatches au lieu de pendingMatches
  const assignedMatchCount = Math.min(allMatches.length, strips);
  const sessionReferees = ctx.loadSessionReferees(competitionId);
  ctx.notifyKioskData();
  ctx.session = {
    competitionId,
    strips: Array.from({ length: strips }, (_, i) => ({
      number: i + 1,
      status: i < assignedMatchCount ? 'occupied' : 'available',
    })),
    referees: sessionReferees,
    activeMatches: [],
    isRunning: true,
    startTime: new Date(),
  };

  console.log(`[RemoteScoreServer] Session créée avec ${assignedMatchCount} matchs assignés`);

  return ctx.session;
}
