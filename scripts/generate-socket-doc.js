#!/usr/bin/env node
/**
 * Génère docs/SOCKET_EVENTS.md : contrat Socket.IO entre le serveur distant
 * (src/main/remoteScoreServer.ts + modules src/main/remote/*.ts) et les pages tablettes / écrans (src/remote/*.html).
 *
 *   node scripts/generate-socket-doc.js          → réécrit docs/SOCKET_EVENTS.md
 *   node scripts/generate-socket-doc.js --check  → échoue (exit 1) si la doc n'est
 *                                                  plus à jour
 *
 * Extraction : AST TypeScript côté serveur (socket.on / *.emit), regex côté pages
 * (socket.on / socket.emit). Les segments dynamiques (`arena:${id}:update`)
 * deviennent `{…}`. Les actions `arena_control` sont lues dans les `case` de
 * handleArenaControl. Sortie déterministe (pas de date, pas de numéro de ligne).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'src', 'main', 'remoteScoreServer.ts');
// Modules extraits du serveur (gestionnaires Socket.IO, arena_control…, #1240)
const SERVER_MODULES_DIR = path.join(ROOT, 'src', 'main', 'remote');
const REMOTE_DIR = path.join(ROOT, 'src', 'remote');
const OUTPUT = path.join(ROOT, 'docs', 'SOCKET_EVENTS.md');
// Événements du cycle de vie Socket.IO, documentés à part
const LIFECYCLE = new Set(['connection', 'connect', 'disconnect', 'connect_error', 'error']);

function eventName(arg, sf) {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    return arg.head.text + arg.templateSpans.map(s => '{…}' + s.literal.text).join('');
  }
  return null;
}

function serverFiles() {
  const modules = fs
    .readdirSync(SERVER_MODULES_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort()
    .map(f => path.join(SERVER_MODULES_DIR, f));
  return [SERVER, ...modules];
}

function analyzeServer() {
  const listens = new Set();
  const emits = new Set();
  const arenaActions = new Set();

  let sf;
  function visit(node, inArenaControl) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const target = node.expression.expression.getText(sf);
      const name = eventName(node.arguments[0], sf);
      if (name) {
        if (method === 'on' && /(^|\.)socket$/.test(target)) listens.add(name);
        if (method === 'emit') emits.add(name);
      }
    }
    let inside = inArenaControl;
    const isFn = ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node);
    if (isFn && node.name && node.name.getText(sf) === 'handleArenaControl') inside = true;
    if (inside && ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      arenaActions.add(node.expression.text);
    }
    ts.forEachChild(node, child => visit(child, inside));
  }
  for (const file of serverFiles()) {
    sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    visit(sf, false);
  }
  return { listens, emits, arenaActions };
}

function analyzePages() {
  const pageEmits = new Map(); // event → Set(page)
  const pageListens = new Map();
  const add = (map, key, page) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(page);
  };
  const pages = fs.readdirSync(REMOTE_DIR).filter(f => f.endsWith('.html')).sort();
  for (const page of pages) {
    const html = fs.readFileSync(path.join(REMOTE_DIR, page), 'utf8');
    const re = /\.(emit|on)\(\s*(['"`])([^'"`]+)\2/g;
    let m;
    while ((m = re.exec(html))) {
      // Ne garder que les appels sur un objet socket (socket.emit, this.socket.on, sock.on…)
      const before = html.slice(Math.max(0, m.index - 20), m.index);
      if (!/sock(et)?$/i.test(before)) continue;
      let name = m[3].replace(/\$\{[^}]*\}/g, '{…}');
      // Concaténation : 'arena:' + id + ':update'
      const concat = /^\s*\+\s*[\w.()]+\s*(?:\+\s*(['"])([^'"]*)\1)?/.exec(html.slice(re.lastIndex));
      if (concat) name += '{…}' + (concat[2] || '');
      add(m[1] === 'emit' ? pageEmits : pageListens, name, page);
    }
  }
  return { pageEmits, pageListens };
}

function list(set) {
  return set && set.size ? [...set].sort().map(p => `\`${p}\``).join(', ') : '—';
}

function generate() {
  const { listens, emits, arenaActions } = analyzeServer();
  const { pageEmits, pageListens } = analyzePages();

  const clientToServer = [...new Set([...listens, ...pageEmits.keys()])].filter(e => !LIFECYCLE.has(e)).sort();
  const serverToClient = [...new Set([...emits, ...pageListens.keys()])].filter(e => !LIFECYCLE.has(e)).sort();

  const problems = [];
  let md = `# Événements Socket.IO

> ⚠️ Fichier **généré** par \`npm run docs:socket\` (\`scripts/generate-socket-doc.js\`).
> Ne pas éditer à la main. La CI échoue (\`npm run check:socket-doc\`) s'il n'est
> pas régénéré après ajout / suppression d'un événement.

Serveur : \`src/main/remoteScoreServer.ts\` + \`src/main/remote/*.ts\` (Express 5 + Socket.IO, port 8066).
Clients : pages \`src/remote/*.html\`. \`{…}\` = segment dynamique (n° d'arène, de poule…).
Guide fonctionnel : [ARBITRAGE.md](ARBITRAGE.md), [REMOTE_SCORE_GUIDE.md](../REMOTE_SCORE_GUIDE.md).

## Client → serveur

| Événement | Écouté par le serveur | Émis par |
|---|:---:|---|
`;
  for (const e of clientToServer) {
    const handled = listens.has(e);
    if (!handled) problems.push(`émis par une page mais non écouté par le serveur : ${e}`);
    md += `| \`${e}\` | ${handled ? '✓' : '✗'} | ${list(pageEmits.get(e))} |\n`;
  }

  md += `
### Actions \`arena_control\`

Champ \`action\` de l'événement \`arena_control\` (\`handleArenaControl\`) :
${[...arenaActions].sort().map(a => `\`${a}\``).join(', ')}.

## Serveur → client

| Événement | Émis par le serveur | Écouté par |
|---|:---:|---|
`;
  for (const e of serverToClient) {
    md += `| \`${e}\` | ${emits.has(e) ? '✓' : '✗'} | ${list(pageListens.get(e))} |\n`;
  }

  md += `
✗ dans « Émis par le serveur » : écouté par une page mais jamais émis tel quel
(nom construit autrement, ou événement mort côté page).
`;
  return { md, problems };
}

const { md, problems } = generate();

if (process.argv.includes('--check')) {
  let failed = false;
  for (const p of problems) {
    failed = true;
    console.error(`✗ ${p}`);
  }
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== md) {
    failed = true;
    console.error('✗ docs/SOCKET_EVENTS.md pas à jour : lancer "npm run docs:socket" puis committer.');
  }
  if (failed) process.exit(1);
  console.log('✓ docs/SOCKET_EVENTS.md à jour.');
} else {
  fs.writeFileSync(OUTPUT, md);
  console.log(`docs/SOCKET_EVENTS.md généré.${problems.length ? ' Problèmes :\n  ' + problems.join('\n  ') : ''}`);
}
