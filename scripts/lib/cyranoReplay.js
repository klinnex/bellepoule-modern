/**
 * Rejeu d'un journal de trames Cyrano exporté par le panneau (#2001) : analyse du texte
 * (`formatCyranoLog`, src/renderer/components/remote/cyranoSettings.ts) et calendrier d'envoi des
 * trames `IN` (appareil → logiciel). Fonctions pures, utilisées par scripts/cyrano-simulator.js
 * (`--replay`).
 *
 * Format : une trame par ligne,
 *   horodatage ISO <TAB> IN|OUT <TAB> ip:port <TAB> piste (ou -) <TAB> trame [<TAB> rejet]
 * Licensed under GPL-3.0
 */

/**
 * Analyse le journal exporté. Lignes vides ou illisibles ignorées et comptées (`skipped`).
 * @param {string} text
 * @returns {{entries: Array<{ts: number, dir: 'in'|'out', addr: string, piste: string|null,
 *   raw: string, rejected: string|null}>, skipped: number}}
 */
function parseCyranoLog(text) {
  const entries = [];
  let skipped = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const ts = Date.parse(cols[0]);
    const dir = cols[1] === 'IN' ? 'in' : cols[1] === 'OUT' ? 'out' : null;
    if (cols.length < 5 || Number.isNaN(ts) || !dir || !cols[4]) {
      skipped++;
      continue;
    }
    entries.push({
      ts,
      dir,
      addr: cols[2],
      piste: cols[3] === '-' ? null : cols[3],
      raw: cols[4],
      rejected: cols[5] || null,
    });
  }
  return { entries, skipped };
}

/** Pistes présentes parmi les trames `IN` du journal (ordre d'apparition). */
function replayPistes(entries) {
  return [...new Set(entries.filter(e => e.dir === 'in' && e.piste).map(e => e.piste))];
}

/**
 * Trames à rejouer : `IN` seulement (appareil → logiciel), de la piste demandée si elle est
 * donnée ; les trames illisibles (`malformed`) sont écartées.
 */
function selectReplayFrames(entries, piste) {
  return entries.filter(
    e => e.dir === 'in' && e.rejected !== 'malformed' && (piste == null || e.piste === String(piste))
  );
}

/**
 * Calendrier d'envoi : attente avant chaque trame, intervalle d'origine divisé par `speed`
 * (la première part tout de suite). `speed` doit être un nombre strictement positif.
 * @returns {Array<{delayMs: number, raw: string}>}
 */
function replaySchedule(frames, speed = 1) {
  if (!(speed > 0)) throw new Error(`vitesse invalide : ${speed}`);
  return frames.map((f, i) => ({
    delayMs: i === 0 ? 0 : Math.max(0, (f.ts - frames[i - 1].ts) / speed),
    raw: f.raw,
  }));
}

module.exports = { parseCyranoLog, replayPistes, selectReplayFrames, replaySchedule };
