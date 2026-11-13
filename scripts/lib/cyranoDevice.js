/**
 * Appareil de piste Cyrano simulé (EFP1 / EFP1.1), partagé par le simulateur console
 * (scripts/cyrano-simulator.js) et la télécommande web (scripts/cyrano-remote.js) — #1720.
 * Répond aux HELLO par un INFO complet, installe les DISP en état W (match en cours :
 * DISP des mêmes tireurs = correction des scores), envoie NEXT / PREV / INFO, passe en W
 * à la réception d'un ACK.
 * Événements : `log` ({ dir: 'in' | 'out' | 'note', text }), `change` (état modifié).
 * Licensed under GPL-3.0
 */
const dgram = require('dgram');
const { EventEmitter } = require('events');

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

const fmtWatch = ms => {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  if (total < 10000) {
    return `${m}:${String(sec).padStart(2, '0')}.${String(Math.floor((total % 1000) / 10)).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
};

function parse(raw) {
  const zones = raw
    .trim()
    .split('%')
    .map(z => z.replace(/^\|/, '').replace(/\|$/, '').split('|'));
  return { g: zones[0] || [], r: zones[1] || [], l: zones[2] || [] };
}

/** Commandes de la télécommande, dans l'ordre d'affichage. */
const COMMANDS = [
  'next', 'prev', 'begin', 'go', 'halt', 'end', 'swap', 'reset',
  'r+', 'r-', 'yr', 'rr', 'pr', 'ar',
  'l+', 'l-', 'yl', 'rl', 'pl', 'al',
  'pn',
];

/** Actions sur un tireur : r = droite, l = gauche. */
const FENCER_ACTIONS = {};
for (const side of ['r', 'l']) {
  FENCER_ACTIONS[`${side}+`] = { side, op: '+' };
  FENCER_ACTIONS[`${side}-`] = { side, op: '-' };
  FENCER_ACTIONS[`y${side}`] = { side, op: 'yellow' };
  FENCER_ACTIONS[`r${side}`] = { side, op: 'red' };
  FENCER_ACTIONS[`p${side}`] = { side, op: 'priority' };
  FENCER_ACTIONS[`a${side}`] = { side, op: 'abandon' };
}

class CyranoDevice extends EventEmitter {
  /**
   * @param {{piste?: string, port?: number, bind?: string, server?: string,
   *   serverPort?: number, protocol?: string}} opts
   */
  constructor(opts = {}) {
    super();
    this.piste = String(opts.piste ?? '1');
    this.port = Number(opts.port ?? 50101);
    this.bind = opts.bind;
    this.server = opts.server ?? '127.0.0.1';
    this.serverPort = Number(opts.serverPort ?? 50100);
    this.protocol = opts.protocol ?? 'EFP1.1';
    this.timer = null;
    this.sock = null;
    this.s = {
      compe: '',
      general: { phase: '', poulTab: '', match: '', round: '', time: '', type: '', weapon: '' },
      ref: ['', '', ''],
      stopwatchMs: 180000,
      priority: 'N',
      state: 'W',
      right: emptyFencer(),
      left: emptyFencer(),
    };
  }

  start() {
    return new Promise((resolve, reject) => {
      this.sock = dgram.createSocket('udp4');
      this.sock.once('error', reject);
      this.sock.on('message', buf => this.receive(buf.toString('latin1')));
      this.sock.bind(this.port, this.bind, () => {
        this.sock.off('error', reject);
        resolve();
      });
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sock?.close();
    this.sock = null;
  }

  note(text) {
    this.emit('log', { dir: 'note', text });
  }

  fencerZone(f) {
    const z = [f.id, f.name, f.nat, f.score, f.status, f.y, f.r, f.light, f.white, f.medical, f.reserve];
    if (this.protocol === 'EFP1.1') z.push(f.p);
    return `|${z.join('|')}|`;
  }

  infoFrame() {
    const { s } = this;
    const g = s.general;
    const general = [this.protocol, 'INFO', this.piste, s.compe, g.phase, g.poulTab, g.match, g.round,
      g.time, fmtWatch(s.stopwatchMs), g.type, g.weapon, s.priority, s.state, ...s.ref];
    return `|${general.join('|')}|%${this.fencerZone(s.right)}%${this.fencerZone(s.left)}%|`;
  }

  send(raw) {
    this.sock?.send(raw, this.serverPort, this.server);
    this.emit('log', { dir: 'out', text: raw });
  }

  sendInfo() {
    this.send(this.infoFrame());
    this.emit('change');
  }

  sendCmd(cmd) {
    this.send(`|${this.protocol}|${cmd}|${this.piste}|${this.s.compe}|%|`);
  }

  installDisp({ g, r, l }) {
    const { s } = this;
    const f = z => ({ ...emptyFencer(), id: z[0] || '', name: z[1] || '', nat: z[2] || '', score: Number(z[3]) || 0 });
    s.compe = g[3] || '';
    s.general = { phase: g[4] || '', poulTab: g[5] || '', match: g[6] || '', round: g[7] || '', time: g[8] || '', type: g[10] || '', weapon: g[11] || '' };
    s.ref = [g[14] || '', g[15] || '', g[16] || ''];
    s.priority = 'N';
    s.stopwatchMs = 180000;
    s.right = f(r);
    s.left = f(l);
    this.note(s.right.id ? `match ${s.right.name} – ${s.left.name}` : 'aucun match disponible');
    this.emit('change');
  }

  /** Match en cours : un DISP des mêmes tireurs corrige les scores (correction depuis la tablette). */
  applyCorrection({ r, l }) {
    const { s } = this;
    const same = [r, l].every(z => [s.right, s.left].some(x => x.id && x.id === z[0]));
    if (!same) return this.note('DISP ignoré (match en cours)');
    for (const z of [r, l]) {
      const f = [s.right, s.left].find(x => x.id === z[0]);
      if (z[3] !== undefined && z[3] !== '') f.score = Number(z[3]) || 0;
    }
    this.note(`scores corrigés : ${s.right.score} – ${s.left.score}`);
    return this.sendInfo();
  }

  receive(raw) {
    const { s } = this;
    this.emit('log', { dir: 'in', text: raw });
    const m = parse(raw);
    if (m.g[0] === 'EFP1' || m.g[0] === 'EFP1.1') this.protocol = m.g[0];
    switch (m.g[1]) {
      case 'HELLO':
        s.compe = s.compe || m.g[3] || '';
        return this.sendInfo();
      case 'DISP':
        return s.state === 'W' ? this.installDisp(m) : this.applyCorrection(m);
      case 'ACK':
        this.note('fin de match acquittée (ACK)');
        if (s.state !== 'W') {
          s.state = 'W';
          this.sendInfo();
        }
        return undefined;
      case 'NAK':
        this.note('END refusé (NAK)');
        return this.emit('change');
      default:
        return undefined;
    }
  }

  tick() {
    const { s } = this;
    s.stopwatchMs -= 1000;
    if (s.stopwatchMs <= 0) {
      s.stopwatchMs = 0;
      s.state = 'H';
      clearInterval(this.timer);
      this.timer = null;
    }
    this.sendInfo();
  }

  /** Exécute une commande de télécommande ; false si inconnue. */
  command(name) {
    const { s } = this;
    const active = s.state !== 'W';
    const stopTimer = () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    };
    switch (name) {
      case 'next':
      case 'prev':
        if (active) return this.note(`${name.toUpperCase()} impossible : match en cours`), true;
        return this.sendCmd(name.toUpperCase()), true;
      case 'begin':
        if (!active) (s.state = 'H'), this.sendInfo();
        return true;
      case 'go':
        if (s.state === 'H' || s.state === 'P') {
          s.state = 'F';
          stopTimer();
          this.timer = setInterval(() => this.tick(), 1000);
          this.sendInfo();
        }
        return true;
      case 'halt':
        if (s.state === 'F') (s.state = 'H'), stopTimer(), this.sendInfo();
        return true;
      case 'end':
        if (active) (s.state = 'E'), stopTimer(), this.sendInfo();
        return true;
      case 'swap':
        [s.right, s.left] = [s.left, s.right];
        if (s.priority !== 'N') s.priority = s.priority === 'R' ? 'L' : 'R';
        this.sendInfo();
        return true;
      case 'reset':
        stopTimer();
        s.right = emptyFencer();
        s.left = emptyFencer();
        s.state = 'W';
        s.stopwatchMs = 180000;
        this.sendInfo();
        return true;
      case 'pn':
        if (active) (s.priority = 'N'), this.sendInfo();
        return true;
      case 'show':
        this.note(this.infoFrame());
        return true;
      default:
        break;
    }
    const action = FENCER_ACTIONS[name];
    if (!action) return false;
    if (!active) return this.note('appuyer sur BEGIN avant de saisir'), true;
    const f = action.side === 'r' ? s.right : s.left;
    if (action.op === '+') f.score++;
    else if (action.op === '-') f.score = Math.max(0, f.score - 1);
    else if (action.op === 'yellow') f.y = 1;
    else if (action.op === 'red') f.r++;
    else if (action.op === 'priority') s.priority = action.side.toUpperCase();
    else if (action.op === 'abandon') f.status = 'A';
    this.sendInfo();
    return true;
  }

  snapshot() {
    const { s } = this;
    return {
      piste: this.piste,
      port: this.port,
      bind: this.bind ?? '*',
      protocol: this.protocol,
      state: s.state,
      stopwatch: fmtWatch(s.stopwatchMs),
      priority: s.priority,
      general: s.general,
      right: { ...s.right },
      left: { ...s.left },
    };
  }
}

module.exports = { CyranoDevice, COMMANDS };
