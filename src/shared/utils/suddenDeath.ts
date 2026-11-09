/**
 * BellePoule Modern - Sudden Death System (FFE Sabre Laser)
 * Gestion de la mort subite selon le règlement 2025-2026
 * Licensed under GPL-3.0
 */

import { MatchMode, TargetZone } from '../types';

const CHALLENGER_THRESHOLD = 10;
const SUDDEN_DEATH_DURATION = 30;
const DEFAULT_MATCH_DURATION = 180;

export interface SuddenDeathResult {
  shouldTrigger: boolean;
  mode: MatchMode | null;
  reason: string | null;
}

export interface TouchValidationResult {
  isValid: boolean;
  message: string;
}

export function checkChallengerSuddenDeath(scoreA: number, scoreB: number): SuddenDeathResult {
  const bothAtThreshold = scoreA >= CHALLENGER_THRESHOLD && scoreB >= CHALLENGER_THRESHOLD;

  if (bothAtThreshold) {
    return {
      shouldTrigger: true,
      mode: MatchMode.SUDDEN_DEATH_CHALLENGER,
      reason: 'Les deux combattants ont atteint 10 points',
    };
  }

  return {
    shouldTrigger: false,
    mode: null,
    reason: null,
  };
}

export function checkTimeoutSuddenDeath(
  remainingTime: number,
  scoreA: number,
  scoreB: number
): SuddenDeathResult {
  const timeUp = remainingTime <= 0;
  const isTie = scoreA === scoreB;

  if (timeUp && isTie) {
    const bothAtThreshold = scoreA >= CHALLENGER_THRESHOLD && scoreB >= CHALLENGER_THRESHOLD;
    return {
      shouldTrigger: true,
      mode: bothAtThreshold ? MatchMode.SUDDEN_DEATH_TIMEOUT : MatchMode.SUPPLEMENTARY_TIME,
      reason: bothAtThreshold
        ? 'Fin du temps avec score ≥10 égal - 30s mort subite (Zone C uniquement)'
        : 'Fin du temps avec score égal - 30s supplémentaire',
    };
  }

  return {
    shouldTrigger: false,
    mode: null,
    reason: null,
  };
}

export function isValidSuddenDeathTouch(
  zone: TargetZone,
  matchMode: MatchMode
): TouchValidationResult {
  if (matchMode === MatchMode.SUPPLEMENTARY_TIME) {
    return { isValid: true, message: 'Toutes les zones sont valides' };
  }

  if (
    matchMode !== MatchMode.SUDDEN_DEATH_CHALLENGER &&
    matchMode !== MatchMode.SUDDEN_DEATH_TIMEOUT
  ) {
    return { isValid: true, message: '' };
  }

  if (zone === TargetZone.ZONE_C) {
    return { isValid: true, message: 'Zone C valide - touche compte' };
  }

  return {
    isValid: false,
    message: 'Zone A/B valide uniquement pour la priorité (ne marque pas en mort subite)',
  };
}

export function shouldEndMatch(
  matchMode: MatchMode,
  scoreA: number,
  scoreB: number,
  lastTouchZone?: TargetZone,
  maxScore: number = 15
): boolean {
  if (matchMode === MatchMode.NORMAL) {
    return scoreA >= maxScore || scoreB >= maxScore;
  }

  if (matchMode === MatchMode.SUPPLEMENTARY_TIME) {
    return scoreA !== scoreB;
  }

  if (
    matchMode === MatchMode.SUDDEN_DEATH_CHALLENGER ||
    matchMode === MatchMode.SUDDEN_DEATH_TIMEOUT
  ) {
    if (lastTouchZone === TargetZone.ZONE_C) {
      return scoreA !== scoreB;
    }
  }

  return false;
}

export function drawWinner(): 'A' | 'B' {
  return Math.random() < 0.5 ? 'A' : 'B';
}

export function isSupplementaryTime(matchMode: MatchMode): boolean {
  return matchMode === MatchMode.SUPPLEMENTARY_TIME;
}

export function getSuddenDeathOvertimeDuration(): number {
  return SUDDEN_DEATH_DURATION;
}

export function getMatchDuration(): number {
  return DEFAULT_MATCH_DURATION;
}

export function formatSuddenDeathTime(seconds: number): string {
  return `00:${seconds.toString().padStart(2, '0')}`;
}

export function getSuddenDeathRules(): string[] {
  return [
    'Seule la ZONE C (Tête/Tronc) met fin au match',
    'Les zones A et B maintiennent la priorité mais ne marquent pas',
    "En cas d'égalité à la fin du temps supplémentaire, un tirage au sort désigne le gagnant",
  ];
}
