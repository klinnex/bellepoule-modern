import { describe, it, expect } from 'vitest';
import {
  hungarian,
  neutralityConflicts,
  refereeLevelFromCategory,
  solveRefereeMatching,
  MatchingReferee,
  MatchingSlot,
} from './refereeMatching';

describe('hungarian', () => {
  it('trouve l’affectation de coût minimal', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const r = hungarian(cost);
    const total = r.reduce((s, c, i) => s + cost[i][c], 0);
    expect(total).toBe(5);
    expect(new Set(r).size).toBe(3);
  });

  it('matrice vide', () => {
    expect(hungarian([])).toEqual([]);
  });
});

describe('neutralityConflicts', () => {
  const slot: MatchingSlot = {
    id: 'p',
    clubs: ['Lyon', 'Paris'],
    nationalities: ['FRA', 'ITA'],
    regions: ['AURA'],
  };
  it('club, nationalité et ligue selon les règles', () => {
    const ref: MatchingReferee = { id: 'r', club: 'lyon ', nationality: 'ITA', region: 'AURA' };
    expect(
      neutralityConflicts(ref, slot, { club: true, nationality: false, region: false })
    ).toEqual(['club']);
    expect(neutralityConflicts(ref, slot, { club: true, nationality: true, region: true })).toEqual(
      ['club', 'nationality', 'region']
    );
    expect(
      neutralityConflicts(ref, slot, { club: false, nationality: false, region: false })
    ).toEqual([]);
  });
  it('arbitre sans club : neutre', () => {
    expect(
      neutralityConflicts({ id: 'r' }, slot, { club: true, nationality: true, region: true })
    ).toEqual([]);
  });
});

describe('solveRefereeMatching', () => {
  it('exemple de l’issue : P1/P2/R1/R2, deux poules neutres (le glouton échoue)', () => {
    const slots: MatchingSlot[] = [
      { id: 'P1', clubs: ['A', 'B'], strength: 1 },
      { id: 'P2', clubs: ['A', 'C'], strength: 0 },
    ];
    const refs: MatchingReferee[] = [
      { id: 'R1', club: 'C', level: 0.33 },
      { id: 'R2', club: 'X', level: 0.66 },
    ];
    const res = solveRefereeMatching(slots, refs);
    expect(res.assignments.get('P1')).toBe('R1');
    expect(res.assignments.get('P2')).toBe('R2');
    expect(res.unassignedSlotIds).toEqual([]);
    expect(res.shortages).toEqual([]);
  });

  it('met les meilleurs arbitres sur les poules les plus relevées', () => {
    const slots: MatchingSlot[] = [
      { id: 'faible', clubs: [], strength: 0 },
      { id: 'forte', clubs: [], strength: 1 },
    ];
    const refs: MatchingReferee[] = [
      { id: 'inter', level: 1 },
      { id: 'debutant', level: 0 },
    ];
    const res = solveRefereeMatching(slots, refs);
    expect(res.assignments.get('forte')).toBe('inter');
    expect(res.assignments.get('faible')).toBe('debutant');
  });

  it('rotation : préfère l’arbitre qui a le moins arbitré', () => {
    const res = solveRefereeMatching(
      [{ id: 'P', clubs: [] }],
      [
        { id: 'charge', matchesToday: 10 },
        { id: 'frais', matchesToday: 0 },
      ]
    );
    expect(res.assignments.get('P')).toBe('frais');
  });

  it('stabilité : garde l’arbitre sur sa piste', () => {
    const res = solveRefereeMatching(
      [
        { id: 'P1', clubs: [], strip: 1 },
        { id: 'P2', clubs: [], strip: 2 },
      ],
      [
        { id: 'R2', previousStrip: 2 },
        { id: 'R1', previousStrip: 1 },
      ]
    );
    expect(res.assignments.get('P1')).toBe('R1');
    expect(res.assignments.get('P2')).toBe('R2');
  });

  it('écarte les arbitres indisponibles et au plafond', () => {
    const res = solveRefereeMatching(
      [{ id: 'P', clubs: [] }],
      [
        { id: 'absent', available: false },
        { id: 'plein', maxMatchesPerDay: 3, matchesToday: 3 },
      ]
    );
    expect(res.assignments.size).toBe(0);
    expect(res.unassignedSlotIds).toEqual(['P']);
  });

  it('neutralité de nationalité (épreuve internationale)', () => {
    const slots: MatchingSlot[] = [
      { id: 'P1', clubs: ['A'], nationalities: ['FRA', 'ITA'] },
      { id: 'P2', clubs: ['B'], nationalities: ['GER', 'HUN'] },
    ];
    const refs: MatchingReferee[] = [
      { id: 'fr', nationality: 'FRA' },
      { id: 'hu', nationality: 'HUN' },
    ];
    const res = solveRefereeMatching(slots, refs, { neutrality: { nationality: true } });
    expect(res.assignments.get('P1')).toBe('hu');
    expect(res.assignments.get('P2')).toBe('fr');
  });

  it('respecte les affectations verrouillées', () => {
    const slots: MatchingSlot[] = [
      { id: 'P1', clubs: [], strength: 1, lockedRefereeId: 'debutant' },
      { id: 'P2', clubs: [], strength: 0 },
    ];
    const refs: MatchingReferee[] = [
      { id: 'inter', level: 1 },
      { id: 'debutant', level: 0 },
    ];
    const res = solveRefereeMatching(slots, refs);
    expect(res.assignments.get('P1')).toBe('debutant');
    expect(res.assignments.get('P2')).toBe('inter');
  });

  it('verrou en conflit de neutralité : conservé tel quel', () => {
    const res = solveRefereeMatching(
      [{ id: 'P', clubs: ['Lyon'], lockedRefereeId: 'lyon' }],
      [{ id: 'lyon', club: 'Lyon' }]
    );
    expect(res.assignments.get('P')).toBe('lyon');
  });

  it('diagnostic de Hall : poules 4 et 7, un seul arbitre neutre', () => {
    const slots: MatchingSlot[] = [
      { id: 'P1', clubs: ['Metz'] },
      { id: 'P4', clubs: ['Lyon', 'Paris'] },
      { id: 'P7', clubs: ['Lyon', 'Paris', 'Nice'] },
    ];
    const refs: MatchingReferee[] = [
      { id: 'R1', club: 'Lyon' },
      { id: 'R3', club: 'Paris' },
      { id: 'R5', club: 'Metz' },
    ];
    const res = solveRefereeMatching(slots, refs);
    // P1 prend R1 ou R3 (neutres pour Metz), R5 va sur P4 ou P7
    expect(res.assignments.size).toBe(2);
    expect(res.unassignedSlotIds).toHaveLength(1);
    expect(res.shortages).toHaveLength(1);
    const sh = res.shortages[0];
    expect(sh.slotIds.sort()).toEqual(['P4', 'P7']);
    expect(sh.compatibleRefereeIds).toEqual(['R5']);
    expect(sh.missing).toBe(1);
    // L’arbitre resté libre (R1 ou R3) est signalé en conflit de club
    const free = ['R1', 'R3'].find(id => ![...res.assignments.values()].includes(id));
    expect(sh.conflicts.some(c => c.refereeId === free && c.reasons.includes('club'))).toBe(true);
  });

  it('trouve une répartition complète si elle existe (cas aléatoires)', () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const clubs = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let t = 0; t < 30; t++) {
      const slots: MatchingSlot[] = Array.from({ length: 6 }, (_, i) => ({
        id: `P${i}`,
        clubs: clubs.filter(() => rnd() < 0.4),
        strength: rnd(),
      }));
      const refs: MatchingReferee[] = Array.from({ length: 6 }, (_, i) => ({
        id: `R${i}`,
        club: clubs[Math.floor(rnd() * clubs.length)],
        level: rnd(),
      }));
      const res = solveRefereeMatching(slots, refs);
      // Couplage maximal par force brute (permutations)
      const compat = slots.map(s => refs.map(r => !s.clubs.includes(r.club as string)));
      let best = 0;
      const perm = (i: number, used: boolean[], n: number) => {
        if (i === slots.length) {
          best = Math.max(best, n);
          return;
        }
        perm(i + 1, used, n);
        for (let j = 0; j < refs.length; j++) {
          if (!used[j] && compat[i][j]) {
            used[j] = true;
            perm(i + 1, used, n + 1);
            used[j] = false;
          }
        }
      };
      perm(0, new Array(refs.length).fill(false), 0);
      expect(res.assignments.size).toBe(best);
      for (const [s, r] of res.assignments) {
        expect(compat[Number(s.slice(1))][Number(r.slice(1))]).toBe(true);
      }
      const deficit = res.shortages.reduce((n, g) => n + g.missing, 0);
      expect(deficit).toBe(slots.length - best);
    }
  });

  it('plus de poules que d’arbitres', () => {
    const res = solveRefereeMatching(
      [
        { id: 'P1', clubs: [] },
        { id: 'P2', clubs: [] },
        { id: 'P3', clubs: [] },
      ],
      [{ id: 'R1' }]
    );
    expect(res.assignments.size).toBe(1);
    expect(res.shortages[0].missing).toBe(2);
    expect(res.shortages[0].slotIds).toHaveLength(3);
  });
});

describe('refereeLevelFromCategory', () => {
  it('ordonne international > national > régional > autre', () => {
    const i = refereeLevelFromCategory('International');
    const n = refereeLevelFromCategory('National');
    const r = refereeLevelFromCategory('Régional');
    expect(i).toBeGreaterThan(n);
    expect(n).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(refereeLevelFromCategory(undefined));
  });
});
