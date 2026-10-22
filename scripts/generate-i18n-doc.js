#!/usr/bin/env node
/**
 * Génère docs/I18N.md : état des traductions.
 *
 *   node scripts/generate-i18n-doc.js          → réécrit docs/I18N.md
 *   node scripts/generate-i18n-doc.js --check  → échoue (exit 1) si la doc
 *                                                n'est plus à jour ou si une
 *                                                page distante utilise une
 *                                                clé absente de i18n.js
 *
 * Couvre :
 *   - application (src/renderer/locales/*.json, référence fr.json)
 *   - pages distantes (src/remote/i18n.js + attributs data-i18n* des .html)
 *
 * Indicateurs par langue : clés présentes, clés identiques au français
 * (probablement non traduites), clés vides. Liste des clés non référencées
 * dans le code (candidates à suppression). Sortie déterministe (pas de date).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'src', 'renderer', 'locales');
const REMOTE_DIR = path.join(ROOT, 'src', 'remote');
const OUTPUT = path.join(ROOT, 'docs', 'I18N.md');
const REFERENCE = 'fr';
// Valeurs légitimement identiques au français (noms propres, sigles, symboles).
// Clés volontairement identiques au français, par langue (sigles, abréviations, termes
// d'escrime internationaux) : scripts/i18n-allow-same.json, sections `app` et `remote` (#1160).
const ALLOW_SAME = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-allow-same.json'), 'utf8'));
const SAME_AS_FR_OK = /^[\p{N}\p{P}\p{S}\s]*$|^(BellePoule.*|OK|Quest|Club|Total|Arena|Message|Points?|Score|Sabre|Laser|Poules?|Classement|Version|Mode|Stop|Pause|Zones?|Notes?|Tableau|Format|Ranking|Info|Type|Statistiques|Date)$/iu;

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}

function loadAppLocales() {
  const locales = {};
  for (const file of fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json')).sort()) {
    locales[file.replace(/\.json$/, '')] = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8')));
  }
  return locales;
}

/** Exécute i18n.js dans un bac à sable et récupère l'objet TRANSLATIONS. */
function loadRemoteLocales() {
  const src = fs
    .readFileSync(path.join(REMOTE_DIR, 'i18n.js'), 'utf8')
    .replace('const TRANSLATIONS =', 'const TRANSLATIONS = window.__TRANSLATIONS__ =');
  const sandbox = { window: {}, document: undefined, fetch: () => Promise.reject() };
  vm.runInNewContext(src, sandbox);
  return sandbox.window.__TRANSLATIONS__;
}

function walk(dir, re) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, re));
    else if (re.test(entry.name)) files.push(full);
  }
  return files;
}

/** Littéraux de chaîne + préfixes de templates (`a.b.${x}`) du code applicatif. */
function collectCodeStrings() {
  const literals = new Set();
  const prefixes = new Set();
  const files = walk(path.join(ROOT, 'src'), /\.tsx?$/).filter(f => !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(f));
  for (const file of files) {
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
    const visit = node => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text);
      else if (ts.isTemplateExpression(node) && node.head.text.includes('.')) prefixes.add(node.head.text);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { literals, prefixes };
}

function isReferenced(key, { literals, prefixes }) {
  if (literals.has(key)) return true;
  // Clé utilisée sans son espace de noms (ex. t('categories.' + k), ou sous-objet passé tel quel)
  const parts = key.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const head = parts.slice(0, i).join('.');
    if (prefixes.has(head + '.') || literals.has(head + '.')) return true;
  }
  return false;
}

function pct(n, total) {
  return total === 0 ? '—' : `${Math.round((n / total) * 100)} %`;
}

function languageTable(locales, referenceKeys, section) {
  const ref = locales[REFERENCE];
  const rows = [
    '| Langue | Clés | Traduites | Identiques au FR | Vides | Manquantes |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  const detail = {};
  for (const lang of Object.keys(locales).sort()) {
    const loc = locales[lang];
    const missing = referenceKeys.filter(k => !(k in loc));
    const empty = referenceKeys.filter(k => k in loc && String(loc[k]).trim() === '');
    const same =
      lang === REFERENCE
        ? []
        : referenceKeys.filter(
            k =>
              k in loc &&
              loc[k] === ref[k] &&
              !SAME_AS_FR_OK.test(String(ref[k])) &&
              !(ALLOW_SAME[section]?.[lang] ?? []).includes(k)
          );
    const translated = referenceKeys.length - missing.length - empty.length - same.length;
    rows.push(
      `| \`${lang}\` | ${Object.keys(loc).length} | ${pct(translated, referenceKeys.length)} | ${same.length} | ${empty.length} | ${missing.length} |`
    );
    detail[lang] = { missing, empty, same };
  }
  return { table: rows.join('\n'), detail };
}

function keyList(title, keys, max = 40) {
  if (keys.length === 0) return '';
  const shown = keys.slice(0, max).map(k => `\`${k}\``).join(', ');
  const more = keys.length > max ? `, … (+${keys.length - max})` : '';
  return `- **${title}** (${keys.length}) : ${shown}${more}\n`;
}

function remoteHtmlKeys() {
  const used = new Map();
  for (const file of fs.readdirSync(REMOTE_DIR).filter(f => f.endsWith('.html')).sort()) {
    const html = fs.readFileSync(path.join(REMOTE_DIR, file), 'utf8');
    const re = /data-i18n(?:-placeholder|-title)?="([^"]+)"|\b(?:T|tk)\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(html))) {
      const key = m[1] || m[2];
      if (!used.has(key)) used.set(key, new Set());
      used.get(key).add(file);
    }
  }
  return used;
}

function generate() {
  const problems = [];

  // --- Application
  const app = loadAppLocales();
  const appKeys = Object.keys(app[REFERENCE]).sort();
  const appTable = languageTable(app, appKeys, 'app');
  const code = collectCodeStrings();
  const unused = appKeys.filter(k => !isReferenced(k, code));

  // --- Pages distantes
  const remote = loadRemoteLocales();
  const remoteKeys = Object.keys(remote[REFERENCE]).sort();
  const remoteTable = languageTable(remote, remoteKeys, 'remote');
  // Clé dupliquée dans un bloc de langue : la dernière écrase silencieusement la première
  {
    const src = fs.readFileSync(path.join(REMOTE_DIR, 'i18n.js'), 'utf8');
    let seen = new Set();
    for (const line of src.split('\n')) {
      if (/^    (fr|en|'zh-HK'): \{$/.test(line)) seen = new Set();
      const m = /^      '([^']+)':/.exec(line);
      if (!m) continue;
      if (seen.has(m[1])) problems.push(`clé distante dupliquée: ${m[1]}`);
      seen.add(m[1]);
    }
  }
  const htmlKeys = remoteHtmlKeys();
  const unknownRemote = [...htmlKeys.keys()].filter(k => !(k in remote[REFERENCE])).sort();
  for (const k of unknownRemote) problems.push(`clé distante inconnue: ${k} (${[...htmlKeys.get(k)].join(', ')})`);

  let md = `# État des traductions

> ⚠️ Fichier **généré** par \`npm run docs:i18n\` (\`scripts/generate-i18n-doc.js\`).
> Ne pas éditer à la main. La CI échoue (\`npm run check:i18n-doc\`) s'il n'est
> pas régénéré après modification d'une locale.

Référence : français (\`fr\`). « Identiques au FR » = valeur recopiée du
français, probablement non traduite (noms propres et symboles exclus).
Contribuer : [TRANSLATING.md](TRANSLATING.md).

## Application (\`src/renderer/locales/\`)

${appTable.table}

`;
  for (const lang of Object.keys(appTable.detail).filter(l => l !== REFERENCE)) {
    const d = appTable.detail[lang];
    const body = keyList('Manquantes', d.missing) + keyList('Vides', d.empty) + keyList('Identiques au FR', d.same);
    if (body) md += `### \`${lang}\`\n\n${body}\n`;
  }

  md += `### Clés non référencées dans le code

Candidates à suppression (aucun littéral ni préfixe de template correspondant
dans \`src/\` — vérifier les clés construites dynamiquement avant de supprimer).

${unused.length ? keyList('Non référencées', unused, 200) : 'Aucune.\n'}
## Chaînes en dur (non traduites)

Texte littéral dans le JSX, suivi par \`npm run check:quality\`
(\`scripts/check-quality-ratchet.js\`, compteurs \`jsxText\` / \`jsxAttr\`).
Détail : \`node scripts/check-quality-ratchet.js --list jsxText\`.

## Pages distantes (\`src/remote/i18n.js\`)

Tablettes arbitres, écrans d'arène, kiosque, appel… Langues : ${Object.keys(remote)
    .sort()
    .map(l => `\`${l}\``)
    .join(', ')}.

${remoteTable.table}

`;
  for (const lang of Object.keys(remoteTable.detail).filter(l => l !== REFERENCE)) {
    const d = remoteTable.detail[lang];
    const body = keyList('Manquantes', d.missing) + keyList('Vides', d.empty) + keyList('Identiques au FR', d.same);
    if (body) md += `### \`${lang}\`\n\n${body}\n`;
  }

  md += `### Couverture des pages

| Page | Clés utilisées (\`data-i18n*\` / \`T()\` / \`tk()\`) |
|---|---:|
`;
  const perPage = new Map();
  for (const files of htmlKeys.values()) for (const f of files) perPage.set(f, (perPage.get(f) || 0) + 1);
  const pages = fs.readdirSync(REMOTE_DIR).filter(f => f.endsWith('.html')).sort();
  for (const page of pages) md += `| \`${page}\` | ${perPage.get(page) || 0} |\n`;

  return { md, problems };
}

const { md, problems } = generate();

if (process.argv.includes('--check')) {
  let failed = false;
  if (problems.length) {
    failed = true;
    for (const p of problems) console.error(`✗ ${p}`);
  }
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== md) {
    failed = true;
    console.error('✗ docs/I18N.md pas à jour : lancer "npm run docs:i18n" puis committer.');
  }
  if (failed) process.exit(1);
  console.log('✓ docs/I18N.md à jour.');
} else {
  fs.writeFileSync(OUTPUT, md);
  console.log(`docs/I18N.md généré.${problems.length ? ' Problèmes :\n  ' + problems.join('\n  ') : ''}`);
}
