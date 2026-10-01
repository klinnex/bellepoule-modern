/**
 * BellePoule Modern - Journal de match (audit log)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { MatchEventEntry, MatchEventType } from '../../shared/types';
import { useMatchAuditStore } from '../../features/matchAuditLog/hooks/useMatchAuditStore';
import { useToast } from './Toast';
import { describeMatchEvent, exportMatchTimelineJSON } from '../../shared/utils/multiFormatExport';

/** Match sélectionnable dans le journal (vue compétition) */
export interface MatchAuditOption {
  id: string;
  label: string;
  /** Noms des arbitres assignés */
  referees: string[];
}

interface MatchAuditLogProps {
  matchId?: string;
  /** Matchs connus de la compétition (libellés + arbitres assignés) */
  matchOptions?: MatchAuditOption[];
  competitionId?: string;
  matchTitle?: string;
  competitionName?: string;
  onClose?: () => void;
}

const EVENT_TYPE_LABELS: Record<MatchEventType, string> = {
  score_change: 'Score',
  touch: 'Touche',
  card: 'Carton',
  arena_exit: 'Sortie',
};

const EVENT_TYPE_COLORS: Record<MatchEventType, string> = {
  score_change: '#8b5cf6',
  touch: '#3b82f6',
  card: '#ef4444',
  arena_exit: '#f59e0b',
};

const ALL_TYPES: MatchEventType[] = ['touch', 'card', 'arena_exit', 'score_change'];

function formatTimestamp(ts: string, baseTs: string | null): string {
  const d = new Date(ts);
  const abs = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (!baseTs) return abs;
  const diffMs = d.getTime() - new Date(baseTs).getTime();
  if (diffMs < 0) return abs;
  const s = Math.floor(diffMs / 1000) % 60;
  const m = Math.floor(diffMs / 60000);
  const rel = m > 0 ? `+${m}m${s.toString().padStart(2, '0')}s` : `+${s}s`;
  return `${abs} (${rel})`;
}

function fencerLabel(entry: MatchEventEntry): { label: string; color: string } {
  if (!entry.fencerSide) return { label: 'Match', color: '#6b7280' };
  const name = entry.fencerLastName ?? entry.fencerSide;
  return {
    label: `${entry.fencerSide} — ${name}`,
    color: entry.fencerSide === 'A' ? '#3b82f6' : '#ef4444',
  };
}

function buildRefereeLastActions(entries: MatchEventEntry[]): { key: string; label: string; entry: MatchEventEntry }[] {
  const map = new Map<string, { label: string; entry: MatchEventEntry }>();
  for (const e of entries) {
    if (e.eventType !== 'score_change') continue;
    const key = e.refereeName ?? e.changedBy ?? e.ipAddress ?? 'inconnu';
    map.set(key, { label: key, entry: e });
  }
  return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
}

function entryReferee(e: MatchEventEntry): string | null {
  return e.refereeName ?? e.changedBy ?? null;
}

/** Libellé de repli : noms des tireurs trouvés dans les événements */
function fallbackMatchLabel(matchId: string, entries: MatchEventEntry[]): string {
  const names: Partial<Record<'A' | 'B', string>> = {};
  for (const e of entries) {
    if (e.matchId === matchId && e.fencerSide && e.fencerLastName) names[e.fencerSide] ??= e.fencerLastName;
  }
  if (names.A || names.B) return `${names.A ?? '?'} vs ${names.B ?? '?'}`;
  return `Match ${matchId.slice(0, 8)}`;
}

const selectStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  fontSize: '0.8rem',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  maxWidth: '22rem',
};

const MatchAuditLogComponent: React.FC<MatchAuditLogProps> = ({
  matchId,
  matchOptions,
  competitionId,
  matchTitle,
  competitionName,
  onClose,
}) => {
  const { showToast } = useToast();
  const [refereeView, setRefereeView] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [selectedReferee, setSelectedReferee] = useState('');
  const competitionMode = !matchId && !!competitionId;
  const { entries, isLoading, error, filterTypes, loadMatchTimeline, loadCompetitionTimeline, setFilterTypes, reset } =
    useMatchAuditStore();

  useEffect(() => {
    if (matchId) {
      loadMatchTimeline(matchId);
    } else if (competitionId) {
      loadCompetitionTimeline(competitionId);
    }
    return () => { reset(); };
  }, [matchId, competitionId]);

  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error]);

  // Arbitres par match : assignés + auteurs des saisies de score
  const refereesByMatch = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (id: string, name: string | null) => {
      if (!name) return;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id)!.add(name);
    };
    for (const o of matchOptions ?? []) o.referees.forEach(r => add(o.id, r));
    for (const e of entries) if (e.eventType === 'score_change') add(e.matchId, entryReferee(e));
    return map;
  }, [entries, matchOptions]);

  const refereeNames = useMemo(() => {
    const ids = new Set(entries.map(e => e.matchId));
    const names = new Set<string>();
    for (const [id, refs] of refereesByMatch) if (ids.has(id)) refs.forEach(r => names.add(r));
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [entries, refereesByMatch]);

  // Matchs ayant des événements, dans l'ordre de la compétition
  const matchChoices = useMemo(() => {
    const order = new Map((matchOptions ?? []).map((o, i) => [o.id, i]));
    const labels = new Map((matchOptions ?? []).map(o => [o.id, o.label]));
    const ids = Array.from(new Set(entries.map(e => e.matchId)));
    return ids
      .filter(id => !selectedReferee || refereesByMatch.get(id)?.has(selectedReferee))
      .map(id => ({ id, label: labels.get(id) ?? fallbackMatchLabel(id, entries) }))
      .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.label.localeCompare(b.label, 'fr'));
  }, [entries, matchOptions, refereesByMatch, selectedReferee]);

  const matchLabelOf = useCallback(
    (id: string) => matchChoices.find(c => c.id === id)?.label ?? fallbackMatchLabel(id, entries),
    [matchChoices, entries]
  );

  // Match sélectionné invalidé par le filtre arbitre → retour à « tous »
  useEffect(() => {
    if (selectedMatchId && !matchChoices.some(c => c.id === selectedMatchId)) setSelectedMatchId('');
  }, [matchChoices, selectedMatchId]);

  const scopedEntries = useMemo(() => {
    if (!competitionMode) return entries;
    return entries.filter(e =>
      (!selectedMatchId || e.matchId === selectedMatchId) &&
      (!selectedReferee || refereesByMatch.get(e.matchId)?.has(selectedReferee))
    );
  }, [entries, competitionMode, selectedMatchId, selectedReferee, refereesByMatch]);

  const singleMatch = !!matchId || !!selectedMatchId;
  const showMatchColumn = competitionMode && !selectedMatchId;
  // Temps relatif seulement pertinent dans un même match
  const baseTs = singleMatch && scopedEntries.length > 0 ? scopedEntries[0].timestamp : null;
  const refereeLastActions = buildRefereeLastActions(scopedEntries);

  const zoneStats = useMemo(() => {
    type ZoneSide = { A: number; B: number; C: number };
    const stats: Record<'A' | 'B', ZoneSide> = { A: { A: 0, B: 0, C: 0 }, B: { A: 0, B: 0, C: 0 } };
    for (const e of scopedEntries) {
      if (e.eventType === 'touch' && e.zone && (e.fencerSide === 'A' || e.fencerSide === 'B')) {
        const z = e.zone as 'A' | 'B' | 'C';
        if (z === 'A' || z === 'B' || z === 'C') stats[e.fencerSide][z]++;
      }
    }
    const hasZones = Object.values(stats).some(s => s.A + s.B + s.C > 0);
    return hasZones ? stats : null;
  }, [scopedEntries]);

  const filtered =
    filterTypes.length === 0 ? scopedEntries : scopedEntries.filter(e => filterTypes.includes(e.eventType));

  const toggleType = useCallback(
    (t: MatchEventType) => {
      if (filterTypes.includes(t)) {
        setFilterTypes(filterTypes.filter(x => x !== t));
      } else {
        setFilterTypes([...filterTypes, t]);
      }
    },
    [filterTypes, setFilterTypes]
  );

  const handleExportJSON = useCallback(async () => {
    try {
      const title = matchTitle
        ?? (matchId ? `match_${matchId}` : selectedMatchId ? matchLabelOf(selectedMatchId) : `competition_${competitionId}`);
      const json = exportMatchTimelineJSON(scopedEntries, title, competitionName);
      const filename = `journal_${title.replace(/\s+/g, '_')}_${Date.now()}.json`;
      const result = await window.electronAPI.dialog.saveFile({
        defaultPath: filename,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result?.filePath) {
        await window.electronAPI.file.writeContent(result.filePath, json);
        showToast('Export JSON réussi', 'success');
      }
    } catch {
      showToast("Erreur lors de l'export", 'error');
    }
  }, [scopedEntries, matchTitle, matchId, selectedMatchId, matchLabelOf, competitionId, competitionName]);

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>

      {/* Heatmap zones Laser Sabre (visible quand matchId et données disponibles) */}
      {/* Sélection du match / de l'arbitre (vue compétition) */}
      {competitionMode && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            Arbitre :
            <select
              aria-label="Filtrer par arbitre"
              value={selectedReferee}
              onChange={e => setSelectedReferee(e.target.value)}
              style={selectStyle}
            >
              <option value="">Tous les arbitres</option>
              {refereeNames.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            Match :
            <select
              aria-label="Sélectionner un match"
              value={selectedMatchId}
              onChange={e => setSelectedMatchId(e.target.value)}
              style={selectStyle}
            >
              <option value="">Tous les matchs ({matchChoices.length})</option>
              {matchChoices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {singleMatch && zoneStats && (
        <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem', background: '#1e1b4b', borderRadius: '0.5rem', border: '1px solid #3730a3' }}>
          {(['A', 'B'] as const).map(side => {
            const s = zoneStats[side];
            const total = s.A + s.B + s.C;
            const ZONE_COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' };
            const ZONE_PTS: Record<string, string> = { A: '1pt', B: '3pt', C: '5pt' };
            return (
              <div key={side} style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: side === 'A' ? '#60a5fa' : '#f87171', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  Côté {side}
                </div>
                {(['A', 'B', 'C'] as const).map(z => {
                  const count = s[z];
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={z} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      <span style={{ width: '28px', fontSize: '0.72rem', color: ZONE_COLORS[z], fontWeight: 700 }}>
                        {z} <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{ZONE_PTS[z]}</span>
                      </span>
                      <div style={{ flex: 1, height: '8px', background: '#312e81', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: ZONE_COLORS[z], borderRadius: '4px', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ width: '20px', fontSize: '0.72rem', color: '#c7d2fe', textAlign: 'right' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: '#6b7280', marginRight: '0.25rem' }}>Filtrer :</span>
        {ALL_TYPES.map(t => {
          const active = filterTypes.length === 0 || filterTypes.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              style={{
                padding: '0.2rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                borderRadius: '999px',
                border: `1px solid ${EVENT_TYPE_COLORS[t]}`,
                background: active ? EVENT_TYPE_COLORS[t] : 'transparent',
                color: active ? 'white' : EVENT_TYPE_COLORS[t],
                cursor: 'pointer',
              }}
            >
              {EVENT_TYPE_LABELS[t]}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#9ca3af' }}>
          {filtered.length} événement{filtered.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setRefereeView(v => !v)}
          style={{
            padding: '0.3rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: '600',
            borderRadius: '6px',
            border: '1px solid #8b5cf6',
            background: refereeView ? '#8b5cf6' : 'transparent',
            color: refereeView ? 'white' : '#8b5cf6',
            cursor: 'pointer',
          }}
        >
          Par arbitre
        </button>
        <button
          onClick={handleExportJSON}
          disabled={scopedEntries.length === 0}
          style={{
            padding: '0.3rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: '600',
            borderRadius: '6px',
            border: '1px solid #374151',
            background: scopedEntries.length === 0 ? '#f3f4f6' : '#1f2937',
            color: scopedEntries.length === 0 ? '#9ca3af' : 'white',
            cursor: scopedEntries.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Export JSON
        </button>
      </div>

      {/* Tableau */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Chargement…</div>
        ) : refereeView ? (
          refereeLastActions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', fontSize: '0.875rem' }}>
              Aucune saisie de score enregistrée.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>Arbitre</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>IP</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>Dernière saisie</th>
                  {showMatchColumn && <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>Match</th>}
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {refereeLastActions.map(({ key, label, entry }, i) => (
                  <tr key={key} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: '#1f2937' }}>{label}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>{entry.ipAddress ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {formatTimestamp(entry.timestamp, baseTs)}
                    </td>
                    {showMatchColumn && <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>{matchLabelOf(entry.matchId)}</td>}
                    <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>{describeMatchEvent(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', fontSize: '0.875rem' }}>
            {competitionMode && !selectedMatchId
              ? 'Aucun événement enregistré.'
              : 'Aucun événement enregistré pour ce match.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  Heure
                </th>
                {showMatchColumn && (
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>
                    Match
                  </th>
                )}
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>
                  Type
                </th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>
                  Tireur
                </th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '600', color: '#6b7280' }}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => {
                const { label, color } = fencerLabel(entry);
                return (
                  <tr
                    key={entry.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      background: i % 2 === 0 ? 'white' : '#fafafa',
                    }}
                  >
                    <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {formatTimestamp(entry.timestamp, baseTs)}
                    </td>
                    {showMatchColumn && (
                      <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedMatchId(entry.matchId)}
                          title="Afficher uniquement ce match"
                          style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', textAlign: 'left', fontSize: 'inherit' }}
                        >
                          {matchLabelOf(entry.matchId)}
                        </button>
                      </td>
                    )}
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.1rem 0.45rem',
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          background: `${EVENT_TYPE_COLORS[entry.eventType]}20`,
                          color: EVENT_TYPE_COLORS[entry.eventType],
                          border: `1px solid ${EVENT_TYPE_COLORS[entry.eventType]}40`,
                        }}
                      >
                        {EVENT_TYPE_LABELS[entry.eventType]}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color }}>
                      {label}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>
                      {describeMatchEvent(entry)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // Rendu inline (sans onClose = panel dans une page)
  if (!onClose) {
    return (
      <div style={{ padding: '1rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>
          {competitionMode ? 'Journal des matchs' : 'Journal du match'}
        </h3>
        {content}
      </div>
    );
  }

  // Rendu modal — portail sur body pour échapper aux ancêtres transformés
  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 1000 }}
    >
      <div
        className="modal modal--xl"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
            Journal du match{matchTitle ? ` — ${matchTitle}` : ''}
          </h2>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>
        {content}
      </div>
    </div>,
    document.body
  );
};

export const MatchAuditLog = memo(MatchAuditLogComponent);
export default MatchAuditLog;
