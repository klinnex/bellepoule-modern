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

/**
 * Commandes, calquées sur la télécommande WSG des appareils Saint-Georges SG31 / SG32
 * (fonction blanche = touche seule ; jaune / rouge / verte = avec la touche de mode).
 */
const COMMANDS = [
  // Chrono : STOP/GO, PAUSE (minute de repos), RESET (temps initial), ROUND ∧∨,
  // CLOCK ∧∨ (jaune : ±1 s, chrono arrêté), RESET ∧∨ (rouge : temps initial ±1 min)
  'stopgo', 'go', 'halt', 'pause', 'reset', 'round+', 'round-', 'clock+', 'clock-', 'init+', 'init-',
  // Arme : touche arme (cycle) ; jaune + PAUSE / RESET / STOP/GO = épée / fleuret / sabre
  'weapon', 'epee', 'foil', 'sabre',
  // Priorité : ⚄ (tirage au sort), jaune = P RESET ; pr / pl = priorité imposée (essais)
  'prio', 'pn', 'pr', 'pl',
  // Score : ∧ (+1, jaune = carton jaune, rouge = carton rouge) et ∨ (l'inverse)
  'r+', 'r-', 'yr', 'yr-', 'rr', 'rr-',
  'l+', 'l-', 'yl', 'yl-', 'rl', 'rl-',
  // ⟷ (inversion), 0:0, jaune + 0:0 = CARDS RESET
  'swap', 'zero', 'cards0',
  // Bloc PC (vert) : PREVIOUS, BEGIN, NEXT, VALIDATE ; jaune : ABANDON, RESERVE ;
  // rouge : EXPULSION, assistance médicale
  'prev', 'begin', 'next', 'end', 'validate',
  'ar', 'al', 'er', 'el', 'resr', 'resl', 'mr', 'ml',
  // Remise à zéro complète de l'appareil (extinction / rallumage)
  'raz',
];

const WEAPONS = ['E', 'F', 'S'];
const PAUSE_MS = 60000;
const DEFAULT_PERIOD_MS = 180000;

/** Actions sur un tireur : r = droite, l = gauche. */
const FENCER_ACTIONS = {};
for (const side of ['r', 'l']) {
  FENCER_ACTIONS[`${side}+`] = { side, op: '+' };
  FENCER_ACTIONS[`${side}-`] = { side, op: '-' };
  FENCER_ACTIONS[`y${side}`] = { side, op: 'yellow' };
  FENCER_ACTIONS[`y${side}-`] = { side, op: 'yellow-' };
  FENCER_ACTIONS[`r${side}`] = { side, op: 'red' };
  FENCER_ACTIONS[`r${side}-`] = { side, op: 'red-' };
  FENCER_ACTIONS[`p${side}`] = { side, op: 'priority' };
  FENCER_ACTIONS[`a${side}`] = { side, op: 'abandon' };
  FENCER_ACTIONS[`e${side}`] = { side, op: 'expulsion' };
  FENCER_ACTIONS[`res${side}`] = { side, op: 'reserve' };
  FENCER_ACTIONS[`m${side}`] = { side, op: 'medical' };
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
      periodMs: DEFAULT_PERIOD_MS,
      stopwatchMs: DEFAULT_PERIOD_MS,
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
    // Cartons transmis pour un match repris (PREV, appareil redémarré)
    const f = z => ({
      ...emptyFencer(),
      id: z[0] || '',
      name: z[1] || '',
      nat: z[2] || '',
      score: Number(z[3]) || 0,
      y: Number(z[5]) || 0,
      r: Number(z[6]) || 0,
    });
    s.compe = g[3] || '';
    s.general = { phase: g[4] || '', poulTab: g[5] || '', match: g[6] || '', round: g[7] || '', time: g[8] || '', type: g[10] || '', weapon: g[11] || '' };
    s.ref = [g[14] || '', g[15] || '', g[16] || ''];
    if (!s.general.round) s.general.round = '1';
    s.priority = 'N';
    // Chrono transmis pour un match repris (PREV) ; sinon temps de la période
    const watch = /^(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?$/.exec(g[9] || '');
    s.stopwatchMs = watch
      ? (Number(watch[1]) * 60 + Number(watch[2])) * 1000 + Number((watch[3] || '0').padEnd(2, '0')) * 10
      : s.periodMs;
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
      if (z[5] !== undefined && z[5] !== '') f.y = Number(z[5]) || 0;
      if (z[6] !== undefined && z[6] !== '') f.r = Number(z[6]) || 0;
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

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Une seconde de chrono : assaut (F) ou minute de repos (P). */
  tick() {
    const { s } = this;
    s.stopwatchMs = Math.max(0, s.stopwatchMs - 1000);
    if (s.stopwatchMs === 0) {
      this.stopTimer();
      if (s.state === 'P') {
        // Fin du repos : temps de la période rétabli, période suivante (score et cartons gardés)
        s.stopwatchMs = s.periodMs;
        s.general.round = String((Number(s.general.round) || 1) + 1);
        s.state = 'H';
        this.note(`fin de la minute de repos : période ${s.general.round}, GO pour reprendre`);
      } else {
        s.state = 'H';
        this.note('temps écoulé : PAUSE (minute de repos) ou RESET (temps de la période)');
      }
    }
    this.sendInfo();
  }

  /**
   * Commande disponible dans l'état courant ? Renvoie '' si oui, sinon la raison.
   * Même règle pour la console, la télécommande web (boutons grisés) et `command`.
   */
  blocked(name) {
    const { s } = this;
    const active = s.state !== 'W';
    if (name === 'raz' || name === 'weapon' || name === 'epee' || name === 'foil' || name === 'sabre') return '';
    if (name === 'next' || name === 'prev') return active ? 'match en cours (VALIDATE avant)' : '';
    if (name === 'begin') return active ? 'match déjà ouvert' : s.right.id ? '' : 'aucun match chargé (NEXT)';
    if (!active) return 'aucun match ouvert (BEGIN)';
    if (s.state === 'E') return 'fin de match en attente de réponse (ACK / NAK)';
    switch (name) {
      case 'go':
        if (s.state === 'F') return 'chrono déjà lancé';
        if (s.state === 'P') return 'minute de repos en cours (RESET pour l’écourter)';
        return s.stopwatchMs > 0 ? '' : 'temps écoulé : PAUSE ou RESET';
      case 'stopgo':
        if (s.state === 'P') return 'minute de repos en cours (RESET pour l’écourter)';
        return s.state === 'F' || s.stopwatchMs > 0 ? '' : 'temps écoulé : PAUSE ou RESET';
      case 'halt':
        return s.state === 'F' ? '' : 'chrono déjà arrêté';
      case 'pause':
        return s.state === 'P' ? 'minute de repos déjà en cours' : '';
      case 'clock+':
      case 'clock-':
      case 'init+':
      case 'init-':
        return s.state === 'P' ? 'minute de repos en cours (RESET pour l’écourter)' : '';
      default:
        return '';
    }
  }

  /** Exécute une commande de télécommande ; false si inconnue. */
  command(name) {
    const { s } = this;
    if (name === 'validate') name = 'end';
    if (!COMMANDS.includes(name) && name !== 'show') return false;
    if (name === 'show') return this.note(this.infoFrame()), true;
    const why = this.blocked(name);
    if (why) return this.note(`${name.toUpperCase()} impossible : ${why}`), true;
    switch (name) {
      case 'next':
      case 'prev':
        return this.sendCmd(name.toUpperCase()), true;
      case 'begin':
        s.state = 'H';
        break;
      case 'stopgo':
        return this.command(s.state === 'F' ? 'halt' : 'go');
      case 'go':
        s.state = 'F';
        this.startTimer();
        break;
      case 'halt':
        s.state = 'H';
        this.stopTimer();
        break;
      case 'pause':
        // Minute de repos : chrono à 1:00 en décompte, armes testables sans effet sur le score
        s.state = 'P';
        s.stopwatchMs = PAUSE_MS;
        this.startTimer();
        break;
      case 'reset':
        // Temps initial de la période ; score, cartons et période inchangés
        this.stopTimer();
        s.state = 'H';
        s.stopwatchMs = s.periodMs;
        break;
      case 'round+':
      case 'round-': {
        const n = (Number(s.general.round) || 1) + (name === 'round+' ? 1 : -1);
        s.general.round = String(Math.min(99, Math.max(1, n)));
        break;
      }
      case 'clock+':
      case 'clock-':
        // Réglage fin : chrono arrêté, ±1 s
        this.stopTimer();
        if (s.state === 'F') s.state = 'H';
        s.stopwatchMs = Math.min(99 * 60000, Math.max(0, s.stopwatchMs + (name === 'clock+' ? 1000 : -1000)));
        break;
      case 'init+':
      case 'init-':
        // Temps initial ±1 min, chrono remis à cette valeur
        this.stopTimer();
        s.state = 'H';
        s.periodMs = Math.min(99 * 60000, Math.max(60000, s.periodMs + (name === 'init+' ? 60000 : -60000)));
        s.stopwatchMs = s.periodMs;
        break;
      case 'weapon':
        s.general.weapon = WEAPONS[(WEAPONS.indexOf(s.general.weapon) + 1) % WEAPONS.length];
        break;
      case 'epee':
      case 'foil':
      case 'sabre':
        s.general.weapon = { epee: 'E', foil: 'F', sabre: 'S' }[name];
        break;
      case 'prio':
        // ⚄ : tirage au sort de la priorité
        s.priority = Math.random() < 0.5 ? 'R' : 'L';
        this.note(`priorité tirée au sort : ${s.priority === 'R' ? 'droite' : 'gauche'}`);
        break;
      case 'pn':
        s.priority = 'N';
        break;
      case 'end':
        // VALIDATE : fin de match, attente de l'ACK / NAK du logiciel
        s.state = 'E';
        this.stopTimer();
        break;
      case 'swap':
        [s.right, s.left] = [s.left, s.right];
        if (s.priority !== 'N') s.priority = s.priority === 'R' ? 'L' : 'R';
        break;
      case 'zero':
        s.right.score = 0;
        s.left.score = 0;
        break;
      case 'cards0':
        for (const f of [s.right, s.left]) (f.y = 0), (f.r = 0), (f.p = 0);
        break;
      case 'raz':
        // Extinction / rallumage : tireurs, scores, cartons et chrono effacés
        this.stopTimer();
        s.right = emptyFencer();
        s.left = emptyFencer();
        s.state = 'W';
        s.priority = 'N';
        s.periodMs = DEFAULT_PERIOD_MS;
        s.stopwatchMs = DEFAULT_PERIOD_MS;
        s.general.round = '';
        break;
      default:
        this.fencerAction(FENCER_ACTIONS[name]);
    }
    this.sendInfo();
    return true;
  }

  fencerAction({ side, op }) {
    const { s } = this;
    const f = side === 'r' ? s.right : s.left;
    const toggle = st => (f.status = f.status === st ? 'U' : st);
    if (op === '+') f.score = Math.min(99, f.score + 1);
    else if (op === '-') f.score = Math.max(0, f.score - 1);
    else if (op === 'yellow') f.y = 1;
    else if (op === 'yellow-') f.y = 0;
    else if (op === 'red') f.r = Math.min(9, f.r + 1);
    else if (op === 'red-') f.r = Math.max(0, f.r - 1);
    else if (op === 'priority') s.priority = side.toUpperCase();
    else if (op === 'abandon') toggle('A');
    else if (op === 'expulsion') toggle('E');
    else if (op === 'reserve') f.reserve = f.reserve === 'R' ? 'N' : 'R';
    else if (op === 'medical') f.medical = Math.min(9, f.medical + 1);
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
      period: fmtWatch(s.periodMs),
      blocked: Object.fromEntries(COMMANDS.map(c => [c, this.blocked(c)])),
      priority: s.priority,
      general: s.general,
      right: { ...s.right },
      left: { ...s.left },
    };
  }
}

module.exports = { CyranoDevice, COMMANDS };
