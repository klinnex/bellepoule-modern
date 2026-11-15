/**
 * BellePoule Modern - Diagnostic pare-feu Windows pour la saisie distante (lecture seule).
 * Lit la configuration du pare-feu (profils, réseaux actifs, règles entrantes) et en déduit
 * si le port du serveur peut recevoir des connexions. Ne teste PAS une vraie connexion :
 * sur la machine elle-même, le trafic vers sa propre IP LAN n'est pas représentatif.
 * Hors Windows : non pris en charge (supported: false, aucune commande lancée).
 * Licensed under GPL-3.0
 */
import { execFile } from 'child_process';
import type { FirewallDiagnosis, FirewallFinding } from '../../shared/types/remote';

/** Forme JSON produite par le script PowerShell (voir buildFirewallScript). */
export interface RawFirewallData {
  profiles: { Name: string; Enabled: string; DefaultInboundAction: string }[];
  networks: { Name: string; NetworkCategory: string }[];
  rules: {
    Name: string;
    Action: string;
    Profile: string;
    Protocol: string;
    LocalPort: string[];
    Program: string;
  }[];
}

/** Script PowerShell en lecture seule : aucune modification du pare-feu. */
export function buildFirewallScript(): string {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$profiles = @(Get-NetFirewallProfile | ForEach-Object { [pscustomobject]@{ Name = [string]$_.Name; Enabled = [string]$_.Enabled; DefaultInboundAction = [string]$_.DefaultInboundAction } })',
    '$networks = @(Get-NetConnectionProfile | ForEach-Object { [pscustomobject]@{ Name = [string]$_.Name; NetworkCategory = [string]$_.NetworkCategory } })',
    '$rules = @(Get-NetFirewallRule -Direction Inbound -Enabled True | ForEach-Object { $pf = $_ | Get-NetFirewallPortFilter; $ap = $_ | Get-NetFirewallApplicationFilter; [pscustomobject]@{ Name = [string]$_.DisplayName; Action = [string]$_.Action; Profile = [string]$_.Profile; Protocol = [string]$pf.Protocol; LocalPort = @($pf.LocalPort | ForEach-Object { [string]$_ }); Program = [string]$ap.Program } })',
    '[pscustomobject]@{ profiles = $profiles; networks = $networks; rules = $rules } | ConvertTo-Json -Depth 5 -Compress',
  ].join('\n');
}

/** Catégorie de profil réseau Windows (DomainAuthenticated = profil Domaine). */
function normalizeCategory(category: string): string {
  return category === 'DomainAuthenticated' ? 'Domain' : category;
}

/** Vrai si la règle s'applique au profil donné (« Any » ou liste contenant le profil). */
function appliesToProfile(ruleProfile: string, profile: string): boolean {
  return ruleProfile
    .split(',')
    .map(p => p.trim())
    .some(p => p === 'Any' || p === profile);
}

/** Vrai si la règle couvre le port (liste de ports, plages « a-b », « Any » ou vide). */
function coversPort(ports: string[], port: number): boolean {
  if (ports.length === 0) return true;
  return ports.some(entry => {
    const value = entry.trim();
    if (value === '' || value.toLowerCase() === 'any') return true;
    const range = /^(\d+)-(\d+)$/.exec(value);
    if (range) return port >= Number(range[1]) && port <= Number(range[2]);
    return Number(value) === port;
  });
}

/** Vrai si la règle vise le programme donné (« Any » ou chemin identique, insensible à la casse). */
function coversProgram(program: string, exePath: string): boolean {
  const p = program.trim();
  return p === '' || p.toLowerCase() === 'any' || p.toLowerCase() === exePath.toLowerCase();
}

/**
 * Déduit les constats à partir des données brutes. Pure (testable sans Windows).
 * @param exePath chemin de l'exécutable BellePoule (règle « programme » éventuelle)
 */
export function analyzeFirewall(
  raw: RawFirewallData,
  port: number,
  exePath: string
): FirewallFinding[] {
  const findings: FirewallFinding[] = [];
  if (!raw.profiles || raw.profiles.length === 0) {
    return [{ level: 'error', code: 'unreadable' }];
  }

  const categories = [
    ...new Set((raw.networks ?? []).map(n => normalizeCategory(n.NetworkCategory))),
  ].filter(c => c === 'Public' || c === 'Private' || c === 'Domain');
  if (categories.length === 0) {
    return [{ level: 'warning', code: 'no_network' }];
  }

  const rules = raw.rules ?? [];
  for (const profileName of categories) {
    const profile = raw.profiles.find(p => p.Name === profileName);
    if (profile && profile.Enabled === 'False') {
      findings.push({ level: 'ok', code: 'profile_disabled', params: { profile: profileName } });
      continue;
    }
    if (profileName === 'Public') {
      findings.push({ level: 'warning', code: 'public_network', params: { profile: profileName } });
    }

    const matching = rules.filter(
      r =>
        appliesToProfile(r.Profile, profileName) &&
        (r.Protocol === 'TCP' || r.Protocol === 'Any' || r.Protocol === '') &&
        coversPort(r.LocalPort ?? [], port) &&
        coversProgram(r.Program, exePath)
    );
    const blocking = matching.find(r => r.Action === 'Block');
    if (blocking) {
      findings.push({
        level: 'error',
        code: 'blocked_by_rule',
        params: { profile: profileName, port, rule: blocking.Name },
      });
      continue;
    }
    const allowing = matching.find(r => r.Action === 'Allow');
    if (allowing) {
      findings.push({
        level: 'ok',
        code: 'allowed_by_rule',
        params: { profile: profileName, port },
      });
      continue;
    }
    if (profile?.DefaultInboundAction === 'Allow') {
      findings.push({ level: 'ok', code: 'default_allow', params: { profile: profileName } });
    } else {
      findings.push({
        level: 'error',
        code: 'no_allow_rule',
        params: { profile: profileName, port },
      });
    }
  }
  return findings;
}

/** Transforme la sortie JSON PowerShell en diagnostic. Tolère les champs absents. */
export function parseFirewallOutput(
  stdout: string,
  port: number,
  exePath: string
): FirewallDiagnosis {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      supported: true,
      port,
      networkCategories: [],
      findings: [{ level: 'error', code: 'unreadable' }],
    };
  }
  let raw: RawFirewallData;
  try {
    // Sortie PowerShell : forme connue (voir buildFirewallScript), validée par analyzeFirewall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: Record<string, any> = JSON.parse(trimmed);
    raw = {
      profiles: toArray<RawFirewallData['profiles'][number]>(parsed.profiles),
      networks: toArray<RawFirewallData['networks'][number]>(parsed.networks),
      rules: toArray<RawFirewallData['rules'][number]>(parsed.rules).map(r => ({
        ...r,
        LocalPort: toArray<string>(r.LocalPort),
      })),
    };
  } catch {
    return {
      supported: true,
      port,
      networkCategories: [],
      findings: [{ level: 'error', code: 'unreadable' }],
    };
  }
  const networkCategories = [
    ...new Set(raw.networks.map(n => normalizeCategory(n.NetworkCategory))),
  ];
  return {
    supported: true,
    port,
    networkCategories,
    findings: analyzeFirewall(raw, port, exePath),
  };
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Lance le diagnostic. Sur Windows uniquement : hors Windows, renvoie supported: false
 * sans rien exécuter.
 */
export function runFirewallCheck(
  port: number,
  platform: NodeJS.Platform = process.platform,
  exePath: string = process.execPath
): Promise<FirewallDiagnosis> {
  if (platform !== 'win32') {
    return Promise.resolve({ supported: false, port, networkCategories: [], findings: [] });
  }
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        buildFirewallScript(),
      ],
      { timeout: 30000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve({
            supported: true,
            port,
            networkCategories: [],
            findings: [{ level: 'error', code: 'unreadable' }],
            error: error.message,
          });
          return;
        }
        resolve(parseFirewallOutput(String(stdout), port, exePath));
      }
    );
  });
}
