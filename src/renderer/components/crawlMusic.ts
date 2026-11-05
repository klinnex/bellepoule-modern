/**
 * BellePoule Modern - Bande-son de l'easter egg « Hyperespace »
 * Marche impériale jouée en chocs de lames : pour chaque note, un « swish » de lame
 * fendant l'air puis un « clang » métallique accordé sur la note (partiels inharmoniques
 * de lame d'acier), avec réverbération de salle d'armes. Web Audio uniquement.
 * Licensed under GPL-3.0
 */

/** Marche impériale : [fréquence Hz, départ s, durée s]. */
export const IMPERIAL_MARCH: [number, number, number][] = [
  [392, 0.0, 0.45],
  [392, 0.55, 0.45],
  [392, 1.1, 0.45], // Sol Sol Sol
  [311, 1.65, 0.33],
  [466, 2.05, 0.13],
  [392, 2.2, 0.45], // Mib Sib Sol
  [311, 2.75, 0.33],
  [466, 3.15, 0.13],
  [392, 3.3, 0.6], // Mib Sib Sol
  [587, 4.1, 0.45],
  [587, 4.65, 0.45],
  [587, 5.2, 0.45], // Ré Ré Ré
  [622, 5.75, 0.33],
  [466, 6.15, 0.13],
  [370, 6.3, 0.45], // Mib Sib Solb
  [311, 6.85, 0.33],
  [466, 7.25, 0.13],
  [392, 7.4, 0.6], // Mib Sib Sol
];

/** Partiels d'une lame d'acier frappée : [rapport de fréquence, niveau relatif, décroissance relative]. */
export const BLADE_PARTIALS: [number, number, number][] = [
  [1, 1, 1],
  [2.76, 0.55, 0.7],
  [5.4, 0.35, 0.45],
  [8.93, 0.2, 0.3],
  [13.3, 0.1, 0.2],
];

/** Avance du swish sur le choc (s). */
const SWISH_LEAD = 0.07;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Réverbération : bruit à décroissance exponentielle. */
function makeReverb(ctx: AudioContext, seconds = 1.6): ConvolverNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

/** « Swish » : lame qui fend l'air (bruit, passe-bande montant). */
function swish(ctx: AudioContext, out: AudioNode, at: number, pan: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.12);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(700, at);
  bp.frequency.exponentialRampToValueAtTime(3500, at + SWISH_LEAD);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(0.18, at + SWISH_LEAD * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + SWISH_LEAD + 0.02);
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  src.connect(bp);
  bp.connect(gain);
  gain.connect(panner);
  panner.connect(out);
  src.start(at);
  src.stop(at + 0.12);
}

/** « Clang » : impact (bruit aigu très bref) + résonance métallique accordée sur `freq`. */
function clang(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  dur: number,
  pan: number
): void {
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(out);

  // Impact : claquement du fer contre le fer
  const hit = ctx.createBufferSource();
  hit.buffer = noiseBuffer(ctx, 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const hitGain = ctx.createGain();
  hitGain.gain.setValueAtTime(0.5, at);
  hitGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  hit.connect(hp);
  hp.connect(hitGain);
  hitGain.connect(panner);
  hit.start(at);
  hit.stop(at + 0.05);

  // Résonance : la lame vibre une octave au-dessus de la note, tenue selon la durée
  const ring = Math.max(0.35, dur * 1.6);
  const base = freq * 2;
  BLADE_PARTIALS.forEach(([ratio, level, decay]) => {
    const f = base * ratio;
    if (f > ctx.sampleRate / 2.2) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    // Léger battement : deux lames qui ne vibrent pas exactement pareil
    osc.detune.value = ratio === 1 ? 0 : 7;
    const g = ctx.createGain();
    const end = at + ring * decay;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.12 * level, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(panner);
    osc.start(at);
    osc.stop(end + 0.02);
  });
}

/**
 * Joue la marche impériale en chocs de lames à `start` secondes (relatif à maintenant).
 * Les attaques alternent gauche / droite : deux tireurs qui croisent le fer.
 */
export function playBladeMarch(ctx: AudioContext, start: number): void {
  const t0 = ctx.currentTime + start;
  const master = ctx.createGain();
  master.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.connect(master);
  master.connect(ctx.destination);

  const bus = ctx.createGain();
  const reverb = makeReverb(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  bus.connect(comp);
  bus.connect(reverb);
  reverb.connect(wet);
  wet.connect(comp);

  IMPERIAL_MARCH.forEach(([freq, s, d], i) => {
    const at = t0 + s + SWISH_LEAD;
    const pan = i % 2 === 0 ? -0.45 : 0.45;
    swish(ctx, bus, at - SWISH_LEAD, pan);
    clang(ctx, bus, freq, at, d, -pan * 0.3);
  });
}
