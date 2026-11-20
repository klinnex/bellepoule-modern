/**
 * Module kiosque /js/kioskBracketRender.js (#1401) : badge, géométrie et gabarit du tableau compact.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const B = req('./kioskBracketRender.js');

const esc = (v: unknown) =>
  v == null
    ? ''
    : String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
const f = (id: string, lastName: string, firstName = '') => ({ id, lastName, firstName });
const dims = { cardW: 100, cardH: 40, colGap: 20, rowGap: 10 };

const semis = {
  tableSize: 4,
  currentRound: 4,
  rounds: [
    {
      round: 4,
      label: 'Demi',
      matches: [
        {
          position: 1,
          status: 'finished',
          fencerA: f('a', 'Dupont', 'Jean'),
          fencerB: f('b', 'Martin'),
          winnerId: 'a',
          scoreA: 15,
          scoreB: 9,
        },
        {
          position: 2,
          status: 'live',
          fencerA: f('c', 'Durand'),
          fencerB: f('d', 'Petit'),
          arenaName: 'Piste 2',
        },
      ],
    },
    {
      round: 2,
      label: 'Finale',
      matches: [
        { position: 1, status: 'pending', fencerA: f('a', 'Dupont', 'Jean'), winnerId: 'a' },
      ],
    },
  ],
};

describe('kioskBracketRender.js', () => {
  it('bracketBadge : joués / total, byes exclus', () => {
    const data = {
      tableSize: 8,
      rounds: [
        {
          matches: [
            { status: 'finished' },
            { status: 'pending' },
            { status: 'pending', isBye: true },
          ],
        },
      ],
    };
    expect(B.bracketBadge(data)).toBe('T8 · 1/2');
  });

  it('géométrie : taille naturelle, centres des matchs, colonnes', () => {
    const { layout } = B.buildCompactBracket(semis, semis.rounds, dims, Infinity, esc);
    expect(layout.cardW).toBe(100);
    expect(layout.colX).toEqual([10, 130]);
    expect(layout.totalW).toBe(2 * 120 + 20);
    expect(layout.totalH).toBe(2 * 50);
    expect(layout.yCenter(1, 4)).toBe(layout.totalH / 4);
    expect(layout.matchTop).toBe(34);
    expect(layout.innerH).toBe(34 + 100);
    expect(layout.currentRound).toBe(4);
  });

  it('réduction à la hauteur disponible', () => {
    const { layout } = B.buildCompactBracket(semis, semis.rounds, dims, 50, esc);
    expect(layout.totalH).toBe(50);
    expect(layout.cardW).toBe(50);
    expect(layout.cardH).toBe(20);
  });

  it('gabarit : cartes, vainqueur, score, arène, connecteurs, bandeau finale', () => {
    const { html } = B.buildCompactBracket(semis, semis.rounds, dims, Infinity, esc);
    expect(html).toContain('match--finished');
    expect(html).toContain('match--live');
    expect(html).toContain('Dupont J.');
    expect(html).toContain('bm-winner');
    expect(html).toContain('bm-loser');
    expect(html).toContain('<div class="bm-arena">Piste 2</div>');
    expect(html).toContain('bracket-round-label active-round');
    expect(html).toContain('<path d="M110,25');
    expect(html).toContain('Dupont Jean');
    expect(html).toContain('TBD'); // finale sans second tireur
  });

  it('petite finale : pas de connecteur vers ou depuis le round 3', () => {
    const rounds = [
      {
        round: 4,
        label: 'D',
        matches: [{ position: 1, fencerA: f('a', 'A'), fencerB: f('b', 'B') }],
      },
      {
        round: 3,
        label: 'PF',
        matches: [{ position: 1, fencerA: f('c', 'C'), fencerB: f('d', 'D') }],
      },
      {
        round: 2,
        label: 'F',
        matches: [{ position: 1, fencerA: f('a', 'A'), fencerB: f('c', 'C') }],
      },
    ];
    const { html } = B.buildCompactBracket({ rounds }, rounds, dims, Infinity, esc);
    expect(html).not.toContain('<path');
  });

  it('XSS : noms et arène échappés, byes ignorés', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const rounds = [
      {
        round: 2,
        label: evil,
        matches: [
          {
            position: 1,
            fencerA: f('a', evil, evil),
            fencerB: f('b', 'B'),
            arenaName: evil,
            scoreA: evil,
          },
          { position: 2, isBye: true, fencerA: f('z', 'BYE') },
        ],
      },
    ];
    const { html } = B.buildCompactBracket({ rounds }, rounds, dims, Infinity, esc);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('BYE');
  });

  it('kiosk.html charge le module et délègue', () => {
    const html =
      fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'kioskApp.js'), 'utf8'); // page + script extrait (#1600)
    expect(html).toContain('<script src="/js/kioskBracketRender.js"></script>');
    expect(html).toContain('KioskBracketRender.buildCompactBracket(');
    expect(html).not.toContain('class="bracket-trophy-banner">');
  });
});
