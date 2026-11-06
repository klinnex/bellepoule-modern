/**
 * BellePoule Modern - Arbitre : minuteur vocal (TTS) (extrait de referee.html #1401)
 * Langue, phrases d'annonce, paliers et fusion de config : pur, sans DOM ni speechSynthesis.
 * Servi en /js/refereeTts.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  const ENABLED_MSG = {
    fr: 'Minuteur vocal activé',
    en: 'Voice timer enabled',
    de: 'Sprachtimer aktiviert',
    'zh-HK': '語音計時器已啟用',
    es: 'Temporizador por voz activado',
    ca: 'Temporitzador per veu activat',
    pt: 'Temporizador de voz ativado',
    it: 'Timer vocale attivato',
    ru: 'Голосовой таймер включён',
  };

  const BCP47 = {
    fr: 'fr-FR',
    en: 'en-GB',
    de: 'de-DE',
    es: 'es-ES',
    pt: 'pt-PT',
    it: 'it-IT',
    ru: 'ru-RU',
    ca: 'ca-ES',
    'zh-HK': 'zh-HK',
  };

  const PHRASES = {
    fr: { 60: 'Une minute', 30: 'Trente secondes', 10: 'Dix secondes', 0: 'Temps !' },
    en: { 60: 'One minute', 30: 'Thirty seconds', 10: 'Ten seconds', 0: 'Time!' },
    de: { 60: 'Eine Minute', 30: 'Dreißig Sekunden', 10: 'Zehn Sekunden', 0: 'Zeit!' },
    es: { 60: 'Un minuto', 30: 'Treinta segundos', 10: 'Diez segundos', 0: '¡Tiempo!' },
    ca: { 60: 'Un minut', 30: 'Trenta segons', 10: 'Deu segons', 0: 'Temps!' },
    pt: { 60: 'Um minuto', 30: 'Trinta segundos', 10: 'Dez segundos', 0: 'Tempo!' },
    it: { 60: 'Un minuto', 30: 'Trenta secondi', 10: 'Dieci secondi', 0: 'Tempo!' },
    ru: { 60: 'Одна минута', 30: 'Тридцать секунд', 10: 'Десять секунд', 0: 'Время!' },
    'zh-HK': { 60: '一分鐘', 30: '三十秒', 10: '十秒', 0: '時間！' },
  };

  const NUMS = {
    fr: { 5: '5', 4: '4', 3: '3', 2: '2', 1: '1' },
    en: { 5: '5', 4: '4', 3: '3', 2: '2', 1: '1' },
    de: { 5: '5', 4: '4', 3: '3', 2: '2', 1: '1' },
    'zh-HK': { 5: '五', 4: '四', 3: '三', 2: '二', 1: '一' },
  };

  /** Code de langue normalisé (fr / en / de / es / pt / it / ru / ca / zh-HK ; br → fr, pas de voix bretonne) */
  function ttsLangCode(htmlLang) {
    const lang = (htmlLang || 'fr').toLowerCase();
    const m = /^(de|en|es|pt|it|ru|ca)/.exec(lang);
    if (m) return m[1];
    if (lang.startsWith('zh')) return 'zh-HK';
    return 'fr';
  }

  /** Balise BCP-47 pour SpeechSynthesisUtterance.lang */
  function ttsBcp47(code) {
    return BCP47[code] || 'fr-FR';
  }

  function enabledMessage(code) {
    return ENABLED_MSG[code] || ENABLED_MSG.fr;
  }

  /** Fusionne une config TTS partielle reçue du serveur dans la config locale (mutée) */
  function mergeTtsConfig(cfg, c) {
    if (!c || typeof c !== 'object') return cfg;
    if (typeof c.voiceName === 'string' || c.voiceName === null) cfg.voiceName = c.voiceName;
    if (typeof c.rate === 'number' && c.rate > 0) cfg.rate = c.rate;
    if (c.announce && typeof c.announce === 'object') {
      cfg.announce = { ...cfg.announce, ...c.announce };
    }
    return cfg;
  }

  /** Clé de config `announce` du palier correspondant à cette seconde, ou null */
  function announceKey(s) {
    if (s === 60) return '60';
    if (s === 30) return '30';
    if (s === 10) return '10';
    if (s === 5) return '5';
    if (s >= 1 && s <= 4) return 'countdown';
    if (s === 0) return '0';
    return null;
  }

  /**
   * Annonce pour la seconde `s`.
   * @returns {{text: string|null}|null} null : rien à faire ; {text:null} : palier désactivé
   *   (à marquer comme annoncé sans parler) ; {text} : à dire puis marquer comme annoncé
   */
  function announcementFor(s, code, announceCfg) {
    const thresholds = { ...PHRASES[code], ...(NUMS[code] || NUMS.fr) };
    const key = announceKey(s);
    if (key && (announceCfg || {})[key] === false) return { text: null };
    if (s in thresholds) return { text: thresholds[s] };
    return null;
  }

  const api = {
    ttsLangCode,
    ttsBcp47,
    enabledMessage,
    mergeTtsConfig,
    announceKey,
    announcementFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPRefereeTts = api;
})(typeof window !== 'undefined' ? window : undefined);
