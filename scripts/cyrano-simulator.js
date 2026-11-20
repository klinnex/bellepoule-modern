#!/usr/bin/env node
/**
 * Simulateur d'appareil de piste Cyrano (EFP1 / EFP1.1), version console (#1720).
 * Comportement de l'appareil : scripts/lib/cyranoDevice.js. Télécommande web à boutons,
 * plusieurs pistes sur une page : scripts/cyrano-remote.js (`npm run cyrano:remote`).
 *
 *   node scripts/cyrano-simulator.js [--server 127.0.0.1] [--server-port 50100]
 *                                    [--port 50101] [--piste 1] [--protocol EFP1.1]
 *                                    [--bind 127.0.0.2]
 *                                    [--replay journal.log [--speed 1]]
 * --bind : adresse locale de l'appareil. Le logiciel identifie une piste par son IP :
 *   plusieurs simulateurs sur un même poste → une adresse de bouclage chacun (Linux :
 *   127.0.0.2, 127.0.0.3… sans configuration ; macOS : `sudo ifconfig lo0 alias 127.0.0.2`).
 *
 * Commandes (stdin), calquées sur la télécommande WSG (SG31 / SG32) :
 *   chrono    stopgo | go | halt | pause (minute de repos) | reset (temps de la période)
 *             | round+ | round- | clock+ | clock- (±1 s) | init+ | init- (durée ±1 min)
 *   arme      weapon (cycle) | epee | foil | sabre
 *   priorité  prio (tirage au sort) | pn (P RESET) | pr | pl (imposée, essais)
 *   score     r+ | r- | l+ | l- | yr | yl | yr- | yl- (jaune) | rr | rl | rr- | rl- (rouge)
 *             | swap | zero (0:0) | cards0 (CARDS RESET)
 *   bloc PC   next | prev | begin | end (= validate) | ar | al (abandon) | er | el (expulsion)
 *             | resr | resl (réserve) | mr | ml (médical)
 *   appareil  raz (remise à zéro complète) | show | quit
 * Licensed under GPL-3.0
 */
const fs = require('fs');
const dgram = require('dgram');
const readline = require('readline');
const { CyranoDevice, COMMANDS } = require('./lib/cyranoDevice');
const {
  parseCyranoLog,
  replayPistes,
  selectReplayFrames,
  replaySchedule,
} = require('./lib/cyranoReplay');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

/**
 * Rejeu (#2001) : envoie au logiciel les trames IN (appareil → logiciel) d'un journal exporté du
 * panneau Cyrano, au rythme d'origine (`--speed N` : N fois plus vite). Une piste : `--piste`
 * (obligatoire si le journal en contient plusieurs). Le logiciel identifie la piste par l'IP
 * source : `--bind` = IP de l'appareil du journal (127.0.0.2… en local). Les trames reçues en
 * retour (DISP, ACK, NAK) sont affichées.
 */
function runReplay(file) {
  const { entries, skipped } = parseCyranoLog(fs.readFileSync(file, 'utf8'));
  const pistes = replayPistes(entries);
  const wanted = args.includes('--piste') ? opt('piste', '1') : null;
  if (wanted == null && pistes.length > 1) {
    process.stderr.write(`Journal multi-pistes (${pistes.join(', ')}) : préciser --piste N\n`);
    process.exit(1);
  }
  const speed = Number(opt('speed', 1));
  if (!(speed > 0)) {
    process.stderr.write(`--speed : « ${opt('speed')} », nombre strictement positif attendu\n`);
    process.exit(1);
  }
  const frames = selectReplayFrames(entries, wanted);
  if (frames.length === 0) {
    process.stderr.write('Aucune trame IN à rejouer dans ce journal.\n');
    process.exit(1);
  }
  const schedule = replaySchedule(frames, speed);
  const server = opt('server', '127.0.0.1');
  const serverPort = Number(opt('server-port', 50100));
  const sock = dgram.createSocket('udp4');
  sock.on('message', buf => process.stdout.write(`← ${buf.toString('latin1')}\n`));
  sock.bind(Number(opt('port', 50101)), opt('bind', undefined), () => {
    process.stdout.write(
      `Rejeu de ${frames.length} trame(s) IN${wanted == null ? '' : ` (piste ${wanted})`} vers ${server}:${serverPort}, ` +
        `vitesse x${speed}${skipped ? `, ${skipped} ligne(s) ignorée(s)` : ''}\n`
    );
    let i = 0;
    const next = () => {
      if (i >= schedule.length) {
        // Laisse le temps aux dernières réponses du logiciel avant de quitter
        return setTimeout(() => (sock.close(), process.exit(0)), 1000);
      }
      const { delayMs, raw } = schedule[i++];
      return setTimeout(() => {
        sock.send(raw, serverPort, server);
        process.stdout.write(`→ ${raw}\n`);
        next();
      }, delayMs);
    };
    next();
  });
}

function runDevice() {
  const device = new CyranoDevice({
    server: opt('server', '127.0.0.1'),
    serverPort: Number(opt('server-port', 50100)),
    port: Number(opt('port', 50101)),
    protocol: opt('protocol', 'EFP1.1'),
    piste: opt('piste', '1'),
    bind: opt('bind', undefined),
  });

  device.on('log', ({ dir, text }) => {
    const prefix = dir === 'out' ? '→ ' : dir === 'in' ? '← ' : '  ';
    process.stdout.write(`${prefix}${text}\n`);
  });

  device
    .start()
    .then(() => {
      process.stdout.write(
        `Simulateur Cyrano ${device.protocol} — piste ${device.piste}, écoute UDP ${device.bind ?? '*'}:${device.port}, ` +
          `logiciel ${device.server}:${device.serverPort}\n` +
          `Commandes : ${[...COMMANDS, 'show', 'quit'].join(' ')}\n`
      );
      const rl = readline.createInterface({ input: process.stdin });
      rl.on('line', line => {
        const cmd = line.trim();
        if (!cmd) return;
        if (cmd === 'quit') {
          device.stop();
          process.exit(0);
        }
        if (!device.command(cmd)) process.stdout.write('  commande inconnue\n');
      });
    })
    .catch(err => {
      process.stderr.write(`Impossible d'écouter sur ${device.bind ?? '*'}:${device.port} : ${err.message}\n`);
      process.exit(1);
    });
}

if (args.includes('--replay')) runReplay(opt('replay', ''));
else runDevice();
