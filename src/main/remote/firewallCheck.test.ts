/**
 * Tests du diagnostic pare-feu Windows (analyse pure + garde hors Windows).
 * Licensed under GPL-3.0
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeFirewall,
  parseFirewallOutput,
  runFirewallCheck,
  buildFirewallScript,
  type RawFirewallData,
} from './firewallCheck';

const EXE = 'C:\\Program Files\\BellePoule\\BellePoule.exe';

function raw(overrides: Partial<RawFirewallData> = {}): RawFirewallData {
  return {
    profiles: [
      { Name: 'Domain', Enabled: 'True', DefaultInboundAction: 'Block' },
      { Name: 'Private', Enabled: 'True', DefaultInboundAction: 'Block' },
      { Name: 'Public', Enabled: 'True', DefaultInboundAction: 'Block' },
    ],
    networks: [{ Name: 'Wi-Fi', NetworkCategory: 'Private' }],
    rules: [],
    ...overrides,
  };
}

const portRule = (over: Partial<RawFirewallData['rules'][number]> = {}) => ({
  Name: 'BellePoule remote',
  Action: 'Allow',
  Profile: 'Private',
  Protocol: 'TCP',
  LocalPort: ['8066'],
  Program: 'Any',
  ...over,
});

describe('analyzeFirewall', () => {
  it('autorise le port quand une règle Allow couvre le profil actif', () => {
    const f = analyzeFirewall(raw({ rules: [portRule()] }), 8066, EXE);
    expect(f).toEqual([
      { level: 'ok', code: 'allowed_by_rule', params: { profile: 'Private', port: 8066 } },
    ]);
  });

  it("signale l'absence de règle quand le défaut est Block", () => {
    const f = analyzeFirewall(raw(), 8066, EXE);
    expect(f[0]).toMatchObject({ level: 'error', code: 'no_allow_rule' });
  });

  it('signale un réseau Public même avec une règle ouverte pour Private seulement', () => {
    const f = analyzeFirewall(
      raw({ networks: [{ Name: 'x', NetworkCategory: 'Public' }], rules: [portRule()] }),
      8066,
      EXE
    );
    expect(f.map(x => x.code)).toEqual(['public_network', 'no_allow_rule']);
  });

  it('une règle Block prime sur une règle Allow', () => {
    const f = analyzeFirewall(
      raw({
        rules: [portRule(), portRule({ Name: 'Blocage ERP', Action: 'Block', LocalPort: [] })],
      }),
      8066,
      EXE
    );
    expect(f[0]).toMatchObject({
      level: 'error',
      code: 'blocked_by_rule',
      params: { rule: 'Blocage ERP' },
    });
  });

  it('accepte une plage de ports et une règle par programme', () => {
    const f = analyzeFirewall(
      raw({
        rules: [portRule({ LocalPort: ['8000-8100'], Program: EXE.toLowerCase() })],
      }),
      8066,
      EXE
    );
    expect(f[0].code).toBe('allowed_by_rule');
  });

  it('ignore une règle visant un autre programme', () => {
    const f = analyzeFirewall(raw({ rules: [portRule({ Program: 'C:\\autre.exe' })] }), 8066, EXE);
    expect(f[0].code).toBe('no_allow_rule');
  });

  it('profil désactivé : pas de blocage', () => {
    const f = analyzeFirewall(
      raw({ profiles: [{ Name: 'Private', Enabled: 'False', DefaultInboundAction: 'Block' }] }),
      8066,
      EXE
    );
    expect(f[0]).toMatchObject({ level: 'ok', code: 'profile_disabled' });
  });

  it('défaut Allow : entrées autorisées', () => {
    const f = analyzeFirewall(
      raw({ profiles: [{ Name: 'Private', Enabled: 'True', DefaultInboundAction: 'Allow' }] }),
      8066,
      EXE
    );
    expect(f[0].code).toBe('default_allow');
  });

  it('sans réseau actif ou sans profil lisible : constat dédié', () => {
    expect(analyzeFirewall(raw({ networks: [] }), 8066, EXE)[0].code).toBe('no_network');
    expect(analyzeFirewall(raw({ profiles: [] }), 8066, EXE)[0].code).toBe('unreadable');
  });

  it('DomainAuthenticated est traité comme le profil Domaine', () => {
    const f = analyzeFirewall(
      raw({
        networks: [{ Name: 'AD', NetworkCategory: 'DomainAuthenticated' }],
        rules: [portRule({ Profile: 'Domain' })],
      }),
      8066,
      EXE
    );
    expect(f[0]).toMatchObject({ code: 'allowed_by_rule', params: { profile: 'Domain' } });
  });
});

describe('parseFirewallOutput', () => {
  it('accepte les objets seuls (ConvertTo-Json ne met pas de tableau pour un élément)', () => {
    const out = JSON.stringify({
      profiles: { Name: 'Private', Enabled: 'True', DefaultInboundAction: 'Block' },
      networks: { Name: 'Wi-Fi', NetworkCategory: 'Private' },
      rules: {
        Name: 'r',
        Action: 'Allow',
        Profile: 'Private',
        Protocol: 'TCP',
        LocalPort: '8066',
        Program: 'Any',
      },
    });
    const d = parseFirewallOutput(out, 8066, EXE);
    expect(d.supported).toBe(true);
    expect(d.networkCategories).toEqual(['Private']);
    expect(d.findings[0].code).toBe('allowed_by_rule');
  });

  it('sortie vide ou invalide : erreur « unreadable » sans exception', () => {
    expect(parseFirewallOutput('', 8066, EXE).findings[0].code).toBe('unreadable');
    expect(parseFirewallOutput('pas du json', 8066, EXE).findings[0].code).toBe('unreadable');
  });
});

describe('détail des échecs de lecture', () => {
  it('erreur fatale PowerShell : le message est remonté tel quel', () => {
    const d = parseFirewallOutput(
      JSON.stringify({ fatal: 'Accès refusé à la stratégie' }),
      8066,
      EXE
    );
    expect(d.findings[0].code).toBe('unreadable');
    expect(d.detail).toBe('Erreur PowerShell : Accès refusé à la stratégie');
  });

  it('texte parasite avant le JSON : le JSON est quand même lu', () => {
    const out =
      'WARNING: quelque chose\n' +
      JSON.stringify({
        profiles: [{ Name: 'Private', Enabled: 'True', DefaultInboundAction: 'Block' }],
        networks: [{ Name: 'x', NetworkCategory: 'Private' }],
        rules: [],
      });
    const d = parseFirewallOutput(out, 8066, EXE);
    expect(d.detail).toBeUndefined();
    expect(d.findings[0].code).toBe('no_allow_rule');
  });

  it('sortie sans JSON : le début de la sortie est joint au détail', () => {
    const d = parseFirewallOutput('Access is denied', 8066, EXE);
    expect(d.findings[0].code).toBe('unreadable');
    expect(d.detail).toBe('Sortie sans JSON : Access is denied');
  });
});

describe('runFirewallCheck', () => {
  it('hors Windows : non pris en charge, aucune commande lancée', async () => {
    const d = await runFirewallCheck(8066, 'linux');
    expect(d).toEqual({ supported: false, port: 8066, networkCategories: [], findings: [] });
    expect((await runFirewallCheck(8066, 'darwin')).supported).toBe(false);
  });

  it('le script est en lecture seule (aucune commande de modification)', () => {
    const script = buildFirewallScript();
    expect(script).not.toMatch(
      /Set-NetFirewall|New-NetFirewall|Remove-NetFirewall|Enable-NetFirewall|Disable-NetFirewall|netsh/i
    );
  });
});
