#!/usr/bin/env node
/**
 * Télécommande web des appareils Cyrano simulés (#1720) : plusieurs pistes sur une page,
 * boutons façon télécommande (BEGIN, GO, HALT, END, NEXT, touches, cartons, priorité…),
 * état de l'appareil et journal des trames en direct.
 *
 *   npm run cyrano:remote [-- --pistes 1@127.0.0.1:50101,2@127.0.0.2:50102,3@127.0.0.3:50103]
 *                         [--server 127.0.0.1] [--server-port 50100] [--ui-port 5099]
 *
 * Chaque piste = un appareil simulé (scripts/lib/cyranoDevice.js) sur sa propre adresse de
 * bouclage : le logiciel identifie une piste par son IP. Page : http://127.0.0.1:5099
 * Licensed under GPL-3.0
 */
const http = require('http');
const { CyranoDevice, COMMANDS } = require('./lib/cyranoDevice');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const SERVER = opt('server', '127.0.0.1');
const SERVER_PORT = Number(opt('server-port', 50100));
const UI_PORT = Number(opt('ui-port', 5099));
const PISTES = opt('pistes', '1@127.0.0.1:50101,2@127.0.0.2:50102,3@127.0.0.3:50103')
  .split(',')
  .map(spec => {
    const m = /^([^@]+)@([^:]+):(\d+)$/.exec(spec.trim());
    if (!m) throw new Error(`--pistes : « ${spec} » attendu au format piste@ip:port`);
    return { piste: m[1], bind: m[2], port: Number(m[3]) };
  });

const devices = new Map();
const clients = new Set();
const broadcast = event => {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(data);
};

const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Télécommande Cyrano</title>
<style>
  :root { --bg:#0f1720; --card:#1a2430; --line:#2c3a4a; --text:#e6edf3; --muted:#8b9bb0;
    --red:#e5484d; --green:#30a46c; --yellow:#f5d90a; --accent:#3e8ef7; }
  * { box-sizing: border-box; }
  body { margin:0; padding:16px; background:var(--bg); color:var(--text);
    font:14px/1.4 system-ui, sans-serif; }
  h1 { font-size:18px; margin:0 0 12px; }
  h1 small { color:var(--muted); font-weight:400; }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; }
  .head { display:flex; align-items:center; gap:10px; }
  .head .title { font-weight:700; font-size:16px; }
  .badge { padding:2px 8px; border-radius:99px; font-size:12px; font-weight:600; background:var(--line); }
  .badge.F { background:var(--green); } .badge.H, .badge.P { background:#b8860b; }
  .badge.E { background:var(--red); } .badge.W { background:var(--line); }
  .watch { margin-left:auto; font:700 26px ui-monospace, monospace; }
  .meta { color:var(--muted); font-size:12px; margin:4px 0 10px; }
  .fencers { display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:start; }
  .fencer { border-radius:8px; padding:8px; text-align:center; }
  .fencer.left { background:rgba(229,72,77,.15); border:1px solid var(--red); }
  .fencer.right { background:rgba(48,164,108,.15); border:1px solid var(--green); }
  .side { font-size:11px; color:var(--muted); text-transform:uppercase; }
  .name { font-weight:700; min-height:20px; }
  .score { font:800 44px ui-monospace, monospace; }
  .marks { min-height:22px; display:flex; gap:4px; justify-content:center; }
  .mark { width:16px; height:22px; border-radius:3px; }
  .mark.y { background:var(--yellow); } .mark.r { background:var(--red); }
  .mark.prio { width:auto; height:auto; padding:0 6px; background:var(--accent); font-size:12px; border-radius:4px; }
  .mark.ab { width:auto; height:auto; padding:0 6px; background:#555; font-size:12px; border-radius:4px; }
  .btns { display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; margin-top:8px; }
  .center { display:flex; flex-direction:column; gap:6px; padding-top:22px; }
  button { background:#24313f; color:var(--text); border:1px solid var(--line); border-radius:6px;
    padding:8px 6px; font:600 13px system-ui, sans-serif; cursor:pointer; }
  button:hover:not(:disabled) { border-color:var(--accent); }
  button:active:not(:disabled) { transform:translateY(1px); }
  button:disabled { opacity:.35; cursor:not-allowed; }
  button.main { background:var(--accent); border-color:var(--accent); }
  button.end { background:var(--red); border-color:var(--red); }
  button.go { background:var(--green); border-color:var(--green); }
  .row { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
  .row button { flex:1; }
  .log { margin-top:10px; height:150px; overflow:auto; background:#0b1118; border-radius:6px;
    padding:6px; font:11px/1.35 ui-monospace, monospace; white-space:pre-wrap; word-break:break-all; }
  .log .in { color:#7cc4ff; } .log .out { color:#9be9a8; } .log .note { color:var(--yellow); }
  .help { color:var(--muted); font-size:12px; margin-top:12px; }
</style>
</head>
<body>
<h1>Télécommande Cyrano <small id="srv"></small></h1>
<div class="grid" id="grid"></div>
<p class="help">Un appareil passe en assaut avec <b>BEGIN</b>, le chrono démarre avec <b>GO</b>.
<b>END</b> demande la validation (ACK ou NAK) ; <b>NEXT</b> réclame le match suivant (au repos uniquement).
Gauche = rouge, droite = vert, comme sur l'appareil ; <b>SWAP</b> inverse les côtés.</p>
<script>
const STATES = { W: 'attente', H: 'halte', F: 'assaut', P: 'pause', E: 'fin — attente ACK' };
const cards = new Map();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function send(piste, c) { fetch('/cmd?piste=' + encodeURIComponent(piste) + '&c=' + encodeURIComponent(c), { method: 'POST' }); }
function button(piste, label, c, cls) { const b = el('button', cls, label); b.dataset.cmd = c; b.onclick = () => send(piste, c); return b; }

function fencerBox(piste, side) {
  const box = el('div', 'fencer ' + (side === 'l' ? 'left' : 'right'));
  box.append(el('div', 'side', side === 'l' ? 'gauche' : 'droite'), el('div', 'name'), el('div', 'score', '0'), el('div', 'marks'));
  const btns = el('div', 'btns');
  btns.append(button(piste, '+1', side + '+', 'main'), button(piste, '−1', side + '-'), button(piste, 'Jaune', 'y' + side),
    button(piste, 'Rouge', 'r' + side), button(piste, 'Priorité', 'p' + side), button(piste, 'Abandon', 'a' + side));
  box.append(btns);
  return box;
}

function createCard(snap) {
  const p = snap.piste;
  const card = el('div', 'card');
  const head = el('div', 'head');
  head.append(el('span', 'title', 'Piste ' + p), el('span', 'badge'), el('span', 'watch'));
  const meta = el('div', 'meta');
  const fencers = el('div', 'fencers');
  const center = el('div', 'center');
  center.append(button(p, 'BEGIN', 'begin', 'main'), button(p, 'GO', 'go', 'go'), button(p, 'HALT', 'halt'), button(p, 'END', 'end', 'end'));
  fencers.append(fencerBox(p, 'l'), center, fencerBox(p, 'r'));
  const row = el('div', 'row');
  row.append(button(p, 'NEXT', 'next'), button(p, 'PREV', 'prev'), button(p, 'SWAP', 'swap'), button(p, 'Sans prio', 'pn'), button(p, 'RESET', 'reset'));
  const log = el('div', 'log');
  card.append(head, meta, fencers, row, log);
  document.getElementById('grid').append(card);
  const c = { card, head, meta, fencers, log };
  cards.set(p, c);
  return c;
}

function renderFencer(box, f, isPrio) {
  box.querySelector('.name').textContent = f.name ? f.name + (f.nat ? ' (' + f.nat + ')' : '') : '—';
  box.querySelector('.score').textContent = String(f.score);
  const marks = box.querySelector('.marks');
  marks.replaceChildren();
  if (f.y) marks.append(el('span', 'mark y'));
  for (let i = 0; i < f.r; i++) marks.append(el('span', 'mark r'));
  if (isPrio) marks.append(el('span', 'mark prio', 'P'));
  if (f.status === 'A') marks.append(el('span', 'mark ab', 'abandon'));
}

function render(snap) {
  const c = cards.get(snap.piste) || createCard(snap);
  const badge = c.head.querySelector('.badge');
  badge.className = 'badge ' + snap.state;
  badge.textContent = snap.state + ' · ' + (STATES[snap.state] || '');
  c.head.querySelector('.watch').textContent = snap.stopwatch;
  const g = snap.general;
  c.meta.textContent = (g.phase ? 'Phase ' + g.phase + ' · Poule/Tableau ' + g.poulTab + ' · Match ' + g.match + ' · Arme ' + (g.weapon || '—') + ' · ' : '')
    + snap.protocol + ' · ' + snap.bind + ':' + snap.port;
  const [left, , right] = c.fencers.children;
  renderFencer(left, snap.left, snap.priority === 'L');
  renderFencer(right, snap.right, snap.priority === 'R');
  const active = snap.state !== 'W';
  for (const b of c.card.querySelectorAll('button')) {
    const cmd = b.dataset.cmd;
    let ok = true;
    if (cmd === 'next' || cmd === 'prev') ok = !active;
    else if (cmd === 'begin') ok = !active && !!snap.right.id;
    else if (cmd === 'go') ok = snap.state === 'H' || snap.state === 'P';
    else if (cmd === 'halt') ok = snap.state === 'F';
    else if (cmd === 'end' || cmd === 'pn' || /^[rlyrpa][+\\-rl]$/.test(cmd)) ok = active;
    b.disabled = !ok;
  }
}

function appendLog(piste, entry) {
  const c = cards.get(piste);
  if (!c) return;
  if (entry.dir !== 'note' && / HELLO|\\|HELLO\\|/.test(entry.text)) return; // battements masqués
  const line = el('div', entry.dir, (entry.dir === 'out' ? '→ ' : entry.dir === 'in' ? '← ' : '• ') + entry.text);
  c.log.append(line);
  while (c.log.children.length > 200) c.log.firstChild.remove();
  c.log.scrollTop = c.log.scrollHeight;
}

const es = new EventSource('/events');
es.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'hello') document.getElementById('srv').textContent = '— logiciel ' + msg.server;
  if (msg.type === 'state') render(msg.snap);
  if (msg.type === 'log') appendLog(msg.piste, msg.entry);
};
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', server: `${SERVER}:${SERVER_PORT}` })}\n\n`);
    for (const d of devices.values()) {
      res.write(`data: ${JSON.stringify({ type: 'state', snap: d.snapshot() })}\n\n`);
    }
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }
  if (req.method === 'POST' && url.pathname === '/cmd') {
    const device = devices.get(url.searchParams.get('piste') ?? '');
    const cmd = url.searchParams.get('c') ?? '';
    const ok = !!device && COMMANDS.includes(cmd) && device.command(cmd);
    res.writeHead(ok ? 204 : 400);
    return res.end();
  }
  res.writeHead(404);
  return res.end();
});

(async () => {
  for (const p of PISTES) {
    const d = new CyranoDevice({ ...p, server: SERVER, serverPort: SERVER_PORT });
    d.on('log', entry => broadcast({ type: 'log', piste: d.piste, entry }));
    d.on('change', () => broadcast({ type: 'state', snap: d.snapshot() }));
    try {
      await d.start();
    } catch (err) {
      process.stderr.write(
        `Piste ${p.piste} : impossible d'écouter sur ${p.bind}:${p.port} (${err.message}). ` +
          'Un simulateur console tourne-t-il encore sur ce port ?\n'
      );
      process.exit(1);
    }
    devices.set(d.piste, d);
  }
  server.listen(UI_PORT, '127.0.0.1', () => {
    process.stdout.write(
      `Télécommande Cyrano : http://127.0.0.1:${UI_PORT}  (logiciel ${SERVER}:${SERVER_PORT})\n` +
        PISTES.map(p => `  piste ${p.piste} → ${p.bind}:${p.port}`).join('\n') +
        '\n'
    );
  });
})();
