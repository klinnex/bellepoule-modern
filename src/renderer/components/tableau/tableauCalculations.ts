/**
 * BellePoule Modern - Fonctions pures de calcul du tableau d'élimination directe
 * Extraites de TableauView pour alléger le composant (aucune dépendance React).
 * Licensed under GPL-3.0
 */

import { Fencer, PoolRanking } from '../../../shared/types';
import {
  TableauMatch,
  FinalResult,
  ConsolationBracket,
  propagateWinners,
  isBracketComplete,
} from './tableauTypes';

export const BASE_MATCH_HEIGHT = 100;
export const SLOT_HEIGHT = BASE_MATCH_HEIGHT + 50; // hauteur d'un créneau dans la première colonne

export const getTableauSize = (fencerCount: number): number => {
  const sizes = [4, 8, 16, 32, 64, 128, 256];
  for (const size of sizes) {
    if (fencerCount <= size) return size;
  }
  return 256;
};

export const generateFIESeeding = (size: number): number[] => {
  if (size === 4) return [1, 4, 3, 2];
  if (size === 8) return [1, 8, 5, 4, 3, 6, 7, 2];
  if (size === 16) return [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2];
  if (size === 32) {
    return [
      1, 32, 17, 16, 9, 24, 25, 8, 5, 28, 21, 12, 13, 20, 29, 4, 3, 30, 19, 14, 11, 22, 27, 6, 7,
      26, 23, 10, 15, 18, 31, 2,
    ];
  }
  if (size === 64) {
    return [
      1, 64, 33, 32, 17, 48, 49, 16, 9, 56, 41, 24, 25, 40, 57, 8, 5, 60, 37, 28, 21, 44, 53, 12,
      13, 52, 45, 20, 29, 36, 61, 4, 3, 62, 35, 30, 19, 46, 51, 14, 11, 54, 43, 22, 27, 38, 59, 6,
      7, 58, 39, 26, 23, 42, 55, 10, 15, 50, 47, 18, 31, 34, 63, 2,
    ];
  }
  if (size === 128) {
    return [
      1, 128, 65, 64, 33, 96, 97, 32, 17, 112, 81, 48, 49, 80, 113, 16, 9, 120, 73, 56, 41, 88,
      105, 24, 25, 104, 89, 40, 57, 72, 121, 8, 5, 124, 69, 60, 37, 92, 101, 28, 21, 108, 85, 44,
      53, 76, 117, 12, 13, 116, 77, 52, 45, 84, 109, 20, 29, 100, 93, 36, 61, 68, 125, 4, 3, 126,
      67, 62, 35, 94, 99, 30, 19, 110, 83, 46, 51, 78, 115, 14, 11, 118, 75, 54, 43, 86, 107, 22,
      27, 102, 91, 38, 59, 70, 123, 6, 7, 122, 71, 58, 39, 90, 103, 26, 23, 106, 87, 42, 55, 74,
      119, 10, 15, 114, 79, 50, 47, 82, 111, 18, 31, 98, 95, 34, 63, 66, 127, 2,
    ];
  }
  return Array.from({ length: size }, (_, i) => i + 1);
};

// Génère les matchs d'un bracket (utilisé pour les brackets de consolation)
export const generateBracketMatches = (
  fencers: PoolRanking[],
  bracketSize: number,
  withThirdPlace: boolean,
  idPrefix: string
): TableauMatch[] => {
  const seeding = generateFIESeeding(bracketSize);
  const newMatches: TableauMatch[] = [];

  for (let i = 0; i < bracketSize / 2; i++) {
    const seedA = seeding[i * 2];
    const seedB = seeding[i * 2 + 1];
    const fencerA = seedA <= fencers.length ? fencers[seedA - 1].fencer : null;
    const fencerB = seedB <= fencers.length ? fencers[seedB - 1].fencer : null;
    const isBye = !fencerA || !fencerB;
    const winner = isBye ? fencerA || fencerB : null;
    newMatches.push({
      id: `${idPrefix}-${bracketSize}-${i}`,
      round: bracketSize,
      position: i,
      fencerA,
      fencerB,
      scoreA: null,
      scoreB: null,
      winner,
      isBye,
    });
  }

  let currentRound = bracketSize / 2;
  while (currentRound >= 2) {
    for (let i = 0; i < currentRound / 2; i++) {
      newMatches.push({
        id: `${idPrefix}-${currentRound}-${i}`,
        round: currentRound,
        position: i,
        fencerA: null,
        fencerB: null,
        scoreA: null,
        scoreB: null,
        winner: null,
        isBye: false,
      });
    }
    currentRound = currentRound / 2;
  }

  if (withThirdPlace && bracketSize >= 4) {
    newMatches.push({
      id: `${idPrefix}-3-0`,
      round: 3,
      position: 0,
      fencerA: null,
      fencerB: null,
      scoreA: null,
      scoreB: null,
      winner: null,
      isBye: false,
    });
  }

  propagateWinners(newMatches, bracketSize);
  return newMatches;
};

// Crée un bracket de consolation pour les perdants donnés
export const buildConsolationBracket = (
  losers: PoolRanking[],
  firstPlace: number,
  sourceRound: number,
  parentBracketId: string
): ConsolationBracket => {
  const sorted = [...losers].sort((a, b) => a.rank - b.rank);
  const bracketSize = getTableauSize(sorted.length);
  const idPrefix = `cons-${firstPlace}-${Date.now()}`;
  const lastPlace = firstPlace + sorted.length - 1;
  const bracketMatches = generateBracketMatches(sorted, bracketSize, true, idPrefix);
  return {
    id: idPrefix,
    name: `Places ${firstPlace}–${lastPlace}`,
    firstPlace,
    matches: bracketMatches,
    size: bracketSize,
    isComplete: false,
    sourceRound,
    parentBracketId,
  };
};

// Calcule le firstPlace d'un sous-tableau de consolation pour un round donné dans un bracket parent
// La première place d'un bracket de consolation pour les perdants du round R du bracket parent.
// Formule : parentFirstPlace + round / 2
// Exemple (S=16, FP=1) : round 16 → 9, round 8 → 5
export const consolationFirstPlace = (parentFirstPlace: number, round: number): number => {
  return parentFirstPlace + round / 2;
};

// Vérifie si un round d'un bracket est complet (tous les matchs ont un gagnant)
export const isRoundComplete = (bracketMatches: TableauMatch[], round: number): boolean => {
  const roundMatches = bracketMatches.filter(m => m.round === round);
  return roundMatches.length > 0 && roundMatches.every(m => m.winner !== null);
};

// Collecte les perdants d'un round dans un bracket
export const getRoundLosers = (
  bracketMatches: TableauMatch[],
  round: number,
  allRankings: PoolRanking[]
): PoolRanking[] => {
  const roundMatches = bracketMatches.filter(m => m.round === round && m.winner);
  const losers: PoolRanking[] = [];
  for (const m of roundMatches) {
    const loser = m.fencerA?.id === m.winner?.id ? m.fencerB : m.fencerA;
    if (loser) {
      const rankEntry = allRankings.find(r => r.fencer.id === loser.id);
      if (rankEntry) losers.push(rankEntry);
    }
  }
  return losers;
};

export const getRoundName = (round: number): string => {
  if (round === 2) return 'Finale';
  if (round === 3) return 'Petite finale';
  if (round === 4) return 'Demi-finales';
  if (round === 8) return 'Quarts de finale';
  if (round === 16) return 'Tableau de 16';
  if (round === 32) return 'Tableau de 32';
  if (round === 64) return 'Tableau de 64';
  return `Tableau de ${round}`;
};

// Construit les matchs du tableau principal (premier tour + tours suivants + barrages
// et petite finale le cas échéant) à partir des tireurs qualifiés triés par rang.
export const buildTableauMatches = (
  qualifiedFencers: PoolRanking[],
  mainSize: number,
  playAllPositions: boolean,
  thirdPlaceMatch: boolean
): TableauMatch[] => {
  const barrageCount = qualifiedFencers.length - mainSize; // fencers en excès (0 si déjà puissance de 2)

  const newMatches: TableauMatch[] = [];

  if (playAllPositions && barrageCount > 0) {
    // Créer les matchs de barrages pour les seeds du bas
    // Barrage i : seed (mainSize - barrageCount + i + 1) vs seed (qualifiedFencers.length - i)
    for (let i = 0; i < barrageCount; i++) {
      const seedA = mainSize - barrageCount + i + 1;
      const seedB = qualifiedFencers.length - i;
      const fencerA = qualifiedFencers[seedA - 1]?.fencer ?? null;
      const fencerB = qualifiedFencers[seedB - 1]?.fencer ?? null;
      newMatches.push({
        id: `barrage-${i}`,
        round: mainSize * 2, // valeur spéciale > premier tour du tableau
        position: i,
        fencerA,
        fencerB,
        scoreA: null,
        scoreB: null,
        winner: null,
        isBye: false,
      });
    }
  }

  // Premier tour du tableau principal
  // Avec barrages : les mainSize - barrageCount premiers seeds sont placés directement,
  // les barrageCount derniers slots seront remplis par les gagnants des barrages.
  const directFencers = playAllPositions && barrageCount > 0
    ? qualifiedFencers.slice(0, mainSize - barrageCount)
    : qualifiedFencers;

  const size = mainSize;
  const seeding = generateFIESeeding(size);

  for (let i = 0; i < size / 2; i++) {
    const seedA = seeding[i * 2];
    const seedB = seeding[i * 2 + 1];

    const fencerA = seedA <= directFencers.length ? directFencers[seedA - 1].fencer : null;
    const fencerB = seedB <= directFencers.length ? directFencers[seedB - 1].fencer : null;

    const isBye = !playAllPositions && (!fencerA || !fencerB);
    const winner = isBye ? fencerA || fencerB : null;

    newMatches.push({
      id: `${size}-${i}`,
      round: size,
      position: i,
      fencerA,
      fencerB,
      scoreA: null,
      scoreB: null,
      winner,
      isBye,
    });
  }

  // Générer les rounds suivants
  let currentRound = size / 2;
  while (currentRound >= 2) {
    for (let i = 0; i < currentRound / 2; i++) {
      newMatches.push({
        id: `${currentRound}-${i}`,
        round: currentRound,
        position: i,
        fencerA: null,
        fencerB: null,
        scoreA: null,
        scoreB: null,
        winner: null,
        isBye: false,
      });
    }
    currentRound = currentRound / 2;
  }

  // Ajouter le match pour la 3ème place si demandé (ou forcé en mode playAllPositions)
  if ((thirdPlaceMatch || playAllPositions) && size >= 4) {
    newMatches.push({
      id: '3-0',
      round: 3,
      position: 0,
      fencerA: null,
      fencerB: null,
      scoreA: null,
      scoreB: null,
      winner: null,
      isBye: false,
    });
  }

  // Propager les byes (seulement pour le tableau standard sans playAllPositions)
  propagateWinners(newMatches, size);
  return newMatches;
};

// Remplit aléatoirement les scores des matchs non terminés (outil de test).
// Retourne la liste mise à jour et le nombre de matchs remplis.
export const autoFillTableauScores = (
  matches: TableauMatch[],
  effectiveMax: number,
  tableauSize: number
): { updatedMatches: TableauMatch[]; filledCount: number } => {
  // Copier les matchs actuels
  const updatedMatches = [...matches];
  let filledCount = 0;

  // Traiter les matchs par ordre décroissant de round (du premier tour vers la finale)
  // Exclure la petite finale (round 3) car elle dépend des résultats des demi-finales
  const rounds = [...new Set(matches.map(m => m.round))]
    .filter(r => r !== 3)
    .sort((a, b) => b - a);

  for (const round of rounds) {
    // Ignorer les matchs incomplets (adversaire en attente : gagnant de barrage, etc.)
    const roundMatches = updatedMatches.filter(
      m => m.round === round && !m.winner && !m.isBye && m.fencerA && m.fencerB
    );

    for (const match of roundMatches) {
      // Générer des scores aléatoires
      let scoreA = Math.floor(Math.random() * (effectiveMax + 1));
      let scoreB = Math.floor(Math.random() * (effectiveMax + 1));

      // Éviter les égalités en élimination directe sans dépasser effectiveMax
      if (scoreA === scoreB) {
        if (Math.random() > 0.5) {
          if (scoreA < effectiveMax) scoreA += 1;
          else scoreB -= 1;
        } else {
          if (scoreB < effectiveMax) scoreB += 1;
          else scoreA -= 1;
        }
      }

      // Déterminer le vainqueur
      const winner = scoreA > scoreB ? match.fencerA : match.fencerB;

      // Mettre à jour le match
      const matchIndex = updatedMatches.findIndex(m => m.id === match.id);
      if (matchIndex !== -1) {
        updatedMatches[matchIndex] = {
          ...match,
          scoreA,
          scoreB,
          winner,
        };
        filledCount++;
      }
    }

    // Propager les vainqueurs au tour suivant
    propagateWinners(updatedMatches, tableauSize);
  }

  // Traiter la petite finale en dernier (elle dépend des perdants des demi-finales)
  const thirdPlaceMatch = updatedMatches.find(m => m.round === 3);
  if (
    thirdPlaceMatch &&
    thirdPlaceMatch.fencerA &&
    thirdPlaceMatch.fencerB &&
    !thirdPlaceMatch.winner
  ) {
    let scoreA = Math.floor(Math.random() * (effectiveMax + 1));
    let scoreB = Math.floor(Math.random() * (effectiveMax + 1));

    if (scoreA === scoreB) {
      if (Math.random() > 0.5) {
        if (scoreA < effectiveMax) scoreA += 1;
        else scoreB -= 1;
      } else {
        if (scoreB < effectiveMax) scoreB += 1;
        else scoreA -= 1;
      }
    }

    const winner = scoreA > scoreB ? thirdPlaceMatch.fencerA : thirdPlaceMatch.fencerB;
    const matchIndex = updatedMatches.findIndex(m => m.id === thirdPlaceMatch.id);
    if (matchIndex !== -1) {
      updatedMatches[matchIndex] = {
        ...thirdPlaceMatch,
        scoreA,
        scoreB,
        winner,
      };
      filledCount++;
    }
  }

  return { updatedMatches, filledCount };
};

// Mode « toutes les places » : place les gagnants de barrages dans le premier tour du
// tableau principal. Mute `matchList`, retourne true si un tireur a été placé.
export const placeBarrageWinners = (matchList: TableauMatch[], tableauSize: number): boolean => {
  const barrageMatches = matchList.filter(m => m.round === tableauSize * 2);
  if (barrageMatches.length === 0) return false;

  // directCount fixe = nombre de tireurs qui vont directement au tableau (sans barrage)
  const directCount = tableauSize - barrageMatches.length;
  const firstRoundMatches = matchList
    .filter(m => m.round === tableauSize)
    .sort((a, b) => a.position - b.position);
  const seeding = generateFIESeeding(tableauSize);
  let placed = false;

  for (let i = 0; i < barrageMatches.length; i++) {
    const barrage = barrageMatches[i];
    if (!barrage.winner) continue;
    // Le gagnant du barrage i occupe le slot pour seed = directCount + i + 1
    const targetPos = seeding.indexOf(directCount + i + 1);
    if (targetPos < 0) continue;
    const match = firstRoundMatches[Math.floor(targetPos / 2)];
    if (!match) continue;
    const isA = targetPos % 2 === 0;
    const current = isA ? match.fencerA : match.fencerB;
    if (current?.id === barrage.winner.id) continue;
    if (isA) match.fencerA = barrage.winner;
    else match.fencerB = barrage.winner;
    placed = true;
  }

  if (placed) propagateWinners(matchList, tableauSize);
  return placed;
};

// Mode « toutes les places » : crée les brackets de consolation (barrages, rounds du
// tableau principal, sous-brackets) et marque les brackets terminés.
export const syncConsolationBrackets = (
  matchList: TableauMatch[],
  brackets: ConsolationBracket[],
  tableauSize: number,
  ranking: PoolRanking[]
): { brackets: ConsolationBracket[]; changed: boolean } => {
  const updated = [...brackets];
  let changed = false;

  // Barrages : round = mainSize * 2
  const barrageRound = tableauSize * 2;
  const barrageMatches = matchList.filter(m => m.round === barrageRound);
  if (barrageMatches.length > 0 && isRoundComplete(matchList, barrageRound)) {
    const alreadyExists = updated.some(b => b.sourceRound === barrageRound && b.parentBracketId === 'main');
    if (!alreadyExists) {
      const losers = getRoundLosers(matchList, barrageRound, ranking);
      if (losers.length > 0) {
        // bracket pour les dernières places
        updated.push(buildConsolationBracket(losers, tableauSize + 1, barrageRound, 'main'));
        changed = true;
      }
    }
  }

  // Chaque round du tableau principal (> 4, donc QF et plus profonds)
  const mainRounds = [tableauSize, ...Array.from({ length: Math.log2(tableauSize) - 2 }, (_, i) => tableauSize / Math.pow(2, i + 1))].filter(r => r > 4);
  for (const round of mainRounds) {
    if (!isRoundComplete(matchList, round)) continue;
    const alreadyExists = updated.some(b => b.sourceRound === round && b.parentBracketId === 'main');
    if (alreadyExists) continue;
    const losers = getRoundLosers(matchList, round, ranking);
    if (losers.length === 0) continue;
    updated.push(buildConsolationBracket(losers, consolationFirstPlace(1, round), round, 'main'));
    changed = true;
  }

  // Brackets de consolation existants → sous-brackets
  for (let idx = 0; idx < updated.length; idx++) {
    const bracket = updated[idx];
    if (bracket.isComplete) continue;
    const bracketRounds = Array.from(
      { length: Math.log2(bracket.size) - 1 },
      (_, i) => bracket.size / Math.pow(2, i)
    ).filter(r => r > 4);

    for (const round of bracketRounds) {
      if (!isRoundComplete(bracket.matches, round)) continue;
      const alreadyExists = updated.some(b => b.sourceRound === round && b.parentBracketId === bracket.id);
      if (alreadyExists) continue;
      const losers = getRoundLosers(bracket.matches, round, ranking);
      if (losers.length === 0) continue;
      const fp = consolationFirstPlace(bracket.firstPlace, round);
      updated.push(buildConsolationBracket(losers, fp, round, bracket.id));
      changed = true;
    }

    if (isBracketComplete(bracket.matches)) {
      updated[idx] = { ...bracket, isComplete: true };
      changed = true;
    }
  }

  return { brackets: changed ? updated : brackets, changed };
};

// Mode « toutes les places » : remplit aléatoirement barrages, tableau principal et
// TOUS les brackets de consolation (créés au fil de l'eau) jusqu'au classement complet.
export const autoFillAllPositions = (
  matches: TableauMatch[],
  brackets: ConsolationBracket[],
  effectiveMax: number,
  tableauSize: number,
  ranking: PoolRanking[]
): { updatedMatches: TableauMatch[]; updatedBrackets: ConsolationBracket[]; filledCount: number } => {
  let updatedMatches = matches.map(m => ({ ...m }));
  let filledCount = 0;

  // Tableau principal : barrages → placement des gagnants → tours suivants
  for (;;) {
    const res = autoFillTableauScores(updatedMatches, effectiveMax, tableauSize);
    updatedMatches = res.updatedMatches.map(m => ({ ...m }));
    filledCount += res.filledCount;
    const placed = placeBarrageWinners(updatedMatches, tableauSize);
    if (res.filledCount === 0 && !placed) break;
  }

  // Brackets de consolation : création → remplissage, jusqu'à stabilité
  let updatedBrackets = brackets;
  for (;;) {
    const sync = syncConsolationBrackets(updatedMatches, updatedBrackets, tableauSize, ranking);
    updatedBrackets = sync.brackets;
    let filledHere = 0;
    updatedBrackets = updatedBrackets.map(bracket => {
      if (bracket.isComplete) return bracket;
      const res = autoFillTableauScores(bracket.matches.map(m => ({ ...m })), effectiveMax, bracket.size);
      if (res.filledCount === 0) return bracket;
      filledHere += res.filledCount;
      return { ...bracket, matches: res.updatedMatches.map(m => ({ ...m })) };
    });
    filledCount += filledHere;
    if (!sync.changed && filledHere === 0) break;
  }

  return { updatedMatches, updatedBrackets, filledCount };
};

// Helper: calculer les touches marquées par un tireur dans tous les matchs de tableau
export const getTableTouches = (fencerId: string, matchList: TableauMatch[]): number => {
  let touches = 0;
  for (const match of matchList) {
    if (match.fencerA?.id === fencerId && match.scoreA !== null) {
      touches += match.scoreA;
    } else if (match.fencerB?.id === fencerId && match.scoreB !== null) {
      touches += match.scoreB;
    }
  }
  return touches;
};

// Helper: récupérer les touches marquées en poules
export const getPoolTouches = (fencerId: string, ranking: PoolRanking[]): number => {
  const poolRank = ranking.find(r => r.fencer.id === fencerId);
  return poolRank?.touchesScored ?? 0;
};

export const calculateFinalResults = (
  matchList: TableauMatch[],
  ranking: PoolRanking[],
  tableauSize: number
): FinalResult[] => {
  // DEBUG: console.log('=== calculateFinalResults ===');
  // DEBUG: console.log('Nombre de matchs:', matchList.length);

  const results: FinalResult[] = [];
  const processed = new Set<string>();

  // Champion (gagnant de la finale)
  const finalMatch = matchList.find(m => m.round === 2);
  // DEBUG: console.log('Finale:', finalMatch?.fencerA?.lastName, 'vs', finalMatch?.fencerB?.lastName, 'winner:', finalMatch?.winner?.lastName);

  if (finalMatch?.winner) {
    const winnerPoolData = ranking.find(r => r.fencer.id === finalMatch.winner!.id);
    results.push({
      rank: 1,
      fencer: finalMatch.winner,
      eliminatedAt: 'Vainqueur',
      poolTouches: winnerPoolData?.touchesScored,
      tableTouches: getTableTouches(finalMatch.winner.id, matchList),
      totalTouches:
        (winnerPoolData?.touchesScored ?? 0) + getTableTouches(finalMatch.winner.id, matchList),
    });
    processed.add(finalMatch.winner.id);

    // 2ème (perdant de la finale)
    const loser =
      finalMatch.fencerA?.id === finalMatch.winner.id ? finalMatch.fencerB : finalMatch.fencerA;
    if (loser) {
      const loserPoolData = ranking.find(r => r.fencer.id === loser.id);
      results.push({
        rank: 2,
        fencer: loser,
        eliminatedAt: 'Finale',
        poolTouches: loserPoolData?.touchesScored,
        tableTouches: getTableTouches(loser.id, matchList),
        totalTouches: (loserPoolData?.touchesScored ?? 0) + getTableTouches(loser.id, matchList),
      });
      processed.add(loser.id);
      // DEBUG: console.log('2ème place:', loser.lastName);
    }
  }

  // Match pour la 3ème place (existe si présent)
  const thirdPlaceMatch = matchList.find(m => m.round === 3);
  // DEBUG: console.log('Petite finale:', thirdPlaceMatch?.fencerA?.lastName, 'vs', thirdPlaceMatch?.fencerB?.lastName, 'winner:', thirdPlaceMatch?.winner?.lastName);

  if (thirdPlaceMatch?.winner) {
    const winnerPoolData = ranking.find(r => r.fencer.id === thirdPlaceMatch.winner!.id);
    results.push({
      rank: 3,
      fencer: thirdPlaceMatch.winner,
      eliminatedAt: 'Petite Finale',
      poolTouches: winnerPoolData?.touchesScored,
      tableTouches: getTableTouches(thirdPlaceMatch.winner.id, matchList),
      totalTouches:
        (winnerPoolData?.touchesScored ?? 0) +
        getTableTouches(thirdPlaceMatch.winner.id, matchList),
    });
    processed.add(thirdPlaceMatch.winner.id);
    // DEBUG: console.log('3ème place:', thirdPlaceMatch.winner.lastName);

    // 4ème place (perdant du match pour la 3ème place)
    const fourthPlace =
      thirdPlaceMatch.fencerA?.id === thirdPlaceMatch.winner.id
        ? thirdPlaceMatch.fencerB
        : thirdPlaceMatch.fencerA;
    if (fourthPlace) {
      const fourthPoolData = ranking.find(r => r.fencer.id === fourthPlace.id);
      results.push({
        rank: 4,
        fencer: fourthPlace,
        eliminatedAt: 'Petite Finale',
        poolTouches: fourthPoolData?.touchesScored,
        tableTouches: getTableTouches(fourthPlace.id, matchList),
        totalTouches:
          (fourthPoolData?.touchesScored ?? 0) + getTableTouches(fourthPlace.id, matchList),
      });
      processed.add(fourthPlace.id);
      // DEBUG: console.log('4ème place:', fourthPlace.lastName);
    }
  }

  // Parcourir les autres tours en ordre croissant (du plus proche de la finale au plus éloigné)
  // pour que les éliminés en demi-finale soient classés avant les quarts, etc.
  // Issue #61: Les éliminés en quarts se retrouvaient en bas du classement
  // Issue #60: Les tireurs éliminés à chaque tour ont des rangs distincts
  // Issue #59: Départage par somme des points Quest (poules + tableau)
  const effectiveSize = matchList.length > 0
    ? Math.max(...matchList.filter(m => m.round !== 3).map(m => m.round))
    : tableauSize;
  const rounds = [4, 8, 16, 32, 64, 128].filter(r => r <= effectiveSize);
  let currentRank = thirdPlaceMatch?.winner ? 5 : 3;

  // DEBUG: console.log('Rounds à traiter:', rounds, 'currentRank de départ:', currentRank);

  for (const round of rounds) {
    const roundMatches = matchList.filter(m => m.round === round && m.winner);
    const losersData: Array<{
      fencer: Fencer;
      poolRank: number;
      poolTouches: number;
      tableTouches: number;
      totalTouches: number;
    }> = [];

    for (const match of roundMatches) {
      const loser = match.fencerA?.id === match.winner?.id ? match.fencerB : match.fencerA;
      if (loser && !processed.has(loser.id)) {
        const poolRankEntry = ranking.find(r => r.fencer.id === loser.id);
        const poolTou = getPoolTouches(loser.id, ranking);
        const tableTou = getTableTouches(loser.id, matchList);

        losersData.push({
          fencer: loser,
          poolRank: poolRankEntry?.rank ?? 9999,
          poolTouches: poolTou,
          tableTouches: tableTou,
          totalTouches: poolTou + tableTou,
        });
        processed.add(loser.id);
      }
    }

    // Trier par classement de poules (croissant — meilleur classé en poules = meilleur rang final)
    losersData.sort((a, b) => a.poolRank - b.poolRank);

    // Issue #60: Assigner des rangs distincts (pas le même rang pour tous)
    for (const loserData of losersData) {
      results.push({
        rank: currentRank,
        fencer: loserData.fencer,
        eliminatedAt: getRoundName(round),
        poolTouches: loserData.poolTouches,
        tableTouches: loserData.tableTouches,
        totalTouches: loserData.totalTouches,
      });
      currentRank++;
    }
  }

  // DEBUG: console.log('Résultats finaux:', results.map(r => `${r.rank}. ${r.fencer.lastName}`).join(', '));

  return results.sort((a, b) => a.rank - b.rank);
};

// Construit les résultats combinés pour le mode playAllPositions
export const buildCombinedResults = (
  mainMatches: TableauMatch[],
  consolBrackets: ConsolationBracket[],
  ranking: PoolRanking[]
): FinalResult[] => {
  const results: FinalResult[] = [];

  // Places 1-4 du tableau principal
  const finalM = mainMatches.find(m => m.round === 2);
  const thirdM = mainMatches.find(m => m.round === 3);
  if (finalM?.winner) {
    results.push({ rank: 1, fencer: finalM.winner, eliminatedAt: 'Vainqueur',
      poolTouches: getPoolTouches(finalM.winner.id, ranking), tableTouches: getTableTouches(finalM.winner.id, mainMatches), totalTouches: getPoolTouches(finalM.winner.id, ranking) + getTableTouches(finalM.winner.id, mainMatches) });
    const loser2 = finalM.fencerA?.id === finalM.winner.id ? finalM.fencerB : finalM.fencerA;
    if (loser2) results.push({ rank: 2, fencer: loser2, eliminatedAt: 'Finale',
      poolTouches: getPoolTouches(loser2.id, ranking), tableTouches: getTableTouches(loser2.id, mainMatches), totalTouches: getPoolTouches(loser2.id, ranking) + getTableTouches(loser2.id, mainMatches) });
  }
  if (thirdM?.winner) {
    results.push({ rank: 3, fencer: thirdM.winner, eliminatedAt: 'Petite Finale',
      poolTouches: getPoolTouches(thirdM.winner.id, ranking), tableTouches: getTableTouches(thirdM.winner.id, mainMatches), totalTouches: getPoolTouches(thirdM.winner.id, ranking) + getTableTouches(thirdM.winner.id, mainMatches) });
    const loser4 = thirdM.fencerA?.id === thirdM.winner.id ? thirdM.fencerB : thirdM.fencerA;
    if (loser4) results.push({ rank: 4, fencer: loser4, eliminatedAt: 'Petite Finale',
      poolTouches: getPoolTouches(loser4.id, ranking), tableTouches: getTableTouches(loser4.id, mainMatches), totalTouches: getPoolTouches(loser4.id, ranking) + getTableTouches(loser4.id, mainMatches) });
  }

  // Résultats de chaque bracket de consolation
  const sortedBrackets = [...consolBrackets].sort((a, b) => a.firstPlace - b.firstPlace);
  for (const bracket of sortedBrackets) {
    const bFinal = bracket.matches.find(m => m.round === 2);
    const bThird = bracket.matches.find(m => m.round === 3);
    const fp = bracket.firstPlace;
    if (bFinal?.winner) {
      results.push({ rank: fp, fencer: bFinal.winner, eliminatedAt: bracket.name,
        poolTouches: getPoolTouches(bFinal.winner.id, ranking), tableTouches: getTableTouches(bFinal.winner.id, bracket.matches), totalTouches: getPoolTouches(bFinal.winner.id, ranking) + getTableTouches(bFinal.winner.id, bracket.matches) });
      const l2 = bFinal.fencerA?.id === bFinal.winner.id ? bFinal.fencerB : bFinal.fencerA;
      if (l2) results.push({ rank: fp + 1, fencer: l2, eliminatedAt: bracket.name,
        poolTouches: getPoolTouches(l2.id, ranking), tableTouches: getTableTouches(l2.id, bracket.matches), totalTouches: getPoolTouches(l2.id, ranking) + getTableTouches(l2.id, bracket.matches) });
    }
    if (bThird?.winner) {
      results.push({ rank: fp + 2, fencer: bThird.winner, eliminatedAt: bracket.name,
        poolTouches: getPoolTouches(bThird.winner.id, ranking), tableTouches: getTableTouches(bThird.winner.id, bracket.matches), totalTouches: getPoolTouches(bThird.winner.id, ranking) + getTableTouches(bThird.winner.id, bracket.matches) });
      const l4 = bThird.fencerA?.id === bThird.winner.id ? bThird.fencerB : bThird.fencerA;
      if (l4) results.push({ rank: fp + 3, fencer: l4, eliminatedAt: bracket.name,
        poolTouches: getPoolTouches(l4.id, ranking), tableTouches: getTableTouches(l4.id, bracket.matches), totalTouches: getPoolTouches(l4.id, ranking) + getTableTouches(l4.id, bracket.matches) });
    }
  }

  return results.sort((a, b) => a.rank - b.rank);
};

// Position verticale d'un match dans la vue arborescente complète
export const calculateMatchVerticalPosition = (
  matchRound: number,
  matchPosition: number,
  baseRound: number
): number => {
  // k = nombre de créneaux de la première colonne couverts par ce match
  const k = baseRound / matchRound;
  // Centre ce match verticalement dans ses k créneaux
  return (matchPosition + 0.5) * k * SLOT_HEIGHT - BASE_MATCH_HEIGHT / 2;
};
