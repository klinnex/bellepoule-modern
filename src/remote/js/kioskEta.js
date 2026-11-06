/**
 * BellePoule Modern - Kiosque : fin estimée de la phase en cours (#1077, extrait de kiosk.html #1401)
 * Option désactivable (localStorage kioskShowEta). Servi en /js/kioskEta.js (script 'self', CSP).
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Libellé de la phase (poules / tableau / finale) */
  function etaPhaseLabel(T, eta) {
    if (eta.phase === 'tableau' && eta.round) {
      return eta.round === 2
        ? T('dashboard.eta_final')
        : T('dashboard.eta_tableau', { n: eta.round });
    }
    return eta.phase === 'pools' ? T('dashboard.eta_pools') : T('dashboard.eta');
  }

  /**
   * Contrôleur du bandeau : dépendances injectées pour les tests.
   * @param {{doc: Document, storage: Storage, fetchFn: Function, getT: () => Function}} deps
   */
  function createEtaController(deps) {
    const { doc, storage, fetchFn, getT } = deps;
    const box = doc.getElementById('kiosk-eta');
    const cb = doc.getElementById('cb-eta');
    const enabled = () => storage.getItem('kioskShowEta') !== '0';

    async function refresh() {
      if (!enabled()) {
        box.hidden = true;
        return;
      }
      try {
        const res = await fetchFn('/api/public/eta', { cache: 'no-store' });
        const { eta } = await res.json();
        if (!eta || !eta.remainingMatches) {
          box.hidden = true;
          return;
        }
        const T = getT();
        doc.getElementById('kiosk-eta-label').textContent = etaPhaseLabel(T, eta);
        doc.getElementById('kiosk-eta-time').textContent = new Date(
          eta.finishAt
        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        doc.getElementById('kiosk-eta-detail').textContent =
          '· ' + T('dashboard.eta_remaining', { count: eta.remainingMatches });
        box.hidden = false;
      } catch (e) {
        box.hidden = true;
      }
    }

    if (cb) {
      cb.checked = enabled();
      cb.addEventListener('change', () => {
        storage.setItem('kioskShowEta', cb.checked ? '1' : '0');
        refresh();
      });
    }
    return { refresh, enabled };
  }

  const api = { etaPhaseLabel, createEtaController };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document && root.document.getElementById('kiosk-eta')) {
    const ctl = createEtaController({
      doc: root.document,
      storage: root.localStorage,
      fetchFn: (...a) => root.fetch(...a),
      getT: () => root.T || (k => k),
    });
    // Premier affichage après le chargement de la langue (initRemoteI18n)
    setTimeout(ctl.refresh, 2000);
    root.kioskRefreshEta = ctl.refresh; // appelé à chaque événement de données (plus de polling)
  }
})(typeof window !== 'undefined' ? window : undefined);
