/**
 * BellePoule Modern - Données publiques du serveur distant (#1194) : aucune donnée
 * personnelle ne sort vers le Wi-Fi (REST et Socket.IO), quelle que soit la route.
 * Retirés : date de naissance, licence (tireurs et arbitres), adresse IP des tablettes,
 * photo (sauf diffusions Socket.IO quand l'affichage des photos est activé).
 * Noms abrégés en option (RGPD, #1882) : « DUPONT L. » ou « D. L. » sur toutes les pages.
 * Licensed under GPL-3.0
 */
import type { NextFunction, Request, Response } from 'express';
import * as sioParser from 'socket.io-parser';
import type { NameMasking } from '../../shared/types/privacy';

/** Clés jamais diffusées, à toute profondeur. */
const PRIVATE_KEYS = new Set([
  'birthDate',
  'birth_date',
  'license',
  'licence',
  'ipAddress',
  'ip_address',
]);

/** Profondeur maximale parcourue (garde-fou contre une structure cyclique). */
const MAX_DEPTH = 24;

/** Prénoms (abrégés dès « initial ») */
const FIRST_NAME_KEYS = new Set(['firstName', 'first_name', 'fencerFirstName']);
/** Noms de famille (abrégés en « initials ») */
const LAST_NAME_KEYS = new Set(['lastName', 'last_name', 'fencerLastName']);
/** Noms complets composés (« DUPONT Léa ») */
const FULL_NAME_KEYS = new Set([
  'fullName',
  'fencerAName',
  'fencerBName',
  'nameA',
  'nameB',
  'refereeName',
  // Cartons noirs, programme d'un tireur (#1882)
  'fencerName',
  'opponentName',
  'opponent',
]);

/**
 * Objets « personne » dont la clé `name` est un nom complet (#1882) : `match.referee.name`,
 * `fencer.name` du programme public, listes d'arbitres. Ailleurs, `name` (club, arène,
 * compétition) n'est pas un nom de personne.
 */
const PERSON_PARENT_KEYS = new Set([
  'referee',
  'referees',
  'fencer',
  'fencers',
  'fencerA',
  'fencerB',
  'opponent',
]);

let nameMasking: NameMasking = 'full';

/** Affichage des noms sur le réseau (réglage RGPD, appliqué à chaud). */
export function setNameMasking(mode: NameMasking): void {
  nameMasking = mode;
}

export function getNameMasking(): NameMasking {
  return nameMasking;
}

/** Initiale d'un mot, prénoms composés compris : « Jean-Luc » → « J.-L. » */
export function initialOf(word: string): string {
  return word
    .split('-')
    .filter(Boolean)
    .map(part => `${Array.from(part)[0]?.toUpperCase() ?? ''}.`)
    .join('-');
}

const initialsOf = (text: string): string =>
  text.split(/\s+/).filter(Boolean).map(initialOf).join(' ');

/** Nom complet abrégé : les mots en MAJUSCULES sont le nom de famille (usage escrime) */
export function maskFullName(text: string, mode: NameMasking): string {
  if (mode === 'full' || !text) return text;
  if (mode === 'initials') return initialsOf(text);
  const words = text.split(/\s+/).filter(Boolean);
  const isUpper = (w: string) => /\p{L}/u.test(w) && w === w.toUpperCase();
  const hasUpper = words.some(isUpper);
  return words
    .map((w, i) => ((hasUpper ? isUpper(w) : i === words.length - 1) ? w : initialOf(w)))
    .join(' ');
}

function maskName(key: string, value: unknown, mode: NameMasking): unknown {
  if (mode === 'full' || typeof value !== 'string' || !value) return value;
  if (FIRST_NAME_KEYS.has(key)) return initialsOf(value);
  if (LAST_NAME_KEYS.has(key)) return mode === 'initials' ? initialsOf(value) : value;
  if (FULL_NAME_KEYS.has(key)) return maskFullName(value, mode);
  return value;
}

/**
 * Copie de `value` sans données personnelles (l'original n'est pas modifié).
 * `code` des arbitres (licence) retiré sous toute clé `referees`.
 */
export function stripPersonalData<T>(
  value: T,
  keepPhotos = false,
  masking: NameMasking = nameMasking
): T {
  const walk = (v: unknown, depth: number, parentKey: string): unknown => {
    if (v === null || typeof v !== 'object' || depth > MAX_DEPTH) return v;
    if (Array.isArray(v)) return v.map(item => walk(item, depth + 1, parentKey));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // Date, Buffer…
    const inPerson = PERSON_PARENT_KEYS.has(parentKey);
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v)) {
      if (PRIVATE_KEYS.has(k) || (k === 'photo' && !keepPhotos)) continue;
      if (k === 'code' && parentKey === 'referees') continue;
      out[k] =
        typeof child === 'string'
          ? k === 'name' && inPerson
            ? masking === 'full'
              ? child
              : maskFullName(child, masking)
            : maskName(k, child, masking)
          : walk(child, depth + 1, k);
    }
    return out;
  };
  return walk(value, 0, '') as T;
}

/** Middleware : toutes les réponses `res.json` passent par `stripPersonalData`. */
export function publicJson() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const original = res.json.bind(res);
    res.json = (body: unknown): Response => original(stripPersonalData(body));
    next();
  };
}

/**
 * Analyseur Socket.IO dont l'encodeur filtre chaque paquet sortant (diffusions, réponses
 * `join_arena`…). Format inchangé pour les clients. `keepPhotos` : affichage des photos actif.
 */
export function createPublicParser(keepPhotos: () => boolean): typeof sioParser {
  class PublicEncoder extends sioParser.Encoder {
    encode(packet: sioParser.Packet) {
      return super.encode({ ...packet, data: stripPersonalData(packet.data, keepPhotos()) });
    }
  }
  return { ...sioParser, Encoder: PublicEncoder };
}
