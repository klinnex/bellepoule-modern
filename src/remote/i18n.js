/* BellePoule Remote — Shared i18n module : moteur ; traductions dans i18n/<langue>.js (#1213) */
/* Le serveur distant sert /i18n.js = i18n/*.js + ce fichier, concaténés */
(function () {
  const TRANSLATIONS = window.BP_REMOTE_I18N || {};
  const FR = TRANSLATIONS.fr || {};

  let _t = FR;

  window.T = function (key, params) {
    let s = _t[key] !== undefined ? _t[key] : FR[key] || key;
    if (params) {
      for (const k of Object.keys(params)) {
        s = s.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), params[k]);
      }
    }
    return s;
  };

  /**
   * Message d'erreur d'une réponse du serveur : le code stable `body.error` (#1159) est
   * traduit (`error.<code>`, paramètres = champs de la réponse) ; texte brut sinon.
   */
  window.errorText = function (body, fallback) {
    const code = body && body.error;
    if (typeof code !== 'string' || !code) return fallback || '';
    const key = 'error.' + code;
    const text = window.T(key, body);
    return text !== key ? text : code;
  };

  function applyI18nToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      el.textContent = window.T(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', window.T(key));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-title');
      el.setAttribute('title', window.T(key));
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-aria-label');
      el.setAttribute('aria-label', window.T(key));
    });
  }

  let _remoteWeapon = null;

  window.getArenaLabel = function () {
    return _remoteWeapon === 'L' ? window.T('remote.arena') : window.T('remote.piste');
  };

  window.initRemoteI18n = async function () {
    try {
      const resp = await fetch('/api/config');
      const cfg = await resp.json();
      const lang = cfg.lang || 'fr';
      _t = TRANSLATIONS[lang] || FR;
      _remoteWeapon = cfg.weapon || null;
      if (document.documentElement) {
        document.documentElement.lang = lang === 'zh-HK' ? 'zh-HK' : lang;
      }
    } catch (e) {
      _t = FR;
    }
    applyI18nToDOM();
  };
})();
