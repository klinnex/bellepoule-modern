/**
 * BellePoule Modern - FFE Connect Service
 * Import participants from Fédération Française d'Escrime API
 * Licensed under GPL-3.0
 */

import { Fencer, Gender, FencerStatus } from '../types';

export interface FFEParticipant {
  licence: string;
  nom: string;
  prenom: string;
  club: string;
  ligue: string;
  sexe: 'M' | 'F';
  dateNaissance: string; // YYYY-MM-DD
  nationalite: string;
  classement?: number;
}

export interface FFEConnectConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface FFEResultEntry {
  licence: string;
  rank: number;
  victories?: number;
  defeats?: number;
  touchesScored?: number;
  touchesReceived?: number;
}

const DEFAULT_BASE_URL = 'https://api.ffe.fr';
const TIMEOUT_MS = 5000;

export class FFEConnectService {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(config?: FFEConnectConfig) {
    this.apiKey = config?.apiKey;
    const base = config?.baseUrl ?? DEFAULT_BASE_URL;
    try {
      const parsed = new URL(base);
      if (parsed.protocol !== 'https:') throw new Error("HTTPS requis pour l'API FFE");
    } catch (e) {
      throw new Error(`URL API FFE invalide: ${e instanceof Error ? e.message : e}`);
    }
    this.baseUrl = base;
  }

  async importParticipants(competitionCode: string): Promise<{
    success: boolean;
    participants: FFEParticipant[];
    errors: string[];
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const url = `${this.baseUrl}/competition/${encodeURIComponent(competitionCode)}/participants`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    try {
      const response = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        return { success: false, participants: [], errors: ['Clé API invalide'] };
      }
      if (response.status === 404) {
        return { success: false, participants: [], errors: ['Compétition non trouvée'] };
      }
      if (!response.ok) {
        return {
          success: false,
          participants: [],
          errors: [`Erreur serveur: ${response.status} ${response.statusText}`],
        };
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        return {
          success: false,
          participants: [],
          errors: ['Réponse API invalide: tableau attendu'],
        };
      }
      return { success: true, participants: data as FFEParticipant[], errors: [] };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, participants: [], errors: ['Délai de connexion dépassé (5s)'] };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, participants: [], errors: [`Erreur réseau: ${message}`] };
    }
  }

  async exportResults(
    competitionCode: string,
    results: FFEResultEntry[]
  ): Promise<{ success: boolean; errors: string[] }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const url = `${this.baseUrl}/competition/${encodeURIComponent(competitionCode)}/results`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({ results }),
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        return { success: false, errors: ['Clé API invalide'] };
      }
      if (response.status === 404) {
        return { success: false, errors: ['Compétition non trouvée'] };
      }
      if (!response.ok) {
        return {
          success: false,
          errors: [`Erreur serveur: ${response.status} ${response.statusText}`],
        };
      }
      return { success: true, errors: [] };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, errors: ['Délai de connexion dépassé (5s)'] };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, errors: [`Erreur réseau: ${message}`] };
    }
  }

  async checkConnectivity(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
        method: 'HEAD',
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  }

  toFencer(participant: FFEParticipant): Partial<Fencer> {
    const fencer: Partial<Fencer> = {
      lastName: participant.nom,
      firstName: participant.prenom,
      club: participant.club,
      region: participant.ligue,
      license: participant.licence,
      nationality: participant.nationalite,
      gender: participant.sexe === 'M' ? Gender.MALE : Gender.FEMALE,
      status: FencerStatus.NOT_CHECKED_IN,
    };

    if (participant.classement !== undefined) {
      fencer.ranking = participant.classement;
      fencer.initialRanking = participant.classement;
    }

    if (participant.dateNaissance) {
      const parsed = new Date(participant.dateNaissance);
      if (!isNaN(parsed.getTime())) {
        fencer.birthDate = parsed;
      }
    }

    return fencer;
  }
}

export const ffeConnectService = new FFEConnectService();
