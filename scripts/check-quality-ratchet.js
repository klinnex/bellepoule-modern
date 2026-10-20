#!/usr/bin/env node
/**
 * Garde-fou « cliquet » qualité : compte des motifs de dette dans src/
 * (hors tests) et échoue si un compteur dépasse la référence enregistrée.
 *
 *   node scripts/check-quality-ratchet.js            → vérifie (CI)
 *   node scripts/check-quality-ratchet.js --update   → abaisse la référence
 *                                                      aux valeurs actuelles
 *   node scripts/check-quality-ratchet.js --list jsxText → détaille un compteur
 *
 * Compteurs :
 *   - jsxText    : texte littéral dans le JSX (renderer) → chaîne non traduite
 *   - jsxAttr    : title / placeholder / aria-label / alt littéraux (renderer)
 *   - any        : `any` explicite (annotations, `as any`)
 *   - console    : appels console.* (préférer @shared/services/logger)
 *   - remoteUnescaped : interpolations `${…}` non échappées dans les gabarits HTML des pages
 *                  distantes (src/remote) : risque XSS (#1147). Échapper avec escHtml
 *                  (/common.js) ou faire précéder un fragment HTML audité d'un commentaire
 *                  « html » (voir scripts/remote-escape-analysis.js).
 *
 * Plafond de longueur (#1155) : aucun fichier source de src/ (hors tests) ne dépasse
 * MAX_LINES lignes. Les fichiers déjà au-dessus sont listés dans `lineExceptions`
 * (quality-baseline.json) avec leur taille actuelle : elle ne peut que baisser, et
 * une exception disparaît d'elle-même quand le fichier repasse sous le plafond.
 *
 * Analyse AST (TypeScript), sortie déterministe. La référence ne peut que
 * baisser : --update refuse d'augmenter un compteur.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { analyzeRemoteSource } = require('./remote-escape-analysis');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(__dirname, 'quality-baseline.json');
const SOURCE_RE = /\.tsx?$/;
const MAX_LINES = 1500;
const LINE_RE = /\.(tsx?|html|js|css)$/;
const EXCLUDE_RE = /(\.test\.tsx?$|\.spec\.tsx?$|\.d\.ts$|[\\/]__tests__[\\/]|[\\/]examples[\\/])/;
const I18N_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
// Au moins deux lettres (latin + accents) : ignore ponctuation, symboles, chiffres.
const WORDISH_RE = /\p{L}{2,}/u;

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (SOURCE_RE.test(entry.name) && !EXCLUDE_RE.test(fullPath)) files.push(fullPath);
  }
  return files;
}

function isRenderer(file) {
  return file.startsWith(path.join(SRC, 'renderer') + path.sep) || file.includes(`${path.sep}features${path.sep}`);
}

function analyze(file) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const hits = { jsxText: [], jsxAttr: [], any: [], console: [] };
  const renderer = isRenderer(file);
  const at = node => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) hits.any.push(at(node));
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console'
    ) {
      hits.console.push(at(node));
    }
    if (renderer && ts.isJsxText(node) && WORDISH_RE.test(node.text)) {
      hits.jsxText.push(at(node));
    }
    if (
      renderer &&
      ts.isJsxAttribute(node) &&
      I18N_ATTRS.has(node.name.getText(sf)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      WORDISH_RE.test(node.initializer.text)
    ) {
      hits.jsxAttr.push(at(node));
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return hits;
}

const REMOTE_DIR = path.join(SRC, 'remote');
const REMOTE_SKIP = new Set(['i18n.js', 'sw.js', 'common.js']);

/** Pages distantes : interpolations HTML non échappées (une entrée par occurrence) */
function remoteFindings() {
  const out = [];
  for (const name of fs.readdirSync(REMOTE_DIR).sort()) {
    if (!/\.(html|js)$/.test(name) || REMOTE_SKIP.has(name)) continue;
    const text = fs.readFileSync(path.join(REMOTE_DIR, name), 'utf8');
    const lines = analyzeRemoteSource(name, text).map(h => h.line);
    if (lines.length) out.push({ file: `src/remote/${name}`, lines });
  }
  return out;
}

/** Longueur (lignes) des fichiers source de src/, hors tests et typages générés */
function fileLengths() {
  const out = {};
  const stack = [SRC];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (LINE_RE.test(entry.name) && !EXCLUDE_RE.test(full)) {
        const text = fs.readFileSync(full, 'utf8');
        const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
        out[path.relative(ROOT, full).split(path.sep).join('/')] = lines;
      }
    }
  }
  return out;
}

/** Fichiers au-dessus du plafond */
function oversized() {
  const res = {};
  for (const [f, n] of Object.entries(fileLengths())) if (n > MAX_LINES) res[f] = n;
  return res;
}

function collect() {
  const totals = { jsxText: 0, jsxAttr: 0, any: 0, console: 0, remoteUnescaped: 0 };
  const details = { jsxText: [], jsxAttr: [], any: [], console: [], remoteUnescaped: [] };
  for (const file of walk(SRC).sort()) {
    const hits = analyze(file);
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    for (const key of Object.keys(hits)) {
      totals[key] += hits[key].length;
      if (hits[key].length) details[key].push({ file: rel, lines: hits[key] });
    }
  }
  details.remoteUnescaped = remoteFindings();
  totals.remoteUnescaped = details.remoteUnescaped.reduce((n, f) => n + f.lines.length, 0);
  return { totals, details };
}

function main() {
  const args = process.argv.slice(2);
  const { totals, details } = collect();

  const listIdx = args.indexOf('--list');
  if (listIdx !== -1) {
    const key = args[listIdx + 1];
    if (!details[key]) {
      console.error(`Compteur inconnu: ${key} (${Object.keys(details).join(', ')})`);
      process.exit(1);
    }
    const sorted = [...details[key]].sort((a, b) => b.lines.length - a.lines.length);
    for (const { file, lines } of sorted) console.log(`${String(lines.length).padStart(4)}  ${file}:${lines.join(',')}`);
    return;
  }

  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

  if (args.includes('--update')) {
    const next = {};
    for (const [key, value] of Object.entries(totals)) {
      if (baseline && baseline[key] !== undefined && value > baseline[key]) {
        console.error(`✗ ${key}: ${value} > référence ${baseline[key]} — corriger plutôt que relever.`);
        process.exit(1);
      }
      next[key] = value;
    }
    const big = oversized();
    const known = baseline && baseline.lineExceptions;
    for (const [f, n] of Object.entries(big)) {
      if (known && known[f] === undefined) {
        console.error(`✗ ${f}: ${n} lignes > plafond ${MAX_LINES} — nouvelle exception interdite, découper le fichier.`);
        process.exit(1);
      }
      if (known && n > known[f]) {
        console.error(`✗ ${f}: ${n} lignes > référence ${known[f]} — découper plutôt que relever.`);
        process.exit(1);
      }
    }
    next.lineExceptions = big;
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log('Référence mise à jour :', next);
    return;
  }

  if (!baseline) {
    console.error(`Référence absente : lancer "node scripts/check-quality-ratchet.js --update".`);
    process.exit(1);
  }

  let failed = false;
  for (const [key, value] of Object.entries(totals)) {
    const ref = baseline[key];
    if (value > ref) {
      failed = true;
      console.log(`✗ ${key}: ${value} (référence ${ref}, +${value - ref})`);
    } else if (value < ref) {
      console.log(`↓ ${key}: ${value} (référence ${ref}) — lancer --update pour verrouiller le gain`);
    } else {
      console.log(`✓ ${key}: ${value}`);
    }
  }
  const exceptions = baseline.lineExceptions || {};
  const lengths = fileLengths();
  for (const [f, n] of Object.entries(lengths)) {
    if (n <= MAX_LINES) continue;
    const ref = exceptions[f];
    if (ref === undefined) {
      failed = true;
      console.log(`✗ ${f}: ${n} lignes > plafond ${MAX_LINES} (découper le fichier)`);
    } else if (n > ref) {
      failed = true;
      console.log(`✗ ${f}: ${n} lignes (référence ${ref}, +${n - ref})`);
    } else if (n < ref) {
      console.log(`↓ ${f}: ${n} lignes (référence ${ref}) — lancer --update pour verrouiller le gain`);
    }
  }
  for (const f of Object.keys(exceptions)) {
    if (lengths[f] === undefined || lengths[f] <= MAX_LINES) {
      console.log(`↓ ${f}: sous le plafond — lancer --update pour retirer l'exception`);
    }
  }
  if (failed) {
    console.error('\nDette en hausse. Détail : node scripts/check-quality-ratchet.js --list <compteur>');
    process.exit(1);
  }
}

main();
