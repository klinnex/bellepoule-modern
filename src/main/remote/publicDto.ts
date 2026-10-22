/**
 * BellePoule Modern - Données publiques du serveur distant (#1194) : aucune donnée
 * personnelle ne sort vers le Wi-Fi (REST et Socket.IO), quelle que soit la route.
 * Retirés : date de naissance, licence (tireurs et arbitres), adresse IP des tablettes,
 * photo (sauf diffusions Socket.IO quand l'affichage des photos est activé).
 * Licensed under GPL-3.0
 */
import type { NextFunction, Request, Response } from 'express';
import * as sioParser from 'socket.io-parser';

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

/**
 * Copie de `value` sans données personnelles (l'original n'est pas modifié).
 * `code` des arbitres (licence) retiré sous toute clé `referees`.
 */
export function stripPersonalData<T>(value: T, keepPhotos = false): T {
  const walk = (v: unknown, depth: number, inReferees: boolean): unknown => {
    if (v === null || typeof v !== 'object' || depth > MAX_DEPTH) return v;
    if (Array.isArray(v)) return v.map(item => walk(item, depth + 1, inReferees));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // Date, Buffer…
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v)) {
      if (PRIVATE_KEYS.has(k) || (k === 'photo' && !keepPhotos)) continue;
      if (k === 'code' && inReferees) continue;
      out[k] = walk(child, depth + 1, k === 'referees');
    }
    return out;
  };
  return walk(value, 0, false) as T;
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
