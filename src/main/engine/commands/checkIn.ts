/**
 * BellePoule Modern - Pointage des tireurs (#1981, opération pilote du contrat d'API)
 * Par identifiant ou numéro de dossard ; statuts de résultat (abandon, exclusion, forfait…)
 * laissés tels quels. Partagé par l'écran (IPC) et l'agent (MCP check_in).
 * Licensed under GPL-3.0
 */
import { FencerStatus, type Fencer } from '../../../shared/types';
import type { CommandContext } from './context';
import { getCompetitionOrThrow } from './competitions';
import { EVENT, recordEvents } from './eventLog';
import { canToggleCheckIn } from '../../../shared/domain/fencers/fencerStatus';

export interface CheckInInput {
  competitionId: string;
  fencers: Array<string | number>;
  present: boolean;
  dryRun?: boolean;
}

export function checkInFencers(ctx: CommandContext, input: CheckInInput) {
  const competition = getCompetitionOrThrow(ctx, input.competitionId);
  const status = input.present ? FencerStatus.CHECKED_IN : FencerStatus.NOT_CHECKED_IN;
  const all = ctx.db.getFencersByCompetition(competition.id);
  const found: Fencer[] = [];
  const unknown: Array<string | number> = [];
  for (const ref of input.fencers.slice(0, 1000)) {
    const f = all.find(x => x.id === ref || (typeof ref === 'number' && x.ref === ref));
    if (f) found.push(f);
    else unknown.push(ref);
  }
  // Règle unique écran / moteur (#1980) : statuts spéciaux non pointables
  const changeable = found.filter(canToggleCheckIn);
  const toUpdate = changeable.filter(f => f.status !== status);
  const report = {
    status,
    matched: found.length,
    updated: toUpdate.length,
    skipped: found.length - changeable.length,
    unknown,
  };
  if (input.dryRun) return { dryRun: true, ...report };
  const write = () => {
    for (const f of toUpdate) ctx.db.updateFencer(f.id, { status });
    recordEvents(
      ctx,
      competition.id,
      toUpdate.map(f => ({
        type: input.present ? EVENT.fencerCheckedIn : EVENT.fencerCheckedOut,
        payload: { fencerId: f.id },
      }))
    );
  };
  if (toUpdate.length) {
    if (typeof ctx.db.transaction === 'function') ctx.db.transaction(write);
    else write();
  }
  if (report.updated > 0) ctx.emitChange?.({ scope: 'fencers', competitionIds: [competition.id] });
  return { dryRun: false, ...report };
}
