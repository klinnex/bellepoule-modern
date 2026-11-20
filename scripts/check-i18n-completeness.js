#!/usr/bin/env node
/**
 * Compare les clés de chaque locale à la référence fr.json.
 * Pages distantes (#1213) : idem pour src/remote/i18n/<langue>.js vs fr.js,
 * plus les paramètres {{x}} identiques à ceux du français.
 * Avertit (sans échouer, #1543) des libellés nettement plus longs que le français
 * (risque de débordement) : > ratio x fr ET > marge caractères d'écart.
 * Échoue (exit 1) si une langue a des clés manquantes ou en trop.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'renderer', 'locales');
const REFERENCE_LOCALE = 'fr';

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function loadLocale(locale) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const localeFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace(/\.json$/, ''));

const referenceKeys = new Set(flattenKeys(loadLocale(REFERENCE_LOCALE)));

let hasError = false;

for (const locale of localeFiles) {
  if (locale === REFERENCE_LOCALE) continue;

  const keys = new Set(flattenKeys(loadLocale(locale)));
  const missing = [...referenceKeys].filter(k => !keys.has(k)).sort();
  const extra = [...keys].filter(k => !referenceKeys.has(k)).sort();

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✓ ${locale}: OK (${keys.size} clés)`);
    continue;
  }

  hasError = true;
  console.log(`✗ ${locale}: ${missing.length} manquante(s), ${extra.length} en trop`);
  for (const key of missing) console.log(`    - manquante: ${key}`);
  for (const key of extra) console.log(`    - en trop:    ${key}`);
}

// Longueur des libellés vs français (#1543) : avertissement non bloquant
const LENGTH_RATIO = 1.6;
const LENGTH_MIN_EXTRA = 12;
const LENGTH_MAX_LISTED = 5;
function flattenStrings(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flattenStrings(value, fullKey, out);
    } else if (typeof value === 'string') {
      out[fullKey] = value;
    }
  }
  return out;
}
const frStrings = flattenStrings(loadLocale(REFERENCE_LOCALE));
for (const locale of localeFiles) {
  if (locale === REFERENCE_LOCALE) continue;
  const strings = flattenStrings(loadLocale(locale));
  const longs = Object.keys(frStrings)
    .filter(k => typeof strings[k] === 'string')
    .map(k => ({ k, fr: frStrings[k].length, len: strings[k].length }))
    .filter(x => x.fr > 0 && x.len > x.fr * LENGTH_RATIO && x.len - x.fr > LENGTH_MIN_EXTRA)
    .sort((a, b) => b.len - b.fr - (a.len - a.fr));
  if (longs.length === 0) continue;
  console.log(
    `⚠ ${locale}: ${longs.length} libellé(s) > ${LENGTH_RATIO}x le français (risque de débordement)`
  );
  for (const x of longs.slice(0, LENGTH_MAX_LISTED)) {
    console.log(`    - ${x.k}: ${x.len} car. (fr ${x.fr})`);
  }
}

// Pages distantes : src/remote/i18n/<langue>.js
const REMOTE_I18N_DIR = path.join(__dirname, '..', 'src', 'remote', 'i18n');
const sandbox = { window: {} };
for (const f of fs.readdirSync(REMOTE_I18N_DIR).filter(f => f.endsWith('.js'))) {
  vm.runInNewContext(fs.readFileSync(path.join(REMOTE_I18N_DIR, f), 'utf8'), sandbox);
}
const remote = sandbox.window.BP_REMOTE_I18N || {};
const remoteRef = remote[REFERENCE_LOCALE] || {};
const params = s => (String(s).match(/\{\{\w+\}\}/g) || []).sort().join(',');

for (const locale of Object.keys(remote).sort()) {
  if (locale === REFERENCE_LOCALE) continue;
  const t = remote[locale];
  const missing = Object.keys(remoteRef)
    .filter(k => !(k in t))
    .sort();
  const extra = Object.keys(t)
    .filter(k => !(k in remoteRef))
    .sort();
  const badParams = Object.keys(remoteRef)
    .filter(k => k in t && params(t[k]) !== params(remoteRef[k]))
    .sort();
  if (missing.length + extra.length + badParams.length === 0) {
    console.log(`✓ distant ${locale}: OK (${Object.keys(t).length} clés)`);
    continue;
  }
  hasError = true;
  console.log(
    `✗ distant ${locale}: ${missing.length} manquante(s), ${extra.length} en trop, ${badParams.length} paramètre(s) différent(s)`
  );
  for (const key of missing) console.log(`    - manquante: ${key}`);
  for (const key of extra) console.log(`    - en trop:    ${key}`);
  for (const key of badParams) console.log(`    - paramètres: ${key}`);
}

if (hasError) {
  console.error('\ni18n incomplet : voir détails ci-dessus.');
  process.exit(1);
} else {
  console.log('\nToutes les locales sont complètes.');
}
