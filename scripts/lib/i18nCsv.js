/**
 * Conversion locales JSON ↔ CSV pour les traducteurs (#1079).
 * CSV : séparateur virgule, guillemets doublés, UTF-8 avec BOM (ouverture
 * directe dans Excel / LibreOffice). Colonnes : key, fr, <langue>.
 */

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}

function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(reference, target, lang) {
  const ref = flatten(reference);
  const tgt = flatten(target);
  const rows = [['key', 'fr', lang]];
  for (const key of Object.keys(ref)) rows.push([key, ref[key], tgt[key] ?? '']);
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Parseur CSV RFC 4180 (guillemets, retours à la ligne dans les cellules). */
function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c !== ''));
}

/**
 * Applique les traductions du CSV sur la locale cible, en place : l'ordre des
 * clés du fichier cible est conservé (diff minimal) ; une clé absente de la
 * cible est ajoutée en fin de son objet. Cellule vide → valeur existante
 * conservée. Retourne la locale mise à jour et un rapport.
 */
function applyCsv(reference, target, csvText) {
  const rows = parseCsv(csvText);
  const header = rows.shift() || [];
  if (header[0] !== 'key' || header.length < 3) {
    throw new Error('En-tête CSV attendu : key,fr,<langue>');
  }
  const lang = header[2];
  const refFlat = flatten(reference);
  const tgtFlat = flatten(target);
  const locale = JSON.parse(JSON.stringify(target));
  const changed = [];
  const unknown = [];
  for (const [key, , value] of rows) {
    if (!(key in refFlat)) {
      unknown.push(key);
      continue;
    }
    if (value === undefined || value === '' || value === tgtFlat[key]) continue;
    const parts = key.split('.');
    let node = locale;
    for (const part of parts.slice(0, -1)) {
      if (node[part] === null || typeof node[part] !== 'object') node[part] = {};
      node = node[part];
    }
    node[parts[parts.length - 1]] = value;
    changed.push(key);
  }
  return { lang, locale, changed, unknown };
}

module.exports = { flatten, toCsv, parseCsv, applyCsv };
