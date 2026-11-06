import { v4 as uuidv4 } from 'uuid';
import type { SqlExecutor } from './sqlExecutor';

export interface FencerSignature {
  fencerId: string;
  signatureData: string;
}

/** Signatures des feuilles de poule et des matchs de tableau. */
export class SignatureRepo {
  constructor(private readonly sql: SqlExecutor) {}

  savePool(poolId: string, fencerId: string, signatureData: string): void {
    this.sql.run(
      `INSERT INTO pool_signatures (id, pool_id, fencer_id, signature_data, signed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(pool_id, fencer_id) DO UPDATE SET signature_data = excluded.signature_data, signed_at = excluded.signed_at`,
      [uuidv4(), poolId, fencerId, signatureData, new Date().toISOString()]
    );
  }

  getPool(poolId: string): FencerSignature[] {
    return this.sql
      .queryAll<{ fencer_id: string; signature_data: string }>(
        `SELECT fencer_id, signature_data FROM pool_signatures WHERE pool_id = ?`,
        [poolId]
      )
      .map(row => ({ fencerId: row.fencer_id, signatureData: row.signature_data }));
  }

  saveDEMatch(matchId: string, fencerId: string, signatureData: string): void {
    this.sql.run(
      `INSERT INTO de_match_signatures (id, match_id, fencer_id, signature_data, signed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(match_id, fencer_id) DO UPDATE SET signature_data = excluded.signature_data, signed_at = excluded.signed_at`,
      [uuidv4(), matchId, fencerId, signatureData, new Date().toISOString()]
    );
  }

  getDEMatch(matchId: string): FencerSignature[] {
    return this.sql
      .queryAll<{ fencer_id: string; signature_data: string }>(
        `SELECT fencer_id, signature_data FROM de_match_signatures WHERE match_id = ?`,
        [matchId]
      )
      .map(row => ({ fencerId: row.fencer_id, signatureData: row.signature_data }));
  }

  /** Signatures de tableau pour un ensemble de matchs (pour export PDF). */
  getDEMatchesByIds(
    matchIds: string[]
  ): { matchId: string; fencerId: string; signatureData: string }[] {
    if (matchIds.length === 0) return [];
    const placeholders = matchIds.map(() => '?').join(',');
    return this.sql
      .queryAll<{ match_id: string; fencer_id: string; signature_data: string }>(
        `SELECT match_id, fencer_id, signature_data FROM de_match_signatures WHERE match_id IN (${placeholders})`,
        matchIds
      )
      .map(row => ({
        matchId: row.match_id,
        fencerId: row.fencer_id,
        signatureData: row.signature_data,
      }));
  }
}
