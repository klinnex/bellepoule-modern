/**
 * BellePoule Modern - Résolution des arbitres de la session distante (#1240)
 * Fonctions pures : la session et la base restent dans le serveur (contexte injecté).
 * Licensed under GPL-3.0
 */
import type { RemoteSession } from '../../shared/types/remote';

export interface ResolvedReferee {
  id: string;
  name: string;
}

export interface RefereeResolverContext {
  getSession(): RemoteSession | null;
  /** Liste des arbitres de la session, rafraîchie depuis la base. */
  getSessionReferees(): RemoteSession['referees'];
  getSessionState(competitionId: string): any;
}

/** Nom d'un arbitre : session d'abord, sinon les champs du payload. */
function refereeName(ctx: RefereeResolverContext, r: any): string {
  return (
    resolveReferee(ctx, r.id)?.name ??
    ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.name || '')
  );
}

/** id = arbitre principal ; name = tous les arbitres, séparés par « / ». */
function joinReferees(ctx: RefereeResolverContext, refs: any[]): ResolvedReferee {
  const names = refs.map(r => refereeName(ctx, r));
  return { id: refs[0].id, name: names.filter(Boolean).join(' / ') };
}

export function resolveReferee(
  ctx: RefereeResolverContext,
  refereeId?: string | null
): ResolvedReferee | null {
  const session = ctx.getSession();
  if (!refereeId || !session) return null;
  const ref =
    (session.referees ?? []).find(r => r.id === refereeId) ??
    ctx.getSessionReferees().find(r => r.id === refereeId);
  return ref ? { id: ref.id, name: ref.name } : null;
}

/** Arbitre(s) assigné(s) à la poule (session_state), pour pré-remplir la tablette (#908). */
export function resolvePoolReferee(
  ctx: RefereeResolverContext,
  poolId?: string | null
): ResolvedReferee | null {
  const session = ctx.getSession();
  if (!poolId || !session) return null;
  try {
    const state = ctx.getSessionState(session.competitionId);
    const pool = (state?.pools || []).find((p: any) => p?.id === poolId);
    const refs: any[] = Array.isArray(pool?.referees)
      ? pool.referees.filter((r: any) => r?.id)
      : [];
    return refs.length === 0 ? null : joinReferees(ctx, refs);
  } catch {
    return null;
  }
}

/**
 * Arbitres multiples d'un match de tableau (session_state, mode expert, #908).
 * Ne renvoie qu'avec ≥ 2 arbitres ; sinon le refereeId du match suffit.
 */
export function resolveTableauMatchReferees(
  ctx: RefereeResolverContext,
  matchId?: string | null
): ResolvedReferee | null {
  const session = ctx.getSession();
  if (!matchId || !session) return null;
  try {
    const state = ctx.getSessionState(session.competitionId);
    const all: any[] = [
      ...(Array.isArray(state?.tableauMatches) ? state.tableauMatches : []),
      ...(Array.isArray(state?.consolationBrackets)
        ? state.consolationBrackets.flatMap((b: any) =>
            Array.isArray(b?.matches) ? b.matches : []
          )
        : []),
    ];
    const m = all.find((x: any) => x?.id === matchId);
    const refs: any[] = Array.isArray(m?.referees) ? m.referees.filter((r: any) => r?.id) : [];
    return refs.length < 2 ? null : joinReferees(ctx, refs);
  } catch {
    return null;
  }
}

/** Arbitre(s) d'un match de tableau envoyé par l'appli (referees mode expert, sinon referee) (#977). */
export function resolveDeMatchReferee(ctx: RefereeResolverContext, m: any): ResolvedReferee | null {
  const refs: any[] = Array.isArray(m?.referees) ? m.referees.filter((r: any) => r?.id) : [];
  if (refs.length === 0 && m?.referee?.id) refs.push(m.referee);
  if (refs.length === 0) return resolveReferee(ctx, m?.refereeId);
  return joinReferees(ctx, refs);
}
