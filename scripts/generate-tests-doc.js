#!/usr/bin/env node
/**
 * Génère docs/TESTS.md : inventaire de tous les tests (Vitest + Playwright)
 * et des contrôles qualité exécutés en CI.
 *
 *   node scripts/generate-tests-doc.js          → réécrit docs/TESTS.md
 *   node scripts/generate-tests-doc.js --check  → échoue (exit 1) si la doc
 *                                                 n'est plus à jour
 *
 * L'inventaire est extrait par analyse AST (TypeScript) des appels
 * describe / it / test. Sortie déterministe (pas de date) pour que --check
 * ne dépende que du contenu des fichiers de test.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', 'TESTS.md');
const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (TEST_FILE_RE.test(entry.name)) files.push(fullPath);
  }
  return files;
}

/** Nom racine d'un callee : describe, it, test (gère describe.each, test.describe…). */
function calleeInfo(expr) {
  const parts = [];
  let cur = expr;
  while (cur) {
    if (ts.isIdentifier(cur)) {
      parts.unshift(cur.text);
      break;
    }
    if (ts.isPropertyAccessExpression(cur)) {
      parts.unshift(cur.name.text);
      cur = cur.expression;
    } else if (ts.isCallExpression(cur)) {
      // describe.each([...])('titre', fn)
      cur = cur.expression;
    } else {
      return null;
    }
  }
  const [root, ...mods] = parts;
  if (!['describe', 'it', 'test'].includes(root)) return null;
  const isSuite = root === 'describe' || mods.includes('describe');
  const flags = mods.filter(m => ['skip', 'todo', 'only', 'each', 'concurrent'].includes(m));
  return { isSuite, flags };
}

function titleOf(arg) {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) return arg.getText().slice(1, -1);
  return null;
}

/** Retourne l'arbre { suites, tests } d'un fichier. */
function parseFile(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const rootNode = { title: null, children: [], tests: [] };

  function visit(node, parent) {
    if (ts.isCallExpression(node)) {
      const info = calleeInfo(node.expression);
      const title = info && titleOf(node.arguments[0]);
      if (info && title !== null) {
        if (info.isSuite) {
          const suite = { title, flags: info.flags, children: [], tests: [] };
          parent.children.push(suite);
          node.arguments.slice(1).forEach(a => ts.forEachChild(a, n => visit(n, suite)));
          return;
        }
        parent.tests.push({ title, flags: info.flags });
        return;
      }
    }
    ts.forEachChild(node, n => visit(n, parent));
  }

  visit(source, rootNode);
  return rootNode;
}

function countTests(node) {
  return node.tests.length + node.children.reduce((s, c) => s + countTests(c), 0);
}

const escapeMd = s => s.replace(/\s+/g, ' ').replace(/([\\|<>*_`[\]])/g, '\\$1');
const flagSuffix = flags => {
  const shown = flags.filter(f => f !== 'concurrent');
  return shown.length ? ` _(${shown.join(', ')})_` : '';
};

function renderNode(node, depth, lines) {
  const indent = '  '.repeat(depth);
  for (const t of node.tests) lines.push(`${indent}- ${escapeMd(t.title)}${flagSuffix(t.flags)}`);
  for (const c of node.children) {
    lines.push(`${indent}- **${escapeMd(c.title)}**${flagSuffix(c.flags)}`);
    renderNode(c, depth + 1, lines);
  }
}

/** Groupe de rattachement d'un fichier de test (titre de section). */
function groupOf(rel) {
  if (rel.startsWith('e2e/')) return 'E2E Playwright (`e2e/`)';
  const p = rel.split('/');
  if (p[1] === 'features') return `Feature \`${p[2]}\` (\`src/features/${p[2]}/\`)`;
  if (p[1] === 'shared' || p[1] === 'renderer') return `\`src/${p[1]}/${p[2]}/\``;
  return `\`src/${p[1]}/\``;
}

const GROUP_ORDER = [
  '`src/shared/utils/`',
  '`src/shared/services/`',
  'Feature',
  '`src/database/`',
  '`src/main/`',
  '`src/renderer/services/`',
  '`src/renderer/hooks/`',
  '`src/renderer/components/`',
  'E2E',
];
const groupRank = g => {
  const i = GROUP_ORDER.findIndex(prefix => g.startsWith(prefix));
  return i === -1 ? GROUP_ORDER.length : i;
};

const STATIC_HEADER = `# Tests opérationnels

> ⚠️ Fichier **généré** par \`npm run docs:tests\` (\`scripts/generate-tests-doc.js\`).
> Ne pas éditer à la main : modifier le script pour la partie fixe, les fichiers
> de test pour l'inventaire. Régénéré par la CI à chaque push sur \`dev\`
> (commit \`🔖 Dev Build\`) : ne pas le committer dans les PR (évite les conflits).

## Contrôles qualité en CI

Workflow réutilisable \`.github/workflows/quality.yml\` (\`workflow_call\`), appelé par
\`.github/workflows/pr-quality.yml\` (PR vers \`dev\`, à rendre requis dans la
protection de branche), \`build-dev.yml\` (push sur \`dev\`) et \`build.yml\`
(push sur \`main\`). Les builds par plateforme dépendent de ce job. Le job \`nix-build\` (mêmes déclencheurs) build le paquet
Nix de \`flake.nix\`. Ce n'est pas une dépendance des builds par plateforme.

| Étape | Commande | Échoue si |
|---|---|---|
| Typage | \`npm run type-check\` | erreur TypeScript (\`tsc --noEmit\`, mode strict) |
| i18n | \`npm run check:i18n\` | clé manquante / en trop vs \`fr.json\`, ou vs \`src/remote/i18n/fr.js\` pour les pages distantes (paramètres \`{{x}}\` compris) ; avertit sans échouer des libellés > 1,6x le français (\`scripts/check-i18n-completeness.js\`) |
| Doc i18n | \`npm run check:i18n-doc\` | \`docs/I18N.md\` pas à jour, ou clé \`data-i18n\` d'une page distante absente de \`src/remote/i18n.js\` |
| Doc Socket.IO | \`npm run check:socket-doc\` | \`docs/SOCKET_EVENTS.md\` pas à jour, ou événement émis par une page sans écouteur serveur |
| Doc MCP | dans \`npm run test:run\` (\`src/main/mcp/mcpDoc.test.ts\`) ; seul : \`npm run check:mcp-doc\` | référence des outils de \`docs/MCP.md\` pas à jour vs leurs schémas (\`npm run docs:mcp\` pour régénérer, #1880) |
| Cliquet qualité | \`npm run check:quality\` | hausse du nombre de textes JSX en dur, \`any\`, \`console.*\`, \`style={{…}}\` (#1157), \`fontSize\` en px (#1156), locale \`'fr'\` en dur (#1160), messages d'erreur serveur en clair (#1159), emoji en tête de texte d’interface ou de libellé de locale, ou emoji dans les pages distantes \`src/remote\` (#1532), ou couleur hexadécimale en dur dans les pages distantes \`src/remote\` (hors \`tokens.css\`, #1538), sonde de débogage \`DIAGNOSTIC\` / \`remote:diag\` restée dans \`src\` (#1773), fichiers de \`src/main\`, \`src/shared\` ou \`src/database\` qui importent \`src/renderer\` (\`rendererImports\`) ou \`src/features\` (\`featuresImports\`), fichiers de l'interface qui appellent \`window.electronAPI\` directement (\`electronApiCalls\`, #1979), ou fichier source > 1500 lignes (exceptions plafonnées, #1155) vs \`scripts/quality-baseline.json\` ; en CI, une baisse non verrouillée échoue aussi (\`--update\` pour verrouiller, #1895) |
| Lint (erreurs) | \`npm run lint:errors\` (\`eslint . --quiet\`) | erreur ESLint : import d'une couche interdite (\`src/main\`, \`src/shared\`, \`src/database\` → \`src/renderer\` ou \`src/features\` ; \`src/shared/domain\` → React, Electron, Node, base ; dans le domaine, \`Date.now\`, \`new Date()\`, \`Math.random\`, \`window\`, \`document\`, \`localStorage\` interdits ; #1979, \`docs/adr/0002\`), \`alert\`/\`confirm\`, E/S fs synchrone dans le serveur distant (#1776). Les avertissements n'échouent pas |
| E2E (PR) | job \`e2e\` : \`npx playwright install --with-deps chromium\` puis \`xvfb-run -a npm run test:e2e\` (build compris) | un test Playwright échoue : interface dans le navigateur (\`chromium\`) ou application Electron réelle (\`electron\`) ; rapport \`playwright-report\` en artefact (#2045) |
| Build Nix | \`nix build .#default\` (job \`nix-build\`) | le paquet \`flake.nix\` ne build pas : \`npmDepsHash\` périmé vs \`package-lock.json\`, dépendance native cassée, etc. |
| Tests unitaires | \`npm run test:run\` | un test Vitest échoue |
| Budget bundle | \`npm run build:renderer\` + \`node scripts/check-bundle-size.js\` | JS renderer : initial > 2.75 MiB, un chunk à la demande > 1.25 MiB, total > 6.5 MiB, ou aucun chunk à la demande (\`scripts/check-bundle-size.js\`) |

Hors CI (manuel) : \`npm run lint\` (avertissements compris), \`npm run format:check\`, \`npm run test:coverage\`. Débordements de libellés dans les dix langues à 1024×768 (#1543) :
\`npm run check:i18n-visual\` (\`scripts/capture-i18n.js\`, Electron, après \`npm run build\` ;
\`xvfb-run -a\` sous Linux ; \`-- --pseudo\` pour la pseudo-localisation) : échoue si un écran clé
défile horizontalement, rogne un libellé sans ellipse ni infobulle, coupe un mot sur deux lignes
ou sort de la fenêtre ; captures + \`report.json\` dans \`test-results/i18n-captures\`. Simulateur d'appareil de piste Cyrano : \`npm run cyrano:sim\` (\`scripts/cyrano-simulator.js\`, voir \`docs/CYRANO.md\`).

Sécurité : \`.github/workflows/codeql.yml\` (CodeQL JS/TS, PR vers \`dev\` + hebdo) et \`security.yml\` (\`npm audit --omit=dev\` non bloquant + SBOM CycloneDX), Dependabot (\`.github/dependabot.yml\`).

Revue de code automatique : \`.github/workflows/claude-code-review.yml\` sur les PR.

## Tests unitaires — Vitest

- Config : \`vitest.config.ts\` — \`globals: true\`, environnement \`node\` par défaut.
- Fichiers : \`src/**/*.{test,spec}.{ts,tsx}\`, co-localisés avec le code testé.
- Composants / hooks React : pragma \`// @vitest-environment jsdom\` en tête de fichier.
- Couverture (\`npm run test:coverage\`, v8) : \`src/**/*.ts\` hors \`src/main\`,
  \`src/renderer\`, \`src/remote\`.

\`\`\`bash
npm test                 # watch
npm run test:run         # exécution unique (CI)
npx vitest run src/shared/utils/poolCalculations.test.ts   # un fichier
\`\`\`

## Tests E2E — Playwright

- Config : \`playwright.config.ts\` — \`testDir: ./e2e\`, deux projets (#2045) :
  - \`chromium\` : l'interface servie par \`npm run dev:renderer\` (Webpack, port **8066**), dans le
    navigateur, sans \`window.electronAPI\` (accueil, fenêtres, accessibilité axe, débordements i18n) ;
  - \`electron\` : l'application construite (\`dist/\`), lancée par \`_electron.launch\` avec un profil
    vierge (\`e2e/electron/app.ts\`) — parcours qui écrivent en base : créer, rouvrir, supprimer une
    épreuve ; tireurs, pointage, poules, saisie d'un score. Ignorés sans build ou sans écran.
- \`pretest:e2e\` construit l'application (\`npm run build\`) ; sous Linux sans écran : \`xvfb-run -a\`.
- \`E2E_ALL_BROWSERS=1\` ajoute Firefox, WebKit, Mobile Chrome, Mobile Safari ; 2 retries et 1 worker en CI.
- Navigateur : \`npx playwright install chromium\` (version attendue par Playwright).
- **CI** : job \`e2e\` des PR (\`.github/workflows/e2e.yml\`, appelé par \`pr-quality.yml\`) : Chromium installé, build, \`xvfb-run -a\` ; rapport HTML en artefact si échec (#2045).
- Quelques scénarios appellent \`test.skip()\` si l'état requis (compétition existante, tableau…) est absent.

\`\`\`bash
xvfb-run -a npm run test:e2e                      # navigateur + Electron (Linux sans écran)
npm run test:e2e -- --project=chromium            # interface seule
E2E_ALL_BROWSERS=1 npm run test:e2e               # tous navigateurs
npm run e2e:debug                                 # mode debug
\`\`\`

## Simulateur et benchmarks

- \`src/shared/utils/tournamentSimulator.ts\` : joue une compétition complète
  (poules → tableau → classement) avec des scores aléatoires valides, déterministe
  pour une graine donnée. Testé de bout en bout (200 tireurs) dans
  \`tournamentSimulator.test.ts\`.
- \`npm run bench\` (\`vitest bench\`, fichiers \`*.bench.ts\`) : classement de poules,
  placement / création / classement de tableau, tournoi complet. **Non exécuté en CI**
  (mesures trop bruitées sur les runners partagés) : lancer avant/après une
  optimisation.

## Maintenir cette documentation

1. Ajouter / modifier un test.
2. Ne pas committer \`docs/TESTS.md\` : la CI \`build-dev.yml\` le régénère au push sur
   \`dev\` (\`npm run docs:tests\` reste utilisable en local pour consulter l'inventaire).
`;

function generate() {
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'e2e'))]
    .map(f => path.relative(ROOT, f).split(path.sep).join('/'))
    .sort();

  const groups = new Map();
  let totalTests = 0;
  let unitFiles = 0;
  let unitTests = 0;
  for (const rel of files) {
    const tree = parseFile(path.join(ROOT, rel));
    const count = countTests(tree);
    totalTests += count;
    if (!rel.startsWith('e2e/')) {
      unitFiles++;
      unitTests += count;
    }
    const g = groupOf(rel);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ rel, tree, count });
  }

  const sortedGroups = [...groups.entries()].sort(
    ([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b)
  );

  const lines = [STATIC_HEADER];
  lines.push('## Synthèse\n');
  lines.push('| Domaine | Fichiers | Tests |');
  lines.push('|---|---:|---:|');
  for (const [g, entries] of sortedGroups) {
    lines.push(`| ${g} | ${entries.length} | ${entries.reduce((s, e) => s + e.count, 0)} |`);
  }
  lines.push(`| **Total** | **${files.length}** | **${totalTests}** |`);
  lines.push('');
  lines.push(
    `Unitaires : ${unitFiles} fichiers, ${unitTests} tests. ` +
      `E2E : ${files.length - unitFiles} fichiers, ${totalTests - unitTests} tests ` +
      '(comptage statique ; `it.each` / `describe.each` comptent pour 1).'
  );
  lines.push('');
  lines.push('## Inventaire détaillé\n');

  for (const [g, entries] of sortedGroups) {
    lines.push(`### ${g}\n`);
    for (const { rel, tree, count } of entries) {
      lines.push('<details>');
      lines.push(`<summary><code>${rel}</code> — ${count} test${count > 1 ? 's' : ''}</summary>\n`);
      renderNode(tree, 0, lines);
      lines.push('\n</details>\n');
    }
  }

  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

const content = generate();

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== content) {
    console.error('docs/TESTS.md n\'est pas à jour. Lancer "npm run docs:tests" et committer.');
    process.exit(1);
  }
  console.log('docs/TESTS.md à jour.');
} else {
  fs.writeFileSync(OUTPUT, content);
  console.log(`docs/TESTS.md généré.`);
}
