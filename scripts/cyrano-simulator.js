#!/usr/bin/env node
/**
 * Simulateur d'appareil de piste Cyrano (EFP1 / EFP1.1) pour le développement (#1720).
 * Se comporte comme un appareil : répond aux HELLO par un INFO complet, installe les DISP
 * en attente (match en cours : DISP des mêmes tireurs = correction des scores),
 * envoie NEXT / PREV / INFO, passe en W à la réception d'un ACK.
 *
 *   node scripts/cyrano-simulator.js [--server 127.0.0.1] [--server-port 50100]
 *                                    [--port 50101] [--piste 1] [--protocol EFP1.1]
 *
 * Commandes (stdin) : next | prev | begin | end | go | halt | r+ | l+ | r- | l-
 *   | yr | yl | rr | rl (cartons) | pr | pl | pn (priorité) | ar | al (abandon)
 *   | swap (inversion droite/gauche) | reset | show | quit
 * Licensed under GPL-3.0
 */
const dgram = require('dgram');
const readline = require('readline');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SERVER = opt('server', '127.0.0.1');
const SERVER_PORT = Number(opt('server-port', 50100));
const PORT = Number(opt('port', 50101));
let protocol = opt('protocol', 'EFP1.1');
const PISTE = opt('piste', '1');

const emptyFencer = () => ({
  id: '',
  name: '',
  nat: '',
  score: 0,
  status: 'U',
  y: 0,
  r: 0,
  light: 0,
  white: 0,
  medical: 0,
  reserve: 'N',
  p: 0,
});

const s = {
  compe: '',
  general: { phase: '', poulTab: '', match: '', round: '', time: '', type: '', weapon: '' },
  ref: ['', '', ''],
  stopwatchMs: 180000,
  priority: 'N',
  state: 'W',
  right: emptyFencer(),
  left: emptyFencer(),
};

const fmtWatch = ms => {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  if (total < 10000) return `${m}:${String(sec).padStart(2, '0')}.${String(Math.floor((total % 1000) / 10)).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const fencerZone = f => {
  const z = [f.id, f.name, f.nat, f.score, f.status, f.y, f.r, f.light, f.white, f.medical, f.reserve];
  if (protocol === 'EFP1.1') z.push(f.p);
  return `|${z.join('|')}|`;
};

function infoFrame() {
  const g = s.general;
  const general = [protocol, 'INFO', PISTE, s.compe, g.phase, g.poulTab, g.match, g.round, g.time,
    fmtWatch(s.stopwatchMs), g.type, g.weapon, s.priority, s.state, ...s.ref];
  return `|${general.join('|')}|%${fencerZone(s.right)}%${fencerZone(s.left)}%|`;
}

const sock = dgram.createSocket('udp4');
const send = raw => {
  sock.send(raw, SERVER_PORT, SERVER);
  process.stdout.write(`→ ${raw}\n`);
};
const sendInfo = () => send(infoFrame());
const sendCmd = cmd => send(`|${protocol}|${cmd}|${PISTE}|${s.compe}|%|`);

function parse(raw) {
  const zones = raw.trim().split('%').map(z => z.replace(/^\|/, '').replace(/\|$/, '').split('|'));
  return { g: zones[0] || [], r: zones[1] || [], l: zones[2] || [] };
}

function installDisp({ g, r, l }) {
  const f = z => ({ ...emptyFencer(), id: z[0] || '', name: z[1] || '', nat: z[2] || '', score: Number(z[3]) || 0 });
  s.compe = g[3] || '';
  s.general = { phase: g[4] || '', poulTab: g[5] || '', match: g[6] || '', round: g[7] || '', time: g[8] || '', type: g[10] || '', weapon: g[11] || '' };
  s.ref = [g[14] || '', g[15] || '', g[16] || ''];
  s.priority = 'N';
  s.stopwatchMs = 180000;
  s.right = f(r);
  s.left = f(l);
  process.stdout.write(s.right.id ? `  match ${s.right.name} – ${s.left.name}\n` : '  aucun match disponible\n');
}

// Match en cours : un DISP des mêmes tireurs corrige les scores (correction depuis la tablette)
function applyCorrection({ r, l }) {
  const same = [r, l].every(z => [s.right, s.left].some(x => x.id && x.id === z[0]));
  if (!same) return process.stdout.write('  DISP ignoré (match en cours)\n');
  for (const z of [r, l]) {
    const f = [s.right, s.left].find(x => x.id === z[0]);
    if (z[3] !== undefined && z[3] !== '') f.score = Number(z[3]) || 0;
  }
  process.stdout.write(`  scores corrigés : ${s.right.score} – ${s.left.score}\n`);
  sendInfo();
}

sock.on('message', buf => {
  const raw = buf.toString('latin1');
  process.stdout.write(`← ${raw}\n`);
  const m = parse(raw);
  if (m.g[0] === 'EFP1' || m.g[0] === 'EFP1.1') protocol = m.g[0];
  switch (m.g[1]) {
    case 'HELLO':
      s.compe = s.compe || m.g[3] || '';
      return sendInfo();
    case 'DISP':
      if (s.state === 'W') installDisp(m);
      else applyCorrection(m);
      return undefined;
    case 'ACK':
      if (s.state !== 'W') {
        s.state = 'W';
        sendInfo();
      }
      return undefined;
    case 'NAK':
      process.stdout.write('  END refusé\n');
      return undefined;
    default:
      return undefined;
  }
});

let timer = null;
const tick = () => {
  s.stopwatchMs -= 1000;
  if (s.stopwatchMs <= 0) {
    s.stopwatchMs = 0;
    s.state = 'H';
    clearInterval(timer);
    timer = null;
  }
  sendInfo();
};

const fencerOf = side => (side === 'r' ? s.right : s.left);
const active = () => s.state !== 'W';
const commands = {
  next: () => !active() && sendCmd('NEXT'),
  prev: () => !active() && sendCmd('PREV'),
  begin: () => {
    if (active()) return;
    s.state = 'H';
    sendInfo();
  },
  end: () => {
    if (!active()) return;
    s.state = 'E';
    if (timer) clearInterval(timer);
    timer = null;
    sendInfo();
  },
  go: () => {
    if (s.state !== 'H') return;
    s.state = 'F';
    timer = setInterval(tick, 1000);
    sendInfo();
  },
  halt: () => {
    if (s.state !== 'F') return;
    s.state = 'H';
    clearInterval(timer);
    timer = null;
    sendInfo();
  },
  swap: () => {
    [s.right, s.left] = [s.left, s.right];
    if (s.priority !== 'N') s.priority = s.priority === 'R' ? 'L' : 'R';
    sendInfo();
  },
  reset: () => {
    s.right = { ...emptyFencer() };
    s.left = { ...emptyFencer() };
    s.state = 'W';
    sendInfo();
  },
  show: () => process.stdout.write(`  ${infoFrame()}\n`),
  quit: () => {
    sock.close();
    process.exit(0);
  },
};
for (const side of ['r', 'l']) {
  commands[`${side}+`] = () => active() && (fencerOf(side).score++, sendInfo());
  commands[`${side}-`] = () => active() && fencerOf(side).score > 0 && (fencerOf(side).score--, sendInfo());
  commands[`y${side}`] = () => active() && ((fencerOf(side).y = 1), sendInfo());
  commands[`r${side}`] = () => active() && (fencerOf(side).r++, sendInfo());
  commands[`p${side}`] = () => active() && ((s.priority = side.toUpperCase()), sendInfo());
  commands[`a${side}`] = () => active() && ((fencerOf(side).status = 'A'), sendInfo());
}
commands.pn = () => active() && ((s.priority = 'N'), sendInfo());

sock.bind(PORT, () => {
  process.stdout.write(
    `Simulateur Cyrano ${protocol} — piste ${PISTE}, écoute UDP ${PORT}, logiciel ${SERVER}:${SERVER_PORT}\n` +
      `Commandes : ${Object.keys(commands).join(' ')}\n`
  );
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', line => {
    const cmd = commands[line.trim()];
    if (cmd) cmd();
    else if (line.trim()) process.stdout.write('  commande inconnue\n');
  });
});
