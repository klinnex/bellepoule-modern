/**
 * BellePoule Modern - Pages HTML générées par le serveur distant
 * (extraites de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

/**
 * Page publique des résultats de poules (/competition/:id/results), rafraîchie
 * toutes les 5 s. competitionId validé en amont ([A-Za-z0-9_-]{1,64}, #997).
 */
export function renderCompetitionResultsPage(competitionId: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Résultats – BellePoule</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 1rem; }
    header { text-align: center; padding: 1.5rem 0 1rem; }
    header h1 { font-size: 1.5rem; color: #f8fafc; }
    header p { color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem; }
    .pool { background: #1e293b; border-radius: 10px; margin: 1rem 0; overflow: hidden; }
    .pool-title { background: #3b82f6; color: white; padding: 0.6rem 1rem; font-weight: 600; font-size: 0.95rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: #0f172a; color: #94a3b8; padding: 0.5rem 0.75rem; text-align: left; font-weight: 500; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #334155; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
    .rank { color: #94a3b8; width: 2rem; }
    .name { font-weight: 600; }
    .club { color: #94a3b8; font-size: 0.8rem; }
    .num { text-align: center; }
    .pos { color: #4ade80; }
    .neg { color: #f87171; }
    .loading { text-align: center; padding: 3rem; color: #94a3b8; }
    .error { background: #450a0a; color: #fca5a5; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .refresh { position: fixed; bottom: 1rem; right: 1rem; background: #3b82f6; color: white;
      border: none; border-radius: 50%; width: 3rem; height: 3rem; font-size: 1.2rem;
      cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
  </style>
</head>
<body>
  <div id="app"><div class="loading">Chargement des résultats…</div></div>
  <button class="refresh" id="refresh-btn" title="Actualiser">↻</button>
  <script>
    const competitionId = ${JSON.stringify(competitionId).replace(/</g, '\\u003c')};
    async function load() {
      try {
        const r = await fetch('/api/competitions/' + competitionId + '/results-data');
        if (!r.ok) throw new Error('Compétition introuvable');
        const data = await r.json();
        render(data);
      } catch(e) {
        const errEl = document.getElementById('app'); errEl.textContent = ''; const errDiv = document.createElement('div'); errDiv.className = 'error'; errDiv.textContent = 'Erreur : ' + e.message; errEl.appendChild(errDiv);
      }
    }
    function render(data) {
      const dateStr = data.competition.date
        ? new Date(data.competition.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        : '';
      let html = '<header><h1>' + escHtml(data.competition.title) + '</h1>' +
        (dateStr ? '<p>' + dateStr + '</p>' : '') + '</header>';
      if (!data.pools || data.pools.length === 0) {
        html += '<p style="text-align:center;color:#94a3b8;padding:2rem">Aucune poule disponible</p>';
      } else {
        for (const pool of data.pools) {
          html += '<div class="pool"><div class="pool-title">' + escHtml(pool.name) + '</div><table>' +
            '<thead><tr><th class="rank">#</th><th>Tireur</th>' +
            '<th class="num">V</th><th class="num">TD</th><th class="num">TR</th><th class="num">Ind.</th></tr></thead><tbody>';
          pool.rankings.forEach((f, i) => {
            const ind = f.index >= 0 ? '+' + f.index : '' + f.index;
            const cls = f.index > 0 ? 'pos' : f.index < 0 ? 'neg' : '';
            html += '<tr><td class="rank">' + (i+1) + '</td>' +
              '<td><span class="name">' + escHtml(f.lastName.toUpperCase()) + ' ' + escHtml(f.firstName) + '</span>' +
              (f.club ? ' <span class="club">(' + escHtml(f.club) + ')</span>' : '') + '</td>' +
              '<td class="num">' + f.victories + '</td>' +
              '<td class="num">' + f.touchesFor + '</td>' +
              '<td class="num">' + f.touchesAgainst + '</td>' +
              '<td class="num ' + cls + '">' + ind + '</td></tr>';
          });
          html += '</tbody></table></div>';
        }
      }
      document.getElementById('app').innerHTML = html;
    }
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    load();
    document.getElementById('refresh-btn').addEventListener('click', load);
    setInterval(load, 30000);
  </script>
</body>
</html>`;
}

/**
 * Journal du match en cours sur une piste (/areneN/journal).
 * arenaNum validé en amont (chiffres uniquement, #997).
 */
export function renderArenaJournalPage(arenaNum: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Journal – Piste ${arenaNum}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 1rem; font-size: 14px; }
    header { text-align: center; padding: 0.75rem 0 1rem; }
    header h1 { font-size: 1.1rem; color: #f8fafc; }
    #match-info { color: #94a3b8; font-size: 0.8rem; margin-top: 0.25rem; }
    #status { text-align: center; color: #94a3b8; padding: 2rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { background: #1e293b; color: #94a3b8; padding: 0.45rem 0.6rem; text-align: left; font-weight: 600; position: sticky; top: 0; }
    td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #1e293b; }
    tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
    .badge { padding: 0.1rem 0.4rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; }
    .badge-score_change { background: #4c1d95; color: #c4b5fd; }
    .badge-touch { background: #1e3a5f; color: #93c5fd; }
    .badge-card { background: #450a0a; color: #fca5a5; }
    .badge-arena_exit { background: #451a03; color: #fcd34d; }
    .side-a { color: #60a5fa; font-weight: 600; }
    .side-b { color: #f87171; font-weight: 600; }
    .ts { font-family: monospace; color: #64748b; white-space: nowrap; }
    #last-update { position: fixed; bottom: 0.5rem; right: 0.75rem; font-size: 0.7rem; color: #475569; }
  </style>
</head>
<body>
  <header>
    <h1>Journal — Piste ${arenaNum}</h1>
    <div id="match-info">Chargement…</div>
  </header>
  <div id="status"></div>
  <table id="log-table" style="display:none">
    <thead><tr><th>Heure</th><th>Type</th><th>Tireur</th><th>Description</th></tr></thead>
    <tbody id="log-body"></tbody>
  </table>
  <div id="last-update"></div>
  <script>
    const arenaId = 'arena${arenaNum}';
    let baseTs = null;

    function describeEvent(e) {
      switch (e.eventType) {
        case 'touch': return 'Zone ' + (e.zone || '?') + ' — ' + (e.points || 0) + ' pt(s)';
        case 'card': return 'Carton ' + (e.cardType || '') + ' — ' + (e.cardReason || '') + (e.resultingExclusion ? ' (exclusion)' : '');
        case 'arena_exit': return (e.exitType === 'arena_exit_voluntary' ? 'Sortie volontaire' : "Sortie d'arène") + ' — +' + (e.points || 0) + ' pts adv.';
        case 'score_change': {
          const pA = e.previousScoreA && e.previousScoreA.value != null ? e.previousScoreA.value : '?';
          const pB = e.previousScoreB && e.previousScoreB.value != null ? e.previousScoreB.value : '?';
          const nA = e.newScoreA && e.newScoreA.value != null ? e.newScoreA.value : '?';
          const nB = e.newScoreB && e.newScoreB.value != null ? e.newScoreB.value : '?';
          return pA + '/' + pB + ' → ' + nA + '/' + nB + ' (' + (e.refereeName || e.changedBy || '?') + ')';
        }
        default: return '';
      }
    }

    function formatTs(ts) {
      const d = new Date(ts);
      const abs = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (!baseTs) return abs;
      const diff = d.getTime() - new Date(baseTs).getTime();
      if (diff < 0) return abs;
      const s = Math.floor(diff / 1000) % 60;
      const m = Math.floor(diff / 60000);
      return abs + ' (+' + (m > 0 ? m + 'm' : '') + String(s).padStart(2,'0') + 's)';
    }

    async function refresh() {
      try {
        const r = await fetch('/api/arena/' + arenaId + '/current-match/events');
        const data = await r.json();
        const info = document.getElementById('match-info');
        const status = document.getElementById('status');
        const table = document.getElementById('log-table');
        const body = document.getElementById('log-body');

        if (!data.matchId || data.events.length === 0) {
          info.textContent = 'Aucun match en cours';
          status.textContent = data.matchId ? 'Aucun événement enregistré.' : '';
          table.style.display = 'none';
          baseTs = null;
          return;
        }

        baseTs = data.events[0].timestamp;
        info.textContent = 'Match en cours · ' + data.events.length + ' événement(s)';
        status.textContent = '';
        table.style.display = '';

        body.innerHTML = data.events.map(e => {
          const side = e.fencerSide ? ('<span class="side-' + e.fencerSide.toLowerCase() + '">' + e.fencerSide + ' — ' + (e.fencerLastName || '') + '</span>') : '<span style="color:#6b7280">Match</span>';
          return '<tr><td class="ts">' + formatTs(e.timestamp) + '</td><td><span class="badge badge-' + e.eventType + '">' + e.eventType + '</span></td><td>' + side + '</td><td>' + describeEvent(e) + '</td></tr>';
        }).reverse().join('');

        document.getElementById('last-update').textContent = 'MàJ ' + new Date().toLocaleTimeString('fr-FR');
      } catch(err) {
        document.getElementById('status').textContent = 'Erreur de connexion';
      }
    }

    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}
