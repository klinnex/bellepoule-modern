/**
 * BellePoule Modern - Diagnostic pare-feu Windows de la saisie distante (affiché uniquement sous Windows)
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import type { FirewallDiagnosis } from '../../../shared/types/remote';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Vrai si l'interface tourne sous Windows (le diagnostic n'a de sens que là). */
export function isWindowsRenderer(): boolean {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

/** Bouton + résultat du diagnostic pare-feu. Lecture seule côté Windows ; rien hors Windows. */
export function FirewallCheckPanel({ t, port }: { t: Translate; port: number }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FirewallDiagnosis | null>(null);

  if (!isWindowsRenderer()) return null;

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await window.electronAPI.remote.firewallCheck(port);
      setResult(res);
    } catch {
      setResult({
        supported: true,
        port,
        networkCategories: [],
        findings: [{ level: 'error', code: 'unreadable' }],
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button className="btn-secondary" onClick={runCheck} disabled={checking}>
        {checking ? t('rsm.fw_checking') : t('rsm.fw_button')}
      </button>
      {result && result.supported && (
        <div role="status" aria-live="polite" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
          <strong>{t('rsm.fw_title')}</strong>
          <ul style={{ margin: '0.25rem 0', paddingLeft: '1.2rem' }}>
            {result.findings.map((f, i) => (
              <li
                key={`${f.code}-${i}`}
                style={{
                  color:
                    f.level === 'ok' ? '#15803d' : f.level === 'warning' ? '#b45309' : '#b91c1c',
                }}
              >
                {t(`rsm.fw_${f.code}`, f.params)}
              </li>
            ))}
          </ul>
          <p style={{ color: '#94a3b8', margin: 0 }}>{t('rsm.fw_note')}</p>
        </div>
      )}
    </div>
  );
}
