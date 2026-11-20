/**
 * BellePoule Modern - Table des pistes Cyrano en base, par compétition (#1829)
 * Remplace le stockage localStorage : la table est rattachée à la compétition.
 * `config` est la configuration de piste telle que l'interface la produit (JSON opaque).
 * Licensed under GPL-3.0
 */
import type { SqlExecutor } from './sqlExecutor';
import type { SqlRow } from './rowMappers';

export interface CyranoPisteRow {
  piste: string;
  config: Record<string, unknown>;
}

export class CyranoRepo {
  constructor(private readonly sql: SqlExecutor) {}

  /** Pistes d'une compétition, dans l'ordre enregistré */
  public getCyranoPistes(competitionId: string): CyranoPisteRow[] {
    if (!this.sql.db || !competitionId) return [];
    const rows = this.sql.queryAll<SqlRow>(
      'SELECT piste, config FROM cyrano_pistes WHERE competition_id = ? ORDER BY position',
      [competitionId]
    );
    const out: CyranoPisteRow[] = [];
    for (const row of rows) {
      try {
        const config = JSON.parse(String(row.config ?? '{}')) as Record<string, unknown>;
        out.push({ piste: String(row.piste), config });
      } catch {
        /* configuration illisible : ignorée */
      }
    }
    return out;
  }

  /** Remplace la liste des pistes d'une compétition (transaction) */
  public replaceCyranoPistes(competitionId: string, pistes: CyranoPisteRow[]): void {
    if (!this.sql.db || !competitionId) return;
    this.sql.transaction(() => {
      this.sql.run('DELETE FROM cyrano_pistes WHERE competition_id = ?', [competitionId]);
      pistes.forEach((p, position) => {
        this.sql.run(
          'INSERT INTO cyrano_pistes (competition_id, piste, position, config) VALUES (?, ?, ?, ?)',
          [competitionId, p.piste, position, JSON.stringify(p.config)]
        );
      });
    });
  }
}
