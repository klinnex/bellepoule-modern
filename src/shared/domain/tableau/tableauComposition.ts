/**
 * BellePoule Modern - Tableau généré par l'écran, écrit par le moteur (#1980, docs/adr/0017,
 * palier « tableau »). L'écran calcule le tableau (planTableau, classement d'entrée de la
 * vue : groupes, rapières, formule) ; le moteur reçoit le placement complet et le contrôle.
 * Fonction pure : identifiants, rangs de sortie de poules et exemptions conservés.
 * Licensed under GPL-3.0
 */
import type { Fencer } from '../../types';
import type { TableauMatch } from './tableauTypes';

export interface TableauMatchInput {
  matchId: string;
  round: number;
  position: number;
  fencerAId: string | null;
  fencerBId: string | null;
  isBye: boolean;
  seedA?: number | null;
  seedB?: number | null;
}

export type TableauCompositionError =
  'unknown_fencer' | 'duplicate_fencer' | 'duplicate_slot' | 'invalid_round';

export type TableauCompositionResult =
  | { ok: true; matches: TableauMatch[] }
  | { ok: false; code: TableauCompositionError; detail: string };

/** Tour valide : puissance de 2 (≥ 2) ou petite finale (3) */
const validRound = (r: number) => r === 3 || (r >= 2 && (r & (r - 1)) === 0);

/**
 * Matchs du tableau à partir du placement : tireurs connus, un tireur au plus une fois par
 * tour, une case (tour, position) par match. Exempt : vainqueur = le tireur présent.
 */
export function composeTableau(
  input: TableauMatchInput[],
  fencers: ReadonlyMap<string, Fencer>
): TableauCompositionResult {
  const slots = new Set<string>();
  const perRound = new Map<number, Set<string>>();
  const matches: TableauMatch[] = [];
  const fail = (code: TableauCompositionError, detail: string): TableauCompositionResult => ({
    ok: false,
    code,
    detail,
  });
  for (const m of input) {
    if (!validRound(m.round)) return fail('invalid_round', m.matchId);
    const slot = `${m.round}:${m.position}`;
    if (slots.has(slot)) return fail('duplicate_slot', slot);
    slots.add(slot);
    const seen = perRound.get(m.round) ?? new Set<string>();
    perRound.set(m.round, seen);
    const resolve = (id: string | null): Fencer | null | 'unknown' | 'duplicate' => {
      if (!id) return null;
      const f = fencers.get(id);
      if (!f) return 'unknown';
      if (seen.has(id)) return 'duplicate';
      seen.add(id);
      return f;
    };
    const a = resolve(m.fencerAId);
    const b = resolve(m.fencerBId);
    for (const [r, id] of [
      [a, m.fencerAId],
      [b, m.fencerBId],
    ] as const) {
      if (r === 'unknown') return fail('unknown_fencer', String(id));
      if (r === 'duplicate') return fail('duplicate_fencer', String(id));
    }
    const fencerA = a as Fencer | null;
    const fencerB = b as Fencer | null;
    matches.push({
      id: m.matchId,
      round: m.round,
      position: m.position,
      fencerA,
      fencerB,
      scoreA: null,
      scoreB: null,
      winner: m.isBye ? (fencerA ?? fencerB) : null,
      isBye: m.isBye,
      ...(m.seedA != null ? { seedA: m.seedA } : {}),
      ...(m.seedB != null ? { seedB: m.seedB } : {}),
    });
  }
  return { ok: true, matches };
}

/** Placement envoyé au moteur, depuis les matchs calculés par l'écran */
export function tableauComposition(matches: TableauMatch[]): TableauMatchInput[] {
  return matches.map(m => ({
    matchId: m.id,
    round: m.round,
    position: m.position,
    fencerAId: m.fencerA?.id ?? null,
    fencerBId: m.fencerB?.id ?? null,
    isBye: m.isBye,
    seedA: m.seedA ?? null,
    seedB: m.seedB ?? null,
  }));
}
