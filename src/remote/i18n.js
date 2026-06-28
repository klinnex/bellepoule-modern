/* BellePoule Remote — Shared i18n module (fr / en / zh-HK) */
(function () {
  const TRANSLATIONS = {
    fr: {
      /* login */
      'login.title': 'Accès protégé',
      'login.arena_prefix': 'Piste',
      'login.page_title': 'Accès protégé - BellePoule',
      'login.arena_page_title': '— Accès protégé',
      'login.password_label': 'Mot de passe',
      'login.password_placeholder': 'Saisir le mot de passe',
      'login.submit': 'Valider',
      'login.error_incorrect': 'Mot de passe incorrect',
      'login.error_connection': 'Erreur de connexion au serveur',
      /* commun */
      'remote.arena': 'Arène',
      'remote.piste': 'Piste',
      'remote.connecting': 'Connexion...',
      'remote.syncing': '⟳ Sync...',
      'remote.connected': 'Connecté',
      'remote.disconnected': 'Déconnecté',
      'remote.offline': 'Hors-ligne',
      'remote.online': 'En ligne',
      'remote.loading': 'Chargement...',
      'remote.error_connection': 'Erreur de connexion',
      /* referee */
      'referee.title': 'Arbitrage - Arène BellePoule',
      'referee.card_white': 'Carton blanc',
      'referee.card_yellow': 'Carton jaune (+3 adv)',
      'referee.card_red': 'Carton rouge (+5 adv)',
      'referee.sudden_death': '⚡ MORT SUBITE',
      'referee.supplementary_time': '⏱ 30s SUPPLEMENTAIRE',
      'referee.timer_hint': 'Tapez pour démarrer/pause - Appui long pour reset',
      'referee.start': '▶️ Démarrer',
      'referee.pause': '⏸ Pause',
      'referee.resume': '▶️ Reprendre',
      'referee.finish': '🏁 Terminer',
      'referee.exit_red': '🚪 Sortie rouge',
      'referee.undo': '↩ Annuler',
      'referee.exit_green': '🚪 Sortie verte',
      'referee.matches_header': '📋 Matchs — Arène',
      'referee.search_placeholder': '🔍 Rechercher un tireur...',
      'referee.modal_title': '🏁 Fin de match',
      'referee.modal_confirm_text': 'Confirmez-vous la fin de ce match ?',
      'referee.modal_note': 'Le score sera enregistré dans le tableau de poules.',
      'referee.cancel': 'Annuler',
      'referee.confirm': 'Confirmer',
      'referee.match_paused': '⏸ Combat en pause',
      'referee.match_resumed': '▶️ Combat repris',
      'referee.error_save': "❌ Erreur lors de l'enregistrement",
      'referee.arena_exit_notif': '🚪 Sortie d\'arène {{label}} — +{{points}} pts adversaire',
      'referee.dt_call': '📣 Appel DT',
      'referee.dt_called': '⏳ DT appelé...',
      'referee.dt_en_route': '✅ DT en route',
      /* arena / public */
      'arena.title': 'Arène BellePoule',
      'arena.invert': '⇄ Inverser',
      'arena.waiting': 'En attente',
      'arena.status_waiting': 'En attente',
      'arena.status_next': 'Prochain',
      'arena.status_in_progress': 'En cours',
      'arena.status_finished': 'Terminé',
      /* pool */
      'pool.title': 'BellePoule',
      'pool.loading': 'Chargement…',
      'pool.connecting': '⚡ Connexion…',
      'pool.connected': '🟢 Connecté',
      'pool.disconnected': '🔴 Déconnecté',
      'pool.tab_grid': '⊞ Tableau',
      'pool.tab_matches': '⚔ Matchs',
      'pool.loading_pool': 'Chargement de la poule…',
      'pool.score_entry': 'Saisie du score',
      'pool.cancel': 'Annuler',
      'pool.validate': 'Valider',
      'pool.finished': 'POULE TERMINÉE',
      'pool.no_pool': 'Aucune poule assignée à cette arène.',
      'pool.error_connection': 'Erreur de connexion au serveur.',
      /* kiosk */
      'kiosk.pools': 'Poules',
      'kiosk.ranking': 'Classement',
      'kiosk.live': 'Matchs en direct',
      'kiosk.live_matches': 'Matchs en cours',
      'kiosk.settings_title': 'Vues affichées',
      'kiosk.pools_subtitle': 'Classements des poules',
      'kiosk.no_pools': 'Aucune poule disponible',
      'kiosk.no_pools_hint': 'Démarrez la compétition pour voir les poules',
      'kiosk.next_matches': 'Matchs suivants',
      'kiosk.pause': '⏸ Pause',
      'kiosk.resume_at': 'Reprise',
      'kiosk.countdown_prefix': 'dans',
      'kiosk.rotation_label': 'Rafraîchissement',
      'kiosk.rotation_unit': 's',
      /* dashboard */
      'dashboard.pools': 'Poules',
      'dashboard.ranking': 'Classement Général',
      'dashboard.live': 'Matchs en Cours',
      'dashboard.no_pools': 'Aucune poule en cours',
      'dashboard.no_pools_hint': 'Les poules apparaîtront ici une fois la compétition démarrée',
      'dashboard.ranking_title': '🏅 Classement Général Quest',
      'dashboard.ranking_waiting': 'En attente des résultats...',
      'dashboard.no_live': 'Aucun match en cours',
      'dashboard.no_live_hint': 'Les matchs en direct apparaîtront ici',
      'dashboard.autorefresh': 'Auto-refresh: 10s',
    },
    en: {
      /* login */
      'login.title': 'Protected Access',
      'login.arena_prefix': 'Arena',
      'login.page_title': 'Protected Access - BellePoule',
      'login.arena_page_title': '— Protected Access',
      'login.password_label': 'Password',
      'login.password_placeholder': 'Enter password',
      'login.submit': 'Log In',
      'login.error_incorrect': 'Incorrect password',
      'login.error_connection': 'Server connection error',
      /* commun */
      'remote.arena': 'Arena',
      'remote.piste': 'Piste',
      'remote.connecting': 'Connecting...',
      'remote.syncing': '⟳ Sync...',
      'remote.connected': 'Connected',
      'remote.disconnected': 'Disconnected',
      'remote.offline': 'Offline',
      'remote.online': 'Online',
      'remote.loading': 'Loading...',
      'remote.error_connection': 'Connection error',
      /* referee */
      'referee.title': 'Refereeing - BellePoule Arena',
      'referee.card_white': 'White card',
      'referee.card_yellow': 'Yellow card (+3 opp)',
      'referee.card_red': 'Red card (+5 opp)',
      'referee.sudden_death': '⚡ SUDDEN DEATH',
      'referee.supplementary_time': '⏱ 30s EXTRA TIME',
      'referee.timer_hint': 'Tap to start/pause - Long press to reset',
      'referee.start': '▶️ Start',
      'referee.pause': '⏸ Pause',
      'referee.resume': '▶️ Resume',
      'referee.finish': '🏁 Finish',
      'referee.exit_red': '🚪 Red exit',
      'referee.undo': '↩ Undo',
      'referee.exit_green': '🚪 Green exit',
      'referee.matches_header': '📋 Matches — Arena',
      'referee.search_placeholder': '🔍 Search fencer...',
      'referee.modal_title': '🏁 End of match',
      'referee.modal_confirm_text': 'Confirm end of match?',
      'referee.modal_note': 'The score will be recorded in the pool table.',
      'referee.cancel': 'Cancel',
      'referee.confirm': 'Confirm',
      'referee.match_paused': '⏸ Match paused',
      'referee.match_resumed': '▶️ Match resumed',
      'referee.error_save': '❌ Error saving result',
      'referee.arena_exit_notif': '🚪 Arena exit {{label}} — +{{points}} pts opponent',
      'referee.dt_call': '📣 Call DT',
      'referee.dt_called': '⏳ DT called...',
      'referee.dt_en_route': '✅ DT on the way',
      /* arena / public */
      'arena.title': 'BellePoule Arena',
      'arena.invert': '⇄ Invert',
      'arena.waiting': 'Waiting',
      'arena.status_waiting': 'Waiting',
      'arena.status_next': 'Next',
      'arena.status_in_progress': 'In progress',
      'arena.status_finished': 'Finished',
      /* pool */
      'pool.title': 'BellePoule',
      'pool.loading': 'Loading…',
      'pool.connecting': '⚡ Connecting…',
      'pool.connected': '🟢 Connected',
      'pool.disconnected': '🔴 Disconnected',
      'pool.tab_grid': '⊞ Grid',
      'pool.tab_matches': '⚔ Matches',
      'pool.loading_pool': 'Loading pool…',
      'pool.score_entry': 'Enter score',
      'pool.cancel': 'Cancel',
      'pool.validate': 'Submit',
      'pool.finished': 'POOL FINISHED',
      'pool.no_pool': 'No pool assigned to this arena.',
      'pool.error_connection': 'Server connection error.',
      /* kiosk */
      'kiosk.pools': 'Pools',
      'kiosk.ranking': 'Ranking',
      'kiosk.live': 'Live Matches',
      'kiosk.live_matches': 'Live Matches',
      'kiosk.settings_title': 'Displayed views',
      'kiosk.pools_subtitle': 'Pool standings',
      'kiosk.no_pools': 'No pool available',
      'kiosk.no_pools_hint': 'Start the competition to see pools',
      'kiosk.next_matches': 'Next Matches',
      'kiosk.pause': '⏸ Break',
      'kiosk.resume_at': 'Resume',
      'kiosk.countdown_prefix': 'in',
      'kiosk.rotation_label': 'Rotation interval',
      'kiosk.rotation_unit': 's',
      /* dashboard */
      'dashboard.pools': 'Pools',
      'dashboard.ranking': 'Overall Ranking',
      'dashboard.live': 'Live Matches',
      'dashboard.no_pools': 'No pools in progress',
      'dashboard.no_pools_hint': 'Pools will appear here once the competition starts',
      'dashboard.ranking_title': '🏅 Overall Quest Ranking',
      'dashboard.ranking_waiting': 'Waiting for results...',
      'dashboard.no_live': 'No live matches',
      'dashboard.no_live_hint': 'Live matches will appear here',
      'dashboard.autorefresh': 'Auto-refresh: 10s',
    },
    'zh-HK': {
      /* login */
      'login.title': '受保護訪問',
      'login.arena_prefix': '場地',
      'login.page_title': '受保護訪問 - BellePoule',
      'login.arena_page_title': '— 受保護訪問',
      'login.password_label': '密碼',
      'login.password_placeholder': '輸入密碼',
      'login.submit': '確認',
      'login.error_incorrect': '密碼不正確',
      'login.error_connection': '伺服器連接錯誤',
      /* commun */
      'remote.arena': '場地',
      'remote.piste': '場地',
      'remote.connecting': '連接中...',
      'remote.syncing': '⟳ 同步...',
      'remote.connected': '已連接',
      'remote.disconnected': '已斷線',
      'remote.offline': '離線',
      'remote.online': '在線',
      'remote.loading': '載入中...',
      'remote.error_connection': '連接錯誤',
      /* referee */
      'referee.title': '裁判 - BellePoule 場地',
      'referee.card_white': '白牌',
      'referee.card_yellow': '黃牌 (+3 對手)',
      'referee.card_red': '紅牌 (+5 對手)',
      'referee.sudden_death': '⚡ 突然死亡',
      'referee.supplementary_time': '⏱ 30秒加時',
      'referee.timer_hint': '點擊開始/暫停 - 長按重置',
      'referee.start': '▶️ 開始',
      'referee.pause': '⏸ 暫停',
      'referee.resume': '▶️ 繼續',
      'referee.finish': '🏁 結束',
      'referee.exit_red': '🚪 紅方出場',
      'referee.undo': '↩ 撤銷',
      'referee.exit_green': '🚪 綠方出場',
      'referee.matches_header': '📋 比賽 — 場地',
      'referee.search_placeholder': '🔍 搜索劍手...',
      'referee.modal_title': '🏁 比賽結束',
      'referee.modal_confirm_text': '確認比賽結束？',
      'referee.modal_note': '分數將記錄在小組賽表格中。',
      'referee.cancel': '取消',
      'referee.confirm': '確認',
      'referee.match_paused': '⏸ 比賽暫停',
      'referee.match_resumed': '▶️ 比賽繼續',
      'referee.error_save': '❌ 儲存結果時發生錯誤',
      'referee.dt_call': '📣 呼叫DT',
      'referee.dt_called': '⏳ 已呼叫DT...',
      'referee.dt_en_route': '✅ DT正在前來',
      'referee.arena_exit_notif': '🚪 場地離場 {{label}} — +{{points}} 分對手',
      /* arena / public */
      'arena.title': 'BellePoule 場地',
      'arena.invert': '⇄ 對換',
      'arena.waiting': '等待中',
      'arena.status_waiting': '等待中',
      'arena.status_next': '下一場',
      'arena.status_in_progress': '進行中',
      'arena.status_finished': '已完成',
      /* pool */
      'pool.title': 'BellePoule',
      'pool.loading': '載入中…',
      'pool.connecting': '⚡ 連接中…',
      'pool.connected': '🟢 已連接',
      'pool.disconnected': '🔴 已斷線',
      'pool.tab_grid': '⊞ 表格',
      'pool.tab_matches': '⚔ 比賽',
      'pool.loading_pool': '載入小組賽…',
      'pool.score_entry': '輸入分數',
      'pool.cancel': '取消',
      'pool.validate': '提交',
      'pool.finished': '小組賽已完成',
      'pool.no_pool': '此場地未分配小組賽。',
      'pool.error_connection': '伺服器連接錯誤。',
      /* kiosk */
      'kiosk.pools': '小組賽',
      'kiosk.ranking': '排名',
      'kiosk.live': '即時比賽',
      'kiosk.live_matches': '即時比賽',
      'kiosk.settings_title': '顯示視圖',
      'kiosk.pools_subtitle': '小組賽排名',
      'kiosk.no_pools': '沒有可用的小組賽',
      'kiosk.no_pools_hint': '啟動比賽以查看小組賽',
      'kiosk.next_matches': '下一場比賽',
      'kiosk.pause': '⏸ 休息',
      'kiosk.resume_at': '恢復',
      'kiosk.countdown_prefix': '還有',
      'kiosk.rotation_label': '輪換間隔',
      'kiosk.rotation_unit': '秒',
      /* dashboard */
      'dashboard.pools': '小組賽',
      'dashboard.ranking': '總體排名',
      'dashboard.live': '即時比賽',
      'dashboard.no_pools': '沒有進行中的小組賽',
      'dashboard.no_pools_hint': '比賽開始後，小組賽將在此顯示',
      'dashboard.ranking_title': '🏅 Quest 總體排名',
      'dashboard.ranking_waiting': '等待結果...',
      'dashboard.no_live': '沒有即時比賽',
      'dashboard.no_live_hint': '即時比賽將在此顯示',
      'dashboard.autorefresh': '自動刷新：10秒',
    },
  };

  let _t = TRANSLATIONS.fr;

  window.T = function (key, params) {
    let s = _t[key] !== undefined ? _t[key] : (TRANSLATIONS.fr[key] || key);
    if (params) {
      for (const k of Object.keys(params)) {
        s = s.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), params[k]);
      }
    }
    return s;
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
      _t = TRANSLATIONS[lang] || TRANSLATIONS.fr;
      _remoteWeapon = cfg.weapon || null;
      if (document.documentElement) {
        document.documentElement.lang = lang === 'zh-HK' ? 'zh-HK' : lang;
      }
    } catch (e) {
      _t = TRANSLATIONS.fr;
    }
    applyI18nToDOM();
  };
})();
