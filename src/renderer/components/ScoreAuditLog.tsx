/**
 * BellePoule Modern - Historique des scores par poules
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { ScoreAuditEntry, ScoreIpConflict } from '../../shared/types/preload';
import { useToast } from './Toast';
import { useTranslation } from '../hooks/useTranslation';
import { getRoundName } from '../../shared/utils/tableCalculations';

interface Props {
  competitionId: string;
}

function formatScore(score: any): string {
  if (!score) return '—';
  const v = score.value ?? '?';
  if (score.isAbstention) return `${v} (Ab.)`;
  if (score.isExclusion) return `${v} (Excl.)`;
  if (score.isForfait) return `${v} (FF)`;
  return String(v);
}

type SortMode = 'time' | 'pool' | 'match' | 'referee';

const TABLEAU_FILTER = 'tableau';

function isTableauEntry(e: ScoreAuditEntry): boolean {
  return e.poolNumber == null && e.tableauRound != null;
}

function phaseLabel(e: ScoreAuditEntry): string {
  if (e.poolNumber != null) return `Poule ${e.poolNumber}`;
  if (e.tableauRound != null) return getRoundName(e.tableauRound);
  return '—';
}

function matchLabel(e: ScoreAuditEntry): string {
  if (isTableauEntry(e)) return e.tableauPosition != null ? `Match ${e.tableauPosition + 1}` : '—';
  return e.matchNumber != null ? `Match ${e.matchNumber}` : '—';
}

function refereeOf(e: ScoreAuditEntry): string {
  return e.refereeName ?? e.changedBy ?? '';
}

// Poules d'abord (par numéro), puis tableau du premier tour à la finale
function phaseKey(e: ScoreAuditEntry): number {
  if (e.poolNumber != null) return e.poolNumber;
  if (e.tableauRound != null) return 100000 - e.tableauRound;
  return Number.MAX_SAFE_INTEGER;
}

function matchKey(e: ScoreAuditEntry): number {
  return (isTableauEntry(e) ? e.tableauPosition : e.matchNumber) ?? Number.MAX_SAFE_INTEGER;
}

const byTimeDesc = (a: ScoreAuditEntry, b: ScoreAuditEntry) =>
  b.changedAt.localeCompare(a.changedAt);

const SORTERS: Record<SortMode, (a: ScoreAuditEntry, b: ScoreAuditEntry) => number> = {
  time: byTimeDesc,
  pool: (a, b) => phaseKey(a) - phaseKey(b) || matchKey(a) - matchKey(b) || byTimeDesc(a, b),
  match: (a, b) => matchKey(a) - matchKey(b) || phaseKey(a) - phaseKey(b) || byTimeDesc(a, b),
  referee: (a, b) => refereeOf(a).localeCompare(refereeOf(b), 'fr') || byTimeDesc(a, b),
};

const ScoreAuditLog_: React.FC<Props> = ({ competitionId }) => {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ScoreAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterPool, setFilterPool] = useState('');
  const [filterReferee, setFilterReferee] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('time');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.db.getScoreAuditLogByCompetition(competitionId);
      setEntries(data);
    } catch {
      showToast('Erreur chargement historique', 'error');
    } finally {
      setLoading(false);
    }
  }, [competitionId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Écoute des alertes de conflit IP
  useEffect(() => {
    const unsub = window.electronAPI.onScoreIpConflict((conflict: ScoreIpConflict) => {
      const msg = `⚠️ Conflit IP — Poule ${conflict.poolNumber ?? '?'} Match ${conflict.matchNumber ?? '?'} : ${conflict.attemptReferee} (${conflict.attemptIp}) tente de modifier un score saisi par ${conflict.originalReferee ?? 'inconnu'} (${conflict.originalIp})`;
      showToast(msg, 'error');
      load();
    });
    return unsub;
  }, [load, showToast]);

  const poolNumbers = Array.from(
    new Set(entries.map(e => e.poolNumber).filter(n => n != null))
  ).sort((a, b) => (a as number) - (b as number));

  const hasTableau = entries.some(isTableauEntry);

  const filtered = useMemo(
    () =>
      entries
        .filter(e => {
          if (filterPool === TABLEAU_FILTER) {
            if (!isTableauEntry(e)) return false;
          } else if (filterPool && String(e.poolNumber) !== filterPool) {
            return false;
          }
          if (filterReferee) {
            if (!refereeOf(e).toLowerCase().includes(filterReferee.toLowerCase())) return false;
          }
          return true;
        })
        .sort(SORTERS[sortMode]),
    [entries, filterPool, filterReferee, sortMode]
  );

  const exportCsv = useCallback(async () => {
    const header =
      'timestamp_iso,phase,match,score_avant_a,score_avant_b,score_apres_a,score_apres_b,arbitre,ip,source\n';
    const rows = filtered.map(e => {
      const cols = [
        new Date(e.changedAt).toISOString(),
        phaseLabel(e) === '—' ? '' : phaseLabel(e),
        matchLabel(e) === '—' ? '' : matchLabel(e),
        e.previousScoreA != null ? String(e.previousScoreA.value ?? '') : '',
        e.previousScoreB != null ? String(e.previousScoreB.value ?? '') : '',
        String(e.newScoreA?.value ?? ''),
        String(e.newScoreB?.value ?? ''),
        (e.refereeName ?? e.changedBy ?? '').replace(/,/g, ';'),
        (e.ipAddress ?? '').replace(/,/g, ';'),
        e.changedBy ?? '',
      ];
      return cols.join(',');
    });
    const csv = header + rows.join('\n');
    try {
      const result = await window.electronAPI.dialog.saveFile({
        title: t('dialogs.exportScoreHistory'),
        defaultPath: `historique_scores_${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV / TXT', extensions: ['csv', 'txt'] }],
      });
      if (result && !result.canceled && result.filePath) {
        await window.electronAPI.file.writeContent(result.filePath, csv);
        showToast('Fichier exporté', 'success');
      }
    } catch {
      showToast('Erreur export', 'error');
    }
  }, [filtered, showToast]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '100%', overflowX: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
          📜 Historique des scores
        </h2>

        <select
          value={filterPool}
          onChange={e => setFilterPool(e.target.value)}
          style={{ padding: '0.3rem 0.6rem', borderRadius: 4, border: '1px solid #D1D5DB' }}
        >
          <option value="">Toutes les phases</option>
          {poolNumbers.map(n => (
            <option key={n} value={String(n)}>
              Poule {n}
            </option>
          ))}
          {hasTableau && <option value={TABLEAU_FILTER}>Tableau</option>}
        </select>

        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as SortMode)}
          aria-label="Trier l'historique"
          style={{ padding: '0.3rem 0.6rem', borderRadius: 4, border: '1px solid #D1D5DB' }}
        >
          <option value="time">Tri : par heure</option>
          <option value="pool">Tri : par poule / tour</option>
          <option value="match">Tri : par ordre des matchs</option>
          <option value="referee">Tri : par arbitre</option>
        </select>

        <input
          type="text"
          placeholder="Filtrer arbitre…"
          value={filterReferee}
          onChange={e => setFilterReferee(e.target.value)}
          style={{
            padding: '0.3rem 0.6rem',
            borderRadius: 4,
            border: '1px solid #D1D5DB',
            minWidth: 140,
          }}
        />

        <button className="btn btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
          ⬇ Export CSV
        </button>

        <button
          className="btn btn-secondary"
          onClick={load}
          disabled={loading}
          style={{ marginLeft: 'auto' }}
        >
          {loading ? '…' : '↻ Actualiser'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#6B7280', padding: '3rem' }}>
          {loading ? 'Chargement…' : 'Aucune entrée dans le journal.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
              <th style={th}>Horodatage</th>
              <th style={th}>Poule / Tour</th>
              <th style={th}>Match</th>
              <th style={th}>Avant</th>
              <th style={th}>Après</th>
              <th style={th}>Arbitre</th>
              <th style={th}>IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={td}>{new Date(e.changedAt).toLocaleString()}</td>
                <td style={td}>{phaseLabel(e)}</td>
                <td style={td}>{matchLabel(e)}</td>
                <td style={td}>
                  {e.previousScoreA != null
                    ? `${formatScore(e.previousScoreA)} / ${formatScore(e.previousScoreB)}`
                    : '—'}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>
                  {formatScore(e.newScoreA)} / {formatScore(e.newScoreB)}
                </td>
                <td style={td}>{e.refereeName ?? e.changedBy ?? '—'}</td>
                <td style={{ ...td, fontFamily: 'monospace', color: '#6B7280' }}>
                  {e.ipAddress ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '0.75rem', color: '#9CA3AF', fontSize: '0.75rem' }}>
        {filtered.length} entrée{filtered.length !== 1 ? 's' : ''}
        {entries.length !== filtered.length ? ` (${entries.length} au total)` : ''}
      </div>
    </div>
  );
};

const th: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  whiteSpace: 'nowrap',
};

export const ScoreAuditLog = memo(ScoreAuditLog_);
