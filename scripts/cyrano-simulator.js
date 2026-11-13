#!/usr/bin/env node
/**
 * Simulateur d'appareil de piste Cyrano (EFP1 / EFP1.1), version console (#1720).
 * Comportement de l'appareil : scripts/lib/cyranoDevice.js. Télécommande web à boutons,
 * plusieurs pistes sur une page : scripts/cyrano-remote.js (`npm run cyrano:remote`).
 *
 *   node scripts/cyrano-simulator.js [--server 127.0.0.1] [--server-port 50100]
 *                                    [--port 50101] [--piste 1] [--protocol EFP1.1]
 *                                    [--bind 127.0.0.2]
 * --bind : adresse locale de l'appareil. Le logiciel identifie une piste par son IP :
 *   plusieurs simulateurs sur un même poste → une adresse de bouclage chacun (Linux :
 *   127.0.0.2, 127.0.0.3… sans configuration ; macOS : `sudo ifconfig lo0 alias 127.0.0.2`).
 *
 * Commandes (stdin) : next | prev | begin | end | go | halt | r+ | l+ | r- | l-
 *   | yr | yl | rr | rl (cartons) | pr | pl | pn (priorité) | ar | al (abandon)
 *   | swap (inversion droite/gauche) | reset | show | quit
 * Licensed under GPL-3.0
 */
const readline = require('readline');
const { CyranoDevice, COMMANDS } = require('./lib/cyranoDevice');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

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
