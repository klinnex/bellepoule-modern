/**
 * BellePoule Modern - Electron Main Process
 * Licensed under GPL-3.0
 */

import { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage, screen, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import JSZip from 'jszip';
import { DatabaseManager } from '../database';
import { RemoteScoreServer } from './remoteScoreServer';
import { ensureCert } from './certManager';
import { AutoUpdater } from './autoUpdater';
import { Competition, Fencer, FencerStatus, Match, MatchStatus, Pool } from '../shared/types';

// Database instance
const db = new DatabaseManager();

// Remote score servers — one per competition (key = competitionId)
const remoteServers = new Map<string, { server: RemoteScoreServer; port: number; host: string; useHttps: boolean; certFingerprint?: string }>();
const usedPorts = new Set<number>();
const BASE_REMOTE_PORT = 8066;

function findAvailablePort(preferred?: number): number {
  if (preferred && !usedPorts.has(preferred)) return preferred;
  const start = preferred ? preferred + 1 : BASE_REMOTE_PORT;
  let port = start;
  while (usedPorts.has(port)) port++;
  return port;
}

// Auto updater
let autoUpdater: AutoUpdater | null = null;

// Main window reference
let mainWindow: BrowserWindow | null = null;

// Splash window shown during startup
let splashWindow: BrowserWindow | null = null;
let splashShownAt: number | null = null;
const MIN_SPLASH_MS = 0;

// Language persistence file — read before renderer loads so splash can pre-select
const LANG_FILE = () => path.join(app.getPath('userData'), 'bellepoule-language.json');

function readSavedLanguage(): string {
  try {
    const raw = fs.readFileSync(LANG_FILE(), 'utf-8');
    const parsed = JSON.parse(raw) as { language?: string };
    return parsed.language || 'fr';
  } catch {
    return 'fr';
  }
}

function saveLanguageToFile(lang: string): void {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(LANG_FILE(), JSON.stringify({ language: lang }), 'utf-8');
  } catch (e) {
    console.error('Failed to save language preference:', e);
  }
}

// Promise that resolves when the user confirms a language in the splash screen
let splashConfirmResolve: ((lang: string) => void) | null = null;
const splashConfirmPromise = new Promise<string>(resolve => {
  splashConfirmResolve = resolve;
});

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 460,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#0f1729',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js'),
    },
  });

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  splashWindow.setPosition(Math.floor((sw - 520) / 2), Math.floor((sh - 460) / 2));

  const splashPath = path.join(__dirname, 'splash.html');
  if (!fs.existsSync(splashPath)) {
    // No splash available — resolve immediately with saved lang
    splashConfirmResolve?.(readSavedLanguage());
    return;
  }

  const savedLang = readSavedLanguage();
  const iconPath = path.join(__dirname, '../../resources/icons/256x256.png');
  const versionInfo = getVersionInfo();
  const channel =
    process.env.NODE_ENV === 'development' || !app.isPackaged ? 'dev' : 'main';
  splashWindow.loadFile(splashPath, {
    query: {
      icon: iconPath,
      version: versionInfo.version,
      build: String(versionInfo.build),
      channel,
      lang: savedLang,
    },
  });
  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
    splashShownAt = Date.now();
    // Send saved language so splash can pre-select it
    splashWindow?.webContents.send('splash:init', savedLang);
  });
}

// IPC: splash confirms language choice
ipcMain.once('splash:confirm', (_event, lang: string) => {
  const validLangs = ['fr', 'en', 'de', 'es', 'zh-HK', 'br', 'ca'];
  const confirmed = validLangs.includes(lang) ? lang : 'fr';
  saveLanguageToFile(confirmed);
  currentMenuLanguage = confirmed;
  splashConfirmResolve?.(confirmed);
});

// IPC: user closes splash without confirming → quit
ipcMain.once('splash:close', () => {
  app.quit();
});

// onClosed est appelé après le fade-out, au moment d'afficher la fenêtre principale
function closeSplash(onClosed?: () => void): void {
  if (!splashWindow || splashWindow.isDestroyed()) {
    onClosed?.();
    return;
  }
  // Garantir un affichage minimum pour que l'animation soit visible
  const elapsed = splashShownAt !== null ? Date.now() - splashShownAt : 0;
  const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

  setTimeout(() => {
    if (!splashWindow || splashWindow.isDestroyed()) {
      onClosed?.();
      return;
    }
    splashWindow.webContents
      .executeJavaScript('document.body.classList.add("fadeout"); true')
      .catch(() => {});
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      onClosed?.();
    }, 420);
  }, remaining);
}

// Current UI language (kept in sync via IPC)
let currentMenuLanguage = 'fr';

// ============================================================================
// Menu Translations
// ============================================================================

type MenuLang = 'fr' | 'en' | 'de' | 'zh-HK';

const MENU_LABELS: Record<MenuLang, Record<string, string>> = {
  fr: {
    file: 'Fichier',
    newCompetition: 'Nouvelle compétition',
    open: 'Ouvrir...',
    save: 'Enregistrer',
    saveAs: 'Enregistrer sous...',
    export: 'Exporter',
    exportXml: 'Exporter en XML (BellePoule)',
    exportCsv: 'Exporter en CSV',
    exportPdf: 'Exporter en PDF',
    exportFencersTxt: 'Exporter tireurs (.txt)',
    exportFencersFff: 'Exporter tireurs (.fff)',
    exportFencersBpf: 'Exporter tireurs + photos (.bpf)',
    exportPhotos: 'Exporter photos (.zip)',
    import: 'Importer',
    importXml: 'Importer XML (BellePoule)',
    importFff: 'Importer liste FFE (.fff)',
    importRanking: 'Importer classement FFE',
    importFencersBpf: 'Importer tireurs + photos (.bpf)',
    settings: 'Paramètres...',
    quit: 'Quitter',
    edit: 'Édition',
    undo: 'Annuler',
    redo: 'Rétablir',
    cut: 'Couper',
    copy: 'Copier',
    paste: 'Coller',
    selectAll: 'Tout sélectionner',
    competition: 'Compétition',
    properties: 'Propriétés',
    addFencer: 'Ajouter un tireur',
    addReferee: 'Ajouter un arbitre',
    startRemote: '⚡ Démarrer saisie distante',
    stopRemote: '🛑 Arrêter saisie distante',
    nextPhase: 'Tour suivant',
    view: 'Affichage',
    reload: 'Recharger',
    forceReload: 'Forcer le rechargement',
    devTools: 'Outils de développement',
    resetZoom: 'Réinitialiser le zoom',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    fullscreen: 'Plein écran',
    help: 'Aide',
    about: 'À propos de BellePoule Modern',
    updates: '🔄 Vérifier les mises à jour...',
    updatesUnavailable: "Le système de mise à jour n'est pas disponible",
    updatesTitle: 'Mises à jour',
    docs: 'Documentation',
    reportBug: '📝 Signaler un bug / Suggestion',
    remoteTitle: 'Saisie distante',
    remoteAlreadyStarted: 'Le serveur de saisie distante est déjà démarré',
    remoteStartedTitle: 'Saisie distante démarrée',
    remoteStartedMsg: 'Les arbitres peuvent maintenant se connecter',
    remoteDetailTemplate:
      'Arène 1: {url}/arene1/arbitre\nArène 2: {url}/arene2/arbitre\nArène 3: {url}/arene3/arbitre\nArène 4: {url}/arene4/arbitre\n\nAffichage kiosk (grand écran public): {url}/kiosk\nClassement en direct: {url}/\n\nPartagez ces URLs avec les arbitres munis de tablettes.\nAssurez-vous que le pare-feu Windows autorise les connexions sur le port {port}.',
    remoteNotStarted: "Le serveur de saisie distante n'est pas démarré",
    remoteStoppedTitle: 'Saisie distante arrêtée',
    remoteStoppedMsg: 'Le serveur de saisie distante a été arrêté',
    errTitle: 'Erreur',
    remoteErrStart: 'Impossible de démarrer le serveur distant:',
    remoteErrStop: "Impossible d'arrêter le serveur distant:",
    openTitle: 'Ouvrir une compétition',
    filterBpm: 'BellePoule Modern',
    filterClassic: 'BellePoule Classic',
    filterAll: 'Tous les fichiers',
    openErr: "Impossible d'ouvrir le fichier:",
    saveTitle: 'Enregistrer la compétition',
    saveErr: "Impossible d'enregistrer:",
    importTitle: 'Importer',
    importXmlTitle: 'Importer un fichier XML BellePoule',
    importFffTitle: 'Importer une liste FFE',
    importRankingTitle: 'Importer un classement FFE',
    importBpfTitle: 'Importer tireurs + photos (.bpf)',
    filterXmlBP: 'XML BellePoule',
    filterFfe: 'Fichier FFE',
    filterRanking: 'Fichier classement',
    importReadErr: 'Impossible de lire le fichier:',
    importErrTitle: "Erreur d'import",
    aboutTitle: 'À propos de BellePoule Modern',
    aboutSoftware: "Logiciel de gestion de compétitions d'escrime.",
    aboutRewrite: 'Réécriture moderne du logiciel BellePoule original créé par Yann Deboeuf.',
    aboutBugHint: 'Pour signaler un bug, mentionnez:',
  },
  en: {
    file: 'File',
    newCompetition: 'New Competition',
    open: 'Open...',
    save: 'Save',
    saveAs: 'Save As...',
    export: 'Export',
    exportXml: 'Export XML (BellePoule)',
    exportCsv: 'Export CSV',
    exportPdf: 'Export PDF',
    exportFencersTxt: 'Export fencers (.txt)',
    exportFencersFff: 'Export fencers (.fff)',
    exportFencersBpf: 'Export fencers + photos (.bpf)',
    exportPhotos: 'Export photos (.zip)',
    import: 'Import',
    importXml: 'Import XML (BellePoule)',
    importFff: 'Import FFE list (.fff)',
    importRanking: 'Import FFE ranking',
    importFencersBpf: 'Import fencers + photos (.bpf)',
    settings: 'Settings...',
    quit: 'Quit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    competition: 'Competition',
    properties: 'Properties',
    addFencer: 'Add Fencer',
    addReferee: 'Add Referee',
    startRemote: '⚡ Start Remote Scoring',
    stopRemote: '🛑 Stop Remote Scoring',
    nextPhase: 'Next Round',
    view: 'View',
    reload: 'Reload',
    forceReload: 'Force Reload',
    devTools: 'Developer Tools',
    resetZoom: 'Reset Zoom',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullscreen: 'Toggle Fullscreen',
    help: 'Help',
    about: 'About BellePoule Modern',
    updates: '🔄 Check for Updates...',
    updatesUnavailable: 'Update system is not available',
    updatesTitle: 'Updates',
    docs: 'Documentation',
    reportBug: '📝 Report a Bug / Suggestion',
    remoteTitle: 'Remote Scoring',
    remoteAlreadyStarted: 'The remote scoring server is already started',
    remoteStartedTitle: 'Remote scoring started',
    remoteStartedMsg: 'Referees can now connect',
    remoteDetailTemplate:
      'Arena 1: {url}/arene1/arbitre\nArena 2: {url}/arene2/arbitre\nArena 3: {url}/arene3/arbitre\nArena 4: {url}/arene4/arbitre\n\nKiosk display (public screen): {url}/kiosk\nLive ranking: {url}/\n\nShare these URLs with referees using tablets.\nMake sure Windows firewall allows connections on port {port}.',
    remoteNotStarted: 'The remote scoring server is not started',
    remoteStoppedTitle: 'Remote scoring stopped',
    remoteStoppedMsg: 'The remote scoring server has been stopped',
    errTitle: 'Error',
    remoteErrStart: 'Unable to start the remote server:',
    remoteErrStop: 'Unable to stop the remote server:',
    openTitle: 'Open Competition',
    filterBpm: 'BellePoule Modern',
    filterClassic: 'BellePoule Classic',
    filterAll: 'All Files',
    openErr: 'Unable to open file:',
    saveTitle: 'Save Competition',
    saveErr: 'Unable to save:',
    importTitle: 'Import',
    importXmlTitle: 'Import BellePoule XML file',
    importFffTitle: 'Import FFE list',
    importRankingTitle: 'Import FFE ranking',
    importBpfTitle: 'Import fencers + photos (.bpf)',
    filterXmlBP: 'XML BellePoule',
    filterFfe: 'FFE File',
    filterRanking: 'Ranking file',
    importReadErr: 'Unable to read file:',
    importErrTitle: 'Import Error',
    aboutTitle: 'About BellePoule Modern',
    aboutSoftware: 'Fencing competition management software.',
    aboutRewrite: 'Modern rewrite of the original BellePoule software created by Yann Deboeuf.',
    aboutBugHint: 'To report a bug, mention:',
  },
  de: {
    file: 'Datei',
    newCompetition: 'Neuer Wettkampf',
    open: 'Öffnen...',
    save: 'Speichern',
    saveAs: 'Speichern unter...',
    export: 'Exportieren',
    exportXml: 'XML exportieren (BellePoule)',
    exportCsv: 'CSV exportieren',
    exportPdf: 'PDF exportieren',
    exportFencersTxt: 'Fechter exportieren (.txt)',
    exportFencersFff: 'Fechter exportieren (.fff)',
    exportFencersBpf: 'Fechter + Fotos exportieren (.bpf)',
    exportPhotos: 'Fotos exportieren (.zip)',
    import: 'Importieren',
    importXml: 'XML importieren (BellePoule)',
    importFff: 'FFE-Liste importieren (.fff)',
    importRanking: 'FFE-Rangliste importieren',
    importFencersBpf: 'Fechter + Fotos importieren (.bpf)',
    settings: 'Einstellungen...',
    quit: 'Beenden',
    edit: 'Bearbeiten',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einfügen',
    selectAll: 'Alles auswählen',
    competition: 'Wettkampf',
    properties: 'Eigenschaften',
    addFencer: 'Fechter hinzufügen',
    addReferee: 'Schiedsrichter hinzufügen',
    startRemote: '⚡ Fernpunkteingabe starten',
    stopRemote: '🛑 Fernpunkteingabe stoppen',
    nextPhase: 'Nächste Phase',
    view: 'Ansicht',
    reload: 'Neu laden',
    forceReload: 'Vollständig neu laden',
    devTools: 'Entwicklertools',
    resetZoom: 'Zoom zurücksetzen',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    fullscreen: 'Vollbild',
    help: 'Hilfe',
    about: 'Über BellePoule Modern',
    updates: '🔄 Updates prüfen...',
    updatesUnavailable: 'Das Update-System ist nicht verfügbar',
    updatesTitle: 'Updates',
    docs: 'Dokumentation',
    reportBug: '📝 Bug melden / Vorschlag',
    remoteTitle: 'Fernpunkteingabe',
    remoteAlreadyStarted: 'Der Fernpunkteingabe-Server ist bereits gestartet',
    remoteStartedTitle: 'Fernpunkteingabe gestartet',
    remoteStartedMsg: 'Schiedsrichter können sich jetzt verbinden',
    remoteDetailTemplate:
      'Arena 1: {url}/arene1/arbitre\nArena 2: {url}/arene2/arbitre\nArena 3: {url}/arene3/arbitre\nArena 4: {url}/arene4/arbitre\n\nKiosk-Anzeige (öffentlicher Bildschirm): {url}/kiosk\nLive-Rangliste: {url}/\n\nTeilen Sie diese URLs mit Schiedsrichtern mit Tablets.\nStellen Sie sicher, dass die Windows-Firewall Verbindungen auf Port {port} zulässt.',
    remoteNotStarted: 'Der Fernpunkteingabe-Server ist nicht gestartet',
    remoteStoppedTitle: 'Fernpunkteingabe gestoppt',
    remoteStoppedMsg: 'Der Fernpunkteingabe-Server wurde gestoppt',
    errTitle: 'Fehler',
    remoteErrStart: 'Fernserver konnte nicht gestartet werden:',
    remoteErrStop: 'Fernserver konnte nicht gestoppt werden:',
    openTitle: 'Wettkampf öffnen',
    filterBpm: 'BellePoule Modern',
    filterClassic: 'BellePoule Classic',
    filterAll: 'Alle Dateien',
    openErr: 'Datei konnte nicht geöffnet werden:',
    saveTitle: 'Wettkampf speichern',
    saveErr: 'Speichern nicht möglich:',
    importTitle: 'Importieren',
    importXmlTitle: 'BellePoule XML-Datei importieren',
    importFffTitle: 'FFE-Liste importieren',
    importRankingTitle: 'FFE-Rangliste importieren',
    importBpfTitle: 'Fechter + Fotos importieren (.bpf)',
    filterXmlBP: 'XML BellePoule',
    filterFfe: 'FFE-Datei',
    filterRanking: 'Ranglistendatei',
    importReadErr: 'Datei konnte nicht gelesen werden:',
    importErrTitle: 'Importfehler',
    aboutTitle: 'Über BellePoule Modern',
    aboutSoftware: 'Fechtwettkampf-Verwaltungssoftware.',
    aboutRewrite:
      'Moderne Neuentwicklung der originalen BellePoule-Software erstellt von Yann Deboeuf.',
    aboutBugHint: 'Zum Melden eines Fehlers bitte angeben:',
  },
  'zh-HK': {
    file: '檔案',
    newCompetition: '新建比賽',
    open: '開啟...',
    save: '儲存',
    saveAs: '另存為...',
    export: '匯出',
    exportXml: '匯出 XML (BellePoule)',
    exportCsv: '匯出 CSV',
    exportPdf: '匯出 PDF',
    exportFencersTxt: '匯出劍手 (.txt)',
    exportFencersFff: '匯出劍手 (.fff)',
    exportFencersBpf: '匯出劍手 + 照片 (.bpf)',
    exportPhotos: '匯出照片 (.zip)',
    import: '匯入',
    importXml: '匯入 XML (BellePoule)',
    importFff: '匯入 FFE 名單 (.fff)',
    importRanking: '匯入 FFE 排名',
    importFencersBpf: '匯入劍手 + 照片 (.bpf)',
    settings: '設定...',
    quit: '退出',
    edit: '編輯',
    undo: '復原',
    redo: '重做',
    cut: '剪切',
    copy: '複製',
    paste: '貼上',
    selectAll: '全選',
    competition: '比賽',
    properties: '屬性',
    addFencer: '新增劍手',
    addReferee: '新增裁判',
    startRemote: '⚡ 啟動遠程計分',
    stopRemote: '🛑 停止遠程計分',
    nextPhase: '下一輪',
    view: '顯示',
    reload: '重新載入',
    forceReload: '強制重新載入',
    devTools: '開發者工具',
    resetZoom: '重置縮放',
    zoomIn: '放大',
    zoomOut: '縮小',
    fullscreen: '切換全螢幕',
    help: '說明',
    about: '關於 BellePoule Modern',
    updates: '🔄 檢查更新...',
    updatesUnavailable: '更新系統不可用',
    updatesTitle: '更新',
    docs: '文件',
    reportBug: '📝 回報錯誤 / 建議',
    remoteTitle: '遠程計分',
    remoteAlreadyStarted: '遠程計分伺服器已啟動',
    remoteStartedTitle: '遠程計分已啟動',
    remoteStartedMsg: '裁判現在可以連線',
    remoteDetailTemplate:
      '賽場 1: {url}/arene1/arbitre\n賽場 2: {url}/arene2/arbitre\n賽場 3: {url}/arene3/arbitre\n賽場 4: {url}/arene4/arbitre\n\nKiosk 顯示（公開大螢幕）: {url}/kiosk\n即時排名: {url}/\n\n請將這些網址分享給使用平板電腦的裁判。\n請確保 Windows 防火牆允許連接埠 {port} 上的連線。',
    remoteNotStarted: '遠程計分伺服器尚未啟動',
    remoteStoppedTitle: '遠程計分已停止',
    remoteStoppedMsg: '遠程計分伺服器已停止',
    errTitle: '錯誤',
    remoteErrStart: '無法啟動遠程伺服器:',
    remoteErrStop: '無法停止遠程伺服器:',
    openTitle: '開啟比賽',
    filterBpm: 'BellePoule Modern',
    filterClassic: 'BellePoule Classic',
    filterAll: '所有檔案',
    openErr: '無法開啟檔案:',
    saveTitle: '儲存比賽',
    saveErr: '無法儲存:',
    importTitle: '匯入',
    importXmlTitle: '匯入 BellePoule XML 檔案',
    importFffTitle: '匯入 FFE 名單',
    importRankingTitle: '匯入 FFE 排名',
    importBpfTitle: '匯入劍手 + 照片 (.bpf)',
    filterXmlBP: 'XML BellePoule',
    filterFfe: 'FFE 檔案',
    filterRanking: '排名檔案',
    importReadErr: '無法讀取檔案:',
    importErrTitle: '匯入錯誤',
    aboutTitle: '關於 BellePoule Modern',
    aboutSoftware: '劍擊比賽管理軟件。',
    aboutRewrite: '由 Yann Deboeuf 創建的 BellePoule 原版軟件的現代重寫版本。',
    aboutBugHint: '回報錯誤時請提及:',
  },
};

// ============================================================================
// Localized Label Helper
// ============================================================================

function getL(): Record<string, string> {
  const lang = (
    MENU_LABELS[currentMenuLanguage as MenuLang] ? currentMenuLanguage : 'fr'
  ) as MenuLang;
  return MENU_LABELS[lang];
}

// ============================================================================
// Version Information
// ============================================================================

function getVersionInfo(): { version: string; build: number; date: string } {
  try {
    const versionPaths = [
      path.join(app.getAppPath(), 'version.json'),
      path.join(app.getAppPath(), '..', 'version.json'),
      path.join(__dirname, '..', '..', 'version.json'),
      path.join(process.cwd(), 'version.json'),
    ];

    for (const versionPath of versionPaths) {
      if (fs.existsSync(versionPath)) {
        const content = fs.readFileSync(versionPath, 'utf-8');
        return JSON.parse(content);
      }
    }
  } catch (e) {
    console.error('Failed to read version.json:', e);
  }

  // Fallback: lire depuis package.json
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const match = pkg.version.match(/(\d+\.\d+\.\d+)(?:-build\.(\d+))?/);
      if (match) {
        return {
          version: match[1],
          build: parseInt(match[2]) || 0,
          date: new Date().toISOString(),
        };
      }
    }
  } catch (e) {
    console.error('Failed to read package.json:', e);
  }

  return { version: '1.0.0', build: 0, date: 'Unknown' };
}

// ============================================================================
// Window Creation
// ============================================================================

function createWindow(initialLang?: string): void {
  const versionInfo = getVersionInfo();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    backgroundColor: '#f3f4f6',
    title: `BellePoule Modern v${versionInfo.version} (Build #${versionInfo.build})`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      v8CacheOptions: 'code',
      additionalArguments: initialLang ? [`--initial-lang=${initialLang}`] : [],
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
  });

  const showFallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      closeSplash(() => mainWindow?.show());
    }
  }, 10000);
  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallback);
    closeSplash(() => mainWindow?.show());
  });

  // Allow camera access for webcam photo capture
  const cameraPermissions = new Set(['media', 'camera', 'microphone']);
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(cameraPermissions.has(permission));
    }
  );

  // Security: Set CSP headers for all requests
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self' blob:; " +
            "connect-src 'self' http://localhost:* https://api.github.com; " +
            "frame-ancestors 'none';",
        ],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
      },
    });
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:8066');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Reload renderer when it crashes (blank screen symptom)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    closeSplash();
    console.error('[Main] Renderer process gone:', details.reason, details.exitCode);
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (process.env.NODE_ENV === 'development') {
            mainWindow.loadURL('http://localhost:8066');
          } else {
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
          }
        }
      }, 500);
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Main] Renderer became unresponsive');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('[Main] Renderer became responsive again');
  });

  // Create application menu using saved language preference
  mainWindow.webContents.once('did-finish-load', async () => {
    if (initialLang) {
      currentMenuLanguage = initialLang;
    } else {
      try {
        const savedLang = await mainWindow!.webContents.executeJavaScript(
          'localStorage.getItem("bellepoule-language")'
        );
        if (savedLang && typeof savedLang === 'string') {
          currentMenuLanguage = savedLang;
        }
      } catch {
        // ignore
      }
    }
    createMenu(currentMenuLanguage);

    // Restore persisted logo and sync to renderer localStorage if not already set
    const logoPath = path.join(app.getPath('userData'), 'logo.dat');
    fs.promises
      .readFile(logoPath, 'utf-8')
      .then(logo => {
        if (logo) mainWindow?.webContents.send('app:logoLoaded', logo);
      })
      .catch(() => {
        /* logo optionnel */
      });
  });
}

// ============================================================================
// Application Menu
// ============================================================================

function createMenu(language?: string): void {
  const lang = (MENU_LABELS[language as MenuLang] ? language : 'fr') as MenuLang;
  const L = MENU_LABELS[lang];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: L.file,
      submenu: [
        {
          label: L.newCompetition,
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-competition'),
        },
        {
          label: L.open,
          accelerator: 'CmdOrCtrl+O',
          click: handleOpenFile,
        },
        { type: 'separator' },
        {
          label: L.save,
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            try {
              db.forceSave();
              console.log('Sauvegarde manuelle effectuée');
              mainWindow?.webContents.send('menu:save');
            } catch (error) {
              console.error('Échec sauvegarde manuelle:', error);
              mainWindow?.webContents.send('autosave:failed');
            }
          },
        },
        {
          label: L.saveAs,
          accelerator: 'CmdOrCtrl+Shift+S',
          click: handleSaveAs,
        },
        { type: 'separator' },
        {
          label: L.export,
          submenu: [
            { label: L.exportXml, click: () => handleExport('xml') },
            { label: L.exportCsv, click: () => handleExport('csv') },
            { label: L.exportPdf, click: () => handleExport('pdf') },
            { type: 'separator' },
            { label: L.exportFencersTxt, click: () => handleExport('fencers-txt') },
            { label: L.exportFencersFff, click: () => handleExport('fencers-fff') },
            { label: L.exportFencersBpf, click: () => handleExport('fencers-bpf') },
            { label: L.exportPhotos, click: () => handleExport('photos') },
          ],
        },
        {
          label: L.import,
          submenu: [
            { label: L.importXml, click: () => handleImport('xml') },
            { label: L.importFff, click: () => handleImport('fff') },
            { label: L.importRanking, click: () => handleImport('ranking') },
            { label: L.importFencersBpf, click: () => handleImport('fencers-bpf') },
          ],
        },
        { type: 'separator' },
        {
          label: L.settings,
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('menu:open-settings'),
        },
        { type: 'separator' },
        {
          label: L.quit,
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: L.edit,
      submenu: [
        { role: 'undo', label: L.undo },
        { role: 'redo', label: L.redo },
        { type: 'separator' },
        { role: 'cut', label: L.cut },
        { role: 'copy', label: L.copy },
        { role: 'paste', label: L.paste },
        { role: 'selectAll', label: L.selectAll },
      ],
    },
    {
      label: L.competition,
      submenu: [
        {
          label: L.properties,
          click: () => mainWindow?.webContents.send('menu:competition-properties'),
        },
        { type: 'separator' },
        {
          label: L.addFencer,
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send('menu:add-fencer'),
        },
        {
          label: L.addReferee,
          click: () => mainWindow?.webContents.send('menu:add-referee'),
        },
        { type: 'separator' },
        {
          label: L.startRemote,
          click: () => startRemoteScoreServer(),
        },
        {
          label: L.stopRemote,
          click: () => stopRemoteScoreServer(),
        },
        { type: 'separator' },
        {
          label: L.nextPhase,
          accelerator: 'CmdOrCtrl+Right',
          click: () => mainWindow?.webContents.send('menu:next-phase'),
        },
      ],
    },
    {
      label: L.view,
      submenu: [
        { role: 'reload', label: L.reload },
        { role: 'forceReload', label: L.forceReload },
        { role: 'toggleDevTools', label: L.devTools },
        { type: 'separator' },
        { role: 'resetZoom', label: L.resetZoom },
        { role: 'zoomIn', label: L.zoomIn },
        { role: 'zoomOut', label: L.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: L.fullscreen },
      ],
    },
    {
      label: L.help,
      submenu: [
        {
          label: L.about,
          accelerator: 'F1',
          click: showAbout,
        },
        {
          label: L.updates,
          click: async () => {
            if (autoUpdater) {
              await autoUpdater.showUpdateDialog();
            } else {
              dialog.showMessageBox(mainWindow!, {
                type: 'warning',
                title: L.updatesTitle,
                message: L.updatesUnavailable,
                buttons: ['OK'],
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: L.docs,
          click: () => {
            shell.openExternal('https://github.com/klinnex/bellepoule-modern/wiki');
          },
        },
        {
          label: L.reportBug,
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            mainWindow?.webContents.send('menu:report-issue');
          },
        },
        { type: 'separator' },
        {
          label: 'GitHub',
          click: () => {
            shell.openExternal('https://github.com/klinnex/bellepoule-modern');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================================
// Remote Score Server
// ============================================================================

function startRemoteScoreServer(): void {
  const L = getL();
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: L.remoteTitle,
    message: 'Utilisez le panneau "Saisie distante" dans l\'onglet compétition.',
    buttons: ['OK'],
  });
}

function stopRemoteScoreServer(): void {
  startRemoteScoreServer();
}

// ============================================================================
// File Handlers
// ============================================================================

async function handleOpenFile(): Promise<void> {
  const L = getL();
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: L.openTitle,
    filters: [
      { name: L.filterBpm, extensions: ['bpm', 'db'] },
      { name: L.filterClassic, extensions: ['cotcot', 'cocot'] },
      { name: L.filterAll, extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filepath = result.filePaths[0];
    try {
      await db.importFromFile(filepath);
      mainWindow?.webContents.send('file:opened', filepath);
    } catch (error) {
      dialog.showErrorBox(L.errTitle, `${L.openErr} ${error}`);
    }
  }
}

async function handleSaveAs(): Promise<void> {
  const L = getL();
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: L.saveTitle,
    defaultPath: 'competition.bpm',
    filters: [{ name: L.filterBpm, extensions: ['bpm'] }],
  });

  if (!result.canceled && result.filePath) {
    try {
      await db.exportToFile(result.filePath);
      mainWindow?.webContents.send('file:saved', result.filePath);
    } catch (error) {
      dialog.showErrorBox(L.errTitle, `${L.saveErr} ${error}`);
    }
  }
}

async function handleExport(format: string): Promise<void> {
  mainWindow?.webContents.send('menu:export', format);
}

async function handleImport(format: string): Promise<void> {
  const L = getL();
  let filters: Electron.FileFilter[] = [];
  let title = L.importTitle;

  switch (format) {
    case 'xml':
      title = L.importXmlTitle;
      filters = [{ name: L.filterXmlBP, extensions: ['xml', 'cotcot'] }];
      break;
    case 'fff':
      title = L.importFffTitle;
      filters = [{ name: L.filterFfe, extensions: ['fff', 'csv', 'txt'] }];
      break;
    case 'ranking':
      title = L.importRankingTitle;
      filters = [{ name: L.filterRanking, extensions: ['fff', 'csv', 'txt', 'xlsx'] }];
      break;
    case 'fencers-bpf':
      title = L.importBpfTitle;
      filters = [{ name: 'BellePoule Fencers', extensions: ['bpf'] }];
      break;
    default:
      filters = [{ name: L.filterAll, extensions: ['*'] }];
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    title,
    filters,
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filepath = result.filePaths[0];
    try {
      if (format === 'fencers-bpf') {
        // Fichier binaire : envoyer uniquement le chemin, le renderer appellera importFencersArchive
        mainWindow?.webContents.send('menu:import', format, filepath, '');
      } else {
        const content = await fs.promises.readFile(filepath, 'utf-8');
        mainWindow?.webContents.send('menu:import', format, filepath, content);
      }
    } catch (error) {
      dialog.showErrorBox(L.importErrTitle, `${L.importReadErr} ${error}`);
    }
  }
}

function showAbout(): void {
  mainWindow?.webContents.send('menu:show-about');
}

// ============================================================================
// IPC Handlers - Database Operations
// ============================================================================

// Competition handlers
ipcMain.handle('db:createCompetition', async (_, data) => {
  return db.createCompetition(data);
});

ipcMain.handle('db:getCompetition', async (_, id) => {
  return db.getCompetition(id);
});

ipcMain.handle('db:getAllCompetitions', async () => {
  return db.getAllCompetitions();
});

ipcMain.handle('db:deleteCompetition', async (_, id) => {
  return db.deleteCompetition(id);
});

ipcMain.handle('db:updateCompetition', async (_, id, updates) => {
  return db.updateCompetition(id, updates);
});

// Fencer handlers
ipcMain.handle('db:addFencer', async (_, competitionId, fencer) => {
  return db.addFencer(competitionId, fencer);
});

ipcMain.handle('db:getFencer', async (_, id) => {
  return db.getFencer(id);
});

ipcMain.handle('db:getFencersByCompetition', async (_, competitionId) => {
  return db.getFencersByCompetition(competitionId);
});

ipcMain.handle('db:updateFencer', async (_, id, updates) => {
  return db.updateFencer(id, updates);
});

ipcMain.handle('db:deleteFencer', async (_, id) => {
  return db.deleteFencer(id);
});

ipcMain.handle('db:deleteAllFencers', async (_, competitionId) => {
  return db.deleteAllFencers(competitionId);
});

// Match handlers
ipcMain.handle('db:createMatch', async (_, match, poolId) => {
  return db.createMatch(match, poolId);
});

ipcMain.handle('db:getMatch', async (_, id) => {
  return db.getMatch(id);
});

ipcMain.handle('db:getMatchesByPool', async (_, poolId) => {
  return db.getMatchesByPool(poolId);
});

ipcMain.handle('db:updateMatch', async (_, id, updates) => {
  const hasScore = updates.scoreA !== undefined || updates.scoreB !== undefined;
  if (hasScore) {
    try {
      const prev = db.getMatch(id);
      db.updateMatch(id, updates);
      if (prev) {
        db.logScoreChange({
          matchId: id,
          poolId: prev.poolId ?? undefined,
          previousScoreA: prev.scoreA,
          previousScoreB: prev.scoreB,
          newScoreA: updates.scoreA ?? prev.scoreA,
          newScoreB: updates.scoreB ?? prev.scoreB,
          changedBy: 'ui',
        });
      }
    } catch {
      db.updateMatch(id, updates);
    }
  } else {
    db.updateMatch(id, updates);
  }

  // Propager l'assignation d'arbitre au serveur distant
  if (updates.refereeId) {
    for (const { server } of remoteServers.values()) {
      try { server.assignRefereeToMatch(id, updates.refereeId); } catch { /* non bloquant */ }
    }
  }
});

ipcMain.handle('db:upsertTableauMatch', async (_, params) => {
  return db.upsertTableauMatch(params);
});

ipcMain.handle('db:upsertMultipleTableauMatches', async (_, competitionId: string, matches: any[]) => {
  return db.upsertMultipleTableauMatches(competitionId, matches);
});

ipcMain.handle('db:getTableauMatchesForExport', async (_, competitionId: string) => {
  return db.getTableauMatchesForExport(competitionId);
});

// Session State handlers
ipcMain.handle('db:saveSessionState', async (_, competitionId, state) => {
  return db.saveSessionState(competitionId, state);
});

ipcMain.handle('db:getSessionState', async (_, competitionId) => {
  return db.getSessionState(competitionId);
});

// Sync save for beforeunload (renderer cannot await async IPC on close)
ipcMain.on('db:saveSessionStateSync', (event, competitionId: string, state: unknown) => {
  try {
    db.saveSessionState(competitionId, state);
    db.forceSave();
    event.returnValue = true;
  } catch (e) {
    console.error('[DB] Sync session state save failed', e);
    event.returnValue = false;
  }
});

ipcMain.handle('db:clearSessionState', async (_, competitionId) => {
  return db.clearSessionState(competitionId);
});

// Pool handlers
ipcMain.handle('db:updatePool', async (_, pool) => {
  return db.updatePool(pool);
});
ipcMain.handle('db:updatePoolReferee', async (_, poolId, refereeId) => {
  return db.updatePoolReferee(poolId, refereeId);
});
ipcMain.handle('db:createPool', async (_, phaseId, number, poolId) => {
  return db.createPool(phaseId, number, poolId);
});
ipcMain.handle('db:clearPoolsForPhase', async (_, phaseId) => {
  return db.clearPoolsForPhase(phaseId);
});
ipcMain.handle('db:addFencerToPool', async (_, poolId, fencerId, position) => {
  return db.addFencerToPool(poolId, fencerId, position);
});
ipcMain.handle('db:addFencerToPoolMidCompetition', async (_, poolId, fencerId, maxScore) => {
  return db.addFencerToPoolMidCompetition(poolId, fencerId, maxScore ?? 5);
});
ipcMain.handle('db:getPoolFencers', async (_, poolId) => {
  return db.getPoolFencers(poolId);
});
ipcMain.handle('db:getPoolsByPhase', async (_, phaseId) => {
  return db.getPoolsByPhase(phaseId);
});
ipcMain.handle('db:getPoolSignatures', async (_, poolId: string) => {
  return db.getPoolSignatures(poolId);
});
ipcMain.handle('db:getDEMatchSignaturesByMatchIds', async (_, matchIds: string[]) => {
  return db.getDEMatchSignaturesByMatchIds(matchIds);
});

// Phase handlers
ipcMain.handle('db:createPhase', async (_, competitionId, type, order, name) => {
  return db.createPhase(competitionId, type, order, name);
});
ipcMain.handle('db:getPhase', async (_, id) => {
  return db.getPhase(id);
});
ipcMain.handle('db:getPhasesByCompetition', async (_, competitionId) => {
  return db.getPhasesByCompetition(competitionId);
});
ipcMain.handle('db:updatePhase', async (_, id, updates) => {
  return db.updatePhase(id, updates);
});
ipcMain.handle('db:deletePhase', async (_, id) => {
  return db.deletePhase(id);
});

// Referee handlers
ipcMain.handle('db:createReferee', async (_, competitionId, data) => {
  return db.createReferee(competitionId, data);
});
ipcMain.handle('db:getReferee', async (_, id) => {
  return db.getReferee(id);
});
ipcMain.handle('db:getRefereesByCompetition', async (_, competitionId) => {
  return db.getRefereesByCompetition(competitionId);
});
ipcMain.handle('db:updateReferee', async (_, id, updates) => {
  return db.updateReferee(id, updates);
});
ipcMain.handle('db:deleteReferee', async (_, id) => {
  return db.deleteReferee(id);
});
ipcMain.handle('db:getMatchesWithReferees', async (_, competitionId) => {
  return db.getMatchesWithReferees(competitionId);
});

// Touch / Card read handlers
ipcMain.handle('db:getTouches', async (_, matchId) => {
  return db.getTouches(matchId);
});
ipcMain.handle('db:getCards', async (_, matchId) => {
  return db.getCards(matchId);
});

// Statistiques combattants
ipcMain.handle('db:saveTouch', async (_, touch) => {
  return db.saveTouch(touch);
});

ipcMain.handle('db:saveCard', async (_, card) => {
  return db.saveCard(card);
});

ipcMain.handle('db:updateMatchTiming', async (_, timing) => {
  return db.updateMatchTiming(timing.matchId, timing.startTime, timing.endTime, timing.duration);
});

ipcMain.handle('db:getFencerHistory', async (_, fencerId) => {
  return db.getFencerHistory(fencerId);
});

ipcMain.handle('db:saveArenaExit', async (_, exit) => {
  return db.saveArenaExit(exit);
});

ipcMain.handle('db:getFencerCompetitionStats', async (_, fencerId) => {
  return db.getFencerCompetitionStats(fencerId);
});

ipcMain.handle('db:getCompetitionFencerStats', async (_, competitionId) => {
  return db.getCompetitionFencerStats(competitionId);
});

// Abandon snapshot handlers
ipcMain.handle(
  'db:saveAbandonSnapshot',
  async (_, fencerId, competitionId, previousStatus, abandonType, snapshots) => {
    db.saveAbandonSnapshot(fencerId, competitionId, previousStatus, abandonType, snapshots);
  }
);

ipcMain.handle('db:getAbandonSnapshot', async (_, fencerId) => {
  return db.getAbandonSnapshot(fencerId);
});

ipcMain.handle('db:deleteAbandonSnapshot', async (_, fencerId) => {
  db.deleteAbandonSnapshot(fencerId);
});

ipcMain.handle('db:getScoreAuditLogByCompetition', async (_, competitionId) => {
  return db.getScoreAuditLogByCompetition(competitionId);
});

ipcMain.handle('db:getMatchTimeline', async (_, matchId: string) => {
  return db.getMatchTimeline(matchId);
});

ipcMain.handle('db:getCompetitionTimeline', async (_, competitionId: string) => {
  return db.getCompetitionTimeline(competitionId);
});

// File handlers
ipcMain.handle('file:export', async (_, filepath) => {
  await db.exportToFile(filepath);
});

ipcMain.handle('file:import', async (_, filepath) => {
  await db.importFromFile(filepath);
});

// Écriture atomique asynchrone (temp + rename) — ne bloque pas le main thread
async function writeFileAtomic(filepath: string, content: Buffer | string): Promise<void> {
  const tmpPath = filepath + '.tmp';
  try {
    await fs.promises.writeFile(tmpPath, content);
    try {
      await fs.promises.rename(tmpPath, filepath);
    } catch {
      await fs.promises.writeFile(filepath, content);
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  } catch {
    await fs.promises.writeFile(filepath, content);
  }
}

// File content write handler
ipcMain.handle('file:writeContent', async (_, filepath: string, content: string) => {
  if (!filepath || typeof filepath !== 'string' || !path.isAbsolute(filepath)) {
    throw new Error('Invalid file path');
  }
  const resolved = path.resolve(filepath);
  const appDir = path.resolve(app.getAppPath());
  if (resolved.startsWith(appDir)) {
    throw new Error('Writing inside app directory is not allowed');
  }
  await fs.promises.writeFile(resolved, content, 'utf-8');
});

// Photo ZIP export handler
ipcMain.handle('file:exportPhotos', async (_, competitionId: string, filepath: string) => {
  const photos = db.getFencerPhotos(competitionId);
  const zip = new JSZip();

  for (const { id, license, lastName, firstName, photo } of photos) {
    const base64 = photo.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const filename = license
      ? license
      : `${lastName}_${firstName}_${id.slice(0, 8)}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    zip.file(`${filename}.jpg`, buffer);
  }

  const content = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFileAtomic(filepath, content);

  return { count: photos.length };
});

// Photo ZIP import handler
ipcMain.handle('file:importPhotos', async (_, competitionId: string, filepath: string) => {
  const buffer = await fs.promises.readFile(filepath);
  const zip = await JSZip.loadAsync(buffer);

  const photos: { license: string; photo: string }[] = [];

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const ext = path.extname(filename).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;
    const basename = path.basename(filename, ext);
    const data = await file.async('base64');
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    photos.push({ license: basename, photo: `data:${mimeType};base64,${data}` });
  }

  return db.updateFencerPhotosByLicense(competitionId, photos);
});

// Fencer archive (.bpf) export handler
ipcMain.handle('file:exportFencersArchive', async (_, competitionId: string, filepath: string) => {
  const fencers = db.getFencersByCompetition(competitionId);
  const competition = db.getCompetition(competitionId);
  const zip = new JSZip();
  zip.file(
    'meta.json',
    JSON.stringify({
      version: '1',
      competitionName: competition?.title ?? '',
      exportDate: new Date().toISOString(),
      count: fencers.length,
    })
  );
  zip.file('fencers.json', JSON.stringify(fencers));
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await writeFileAtomic(filepath, content);
  return { count: fencers.length };
});

// Fencer archive (.bpf) import handler
ipcMain.handle('file:importFencersArchive', async (_, competitionId: string, filepath: string) => {
  const buffer = await fs.promises.readFile(filepath);
  const zip = await JSZip.loadAsync(buffer);
  const fencersFile = zip.file('fencers.json');
  if (!fencersFile) throw new Error('Format .bpf invalide : fencers.json manquant');
  const fencers = JSON.parse(await fencersFile.async('string'));
  return db.upsertFencersByLicense(competitionId, fencers);
});

// Dialog handlers
ipcMain.handle('dialog:openFile', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, options);

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return { filePath, content };
    } catch (error) {
      console.error('Error reading file:', error);
      return { filePath, content: '' };
    }
  }

  return null;
});

ipcMain.handle('dialog:saveFile', async (_, options) => {
  return dialog.showSaveDialog(mainWindow!, options);
});

// Window resize handler
ipcMain.handle('window:setSize', (_event, width: number, height: number) => {
  if (mainWindow) {
    mainWindow.setSize(Math.max(width, 800), Math.max(height, 600), true);
  }
});

// Print handler
ipcMain.handle('window:print', async () => {
  if (mainWindow) {
    await mainWindow.webContents.print({ silent: false, printBackground: true });
  }
});

// Print via hidden BrowserWindow — opens system print dialog on clean HTML
ipcMain.handle('file:printHtml', async (_, html: string) => {
  const tmpFile = path.join(os.tmpdir(), `bp-print-${Date.now()}.html`);
  try {
    await fs.promises.writeFile(tmpFile, html, 'utf-8');
  } catch (e) {
    return { success: false, error: `Impossible de créer le fichier temporaire: ${e}` };
  }

  return new Promise<{ success: boolean; error?: string }>(resolve => {
    const printWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false },
    });
    printWin.setMenu(null);
    printWin.loadFile(tmpFile);

    printWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        printWin.webContents.print({ silent: false, printBackground: true }, (success: boolean) => {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            /* ignore */
          }
          printWin.destroy();
          resolve({ success });
        });
      }, 800);
    });

    printWin.webContents.once('did-fail-load', () => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      printWin.destroy();
      resolve({ success: false, error: 'Chargement HTML échoué' });
    });
  });
});

// PDF generation via hidden BrowserWindow (propre, sans menus d'application)
ipcMain.handle('file:printHtmlToPDF', async (_, html: string, outputPath: string) => {
  const tmpFile = path.join(os.tmpdir(), `bp-pdf-${Date.now()}.html`);
  try {
    await fs.promises.writeFile(tmpFile, html, 'utf-8');
  } catch (e) {
    return { success: false, error: `Impossible de créer le fichier temporaire: ${e}` };
  }

  return new Promise<{ success: boolean; path?: string; error?: string }>(resolve => {
    const pdfWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
      },
    });
    pdfWin.setMenu(null);

    pdfWin.loadFile(tmpFile);

    pdfWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
      pdfWin.webContents
        .printToPDF({
          printBackground: true,
          landscape: false,
          pageSize: 'A4',
          preferCSSPageSize: true,
          margins: { marginType: 'none' },
        })
        .then(async (data: Buffer) => {
          try {
            await fs.promises.writeFile(outputPath, data);
            resolve({ success: true, path: outputPath });
          } catch (writeErr) {
            resolve({ success: false, error: `Impossible d'écrire le PDF: ${writeErr}` });
          } finally {
            fs.promises.unlink(tmpFile).catch(() => {});
            pdfWin.destroy();
          }
        })
        .catch((err: Error) => {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            /* ignore */
          }
          pdfWin.destroy();
          resolve({ success: false, error: err.message });
        });
      }, 800);
    });

    pdfWin.webContents.once('did-fail-load', () => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      pdfWin.destroy();
      resolve({ success: false, error: 'Chargement HTML échoué' });
    });
  });
});

// Shell handlers
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  // N'autoriser que les URLs https:// pour éviter les exploits via des schémas arbitraires
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    console.warn('[shell:openExternal] URL rejetée (schéma non-https):', url);
    return;
  }
  await shell.openExternal(url);
});

// Remote score server handlers
ipcMain.handle('remote:getNetworkInterfaces', async () => {
  const ifaces = os.networkInterfaces();
  const result: { name: string; address: string }[] = [
    { name: 'Toutes les interfaces', address: '0.0.0.0' },
  ];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const iface of addrs || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        result.push({ name: `${name} (${iface.address})`, address: iface.address });
      }
    }
  }
  return { success: true, interfaces: result };
});

ipcMain.handle('remote:startServer', async (_event, competitionId: string, port?: number, host?: string, useHttps?: boolean) => {
  try {
    if (remoteServers.has(competitionId)) {
      return { success: false, error: 'Le serveur est déjà démarré pour cette compétition' };
    }

    const effectivePort = findAvailablePort(port);
    const effectiveHost = host ?? '0.0.0.0';

    let tlsOptions: { cert: string; key: string } | undefined;
    let certFingerprint: string | undefined;
    if (useHttps) {
      try {
        const bundle = await ensureCert(app.getPath('userData'));
        tlsOptions = { cert: bundle.cert, key: bundle.key };
        certFingerprint = bundle.fingerprint;
      } catch (certError) {
        console.error('Erreur génération certificat TLS:', certError);
        return { success: false, error: 'Impossible de générer le certificat TLS' };
      }
    }

    const server = new RemoteScoreServer(db, effectivePort, effectiveHost, tlsOptions);
    try {
      await server.start();
    } catch (startError: any) {
      console.error('Error binding remote server port:', startError);
      return { success: false, error: startError?.message ?? 'Port indisponible' };
    }
    remoteServers.set(competitionId, { server, port: effectivePort, host: effectiveHost, useHttps: !!useHttps, certFingerprint });
    usedPorts.add(effectivePort);

    // Appliquer la config TTS persistée aux tablettes de ce nouveau serveur
    try {
      const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
      server.setTtsConfig(JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8')));
    } catch {
      /* config TTS optionnelle */
    }

    (global as any).mainWindow = mainWindow;

    return {
      success: true,
      serverInfo: {
        url: server.getServerUrl(),
        ip: server.getLocalIPAddress(),
        port: effectivePort,
        useHttps: !!useHttps,
        certFingerprint,
      },
    };
  } catch (error) {
    console.error('Error starting remote server:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:stopServer', async (_event, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: "Le serveur n'est pas démarré pour cette compétition" };
    }

    entry.server.stop();
    usedPorts.delete(entry.port);
    remoteServers.delete(competitionId);

    return { success: true };
  } catch (error) {
    console.error('Error stopping remote server:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getServerInfo', async (_event, competitionId: string) => {
  const entry = remoteServers.get(competitionId);
  if (!entry) {
    return { success: false, error: "Le serveur n'est pas démarré pour cette compétition" };
  }

  return {
    success: true,
    serverInfo: {
      url: entry.server.getServerUrl(),
      ip: entry.server.getLocalIPAddress(),
      port: entry.port,
      useHttps: entry.useHttps,
      certFingerprint: entry.certFingerprint,
    },
  };
});

ipcMain.handle('remote:getCertFingerprint', async () => {
  try {
    const bundle = await ensureCert(app.getPath('userData'));
    return { success: true, fingerprint: bundle.fingerprint };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

// Remote session handlers
ipcMain.handle(
  'remote:startSession',
  async (
    _,
    competitionId: string,
    strips: number,
    matches?: any[],
    showPhotos?: boolean,
    kioskViews?: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean },
    cardAnnounce?: boolean
  ) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
      }

      const session = await entry.server.startSession(
        competitionId,
        strips,
        matches,
        showPhotos,
        kioskViews,
        cardAnnounce
      );
      return { success: true, session };
    } catch (error) {
      console.error('Error starting session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateMatchArena',
  async (
    _,
    competitionId: string,
    matchId: string,
    fromArena: number | null,
    toArena: number | null,
    fencerA?: any,
    fencerB?: any
  ) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'Serveur non démarré' };
      entry.server.updateMatchArena(matchId, fromArena, toArena, fencerA, fencerB);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

ipcMain.handle(
  'remote:updatePoolFencers',
  async (_, competitionId: string, updates: Array<{ poolId: string; fencers: any[] }>) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'Serveur non démarré' };
      entry.server.updatePoolFencers(updates);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

ipcMain.handle(
  'remote:syncPoolMatches',
  async (_, competitionId: string, poolsData: Array<{ poolId: string; matches: any[] }>) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'Serveur non démarré' };
      entry.server.syncPoolMatches(poolsData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
    }
  }
);

ipcMain.handle('remote:refreshDeMatches', async (_, competitionId: string, matches: any[]) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.refreshDeMatches(matches);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('remote:resetPoolMatch', async (_, competitionId: string, matchId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: true };
    entry.server.resetPoolMatch(matchId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('remote:finishPoolMatch', async (_, competitionId: string, matchId: string, scoreA: number, scoreB: number) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: true };
    entry.server.finishPoolMatch(matchId, scoreA, scoreB);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('remote:stopSession', async (_event, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }

    entry.server.stopSession();
    return { success: true };
  } catch (error) {
    console.error('Error stopping session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:launchCompetition', async (_event, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }

    entry.server.launchCompetition();
    return { success: true };
  } catch (error) {
    console.error('Error launching competition:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getSession', async (_event, competitionId: string) => {
  const entry = remoteServers.get(competitionId);
  if (!entry) {
    return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
  }

  return { success: true, session: entry.server.getSession() };
});

ipcMain.handle('remote:getArenas', async (_event, competitionId: string) => {
  const entry = remoteServers.get(competitionId);
  if (!entry) {
    return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
  }

  return { success: true, arenas: entry.server.getAllArenas() };
});

ipcMain.handle('remote:updateStripCount', async (_, competitionId: string, newCount: number) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }

    const session = entry.server.updateStripCount(newCount);
    return { success: true, session };
  } catch (error) {
    console.error('Error updating strip count:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:updateShowPhotos', async (_, competitionId: string, value: boolean) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }
    entry.server.updateShowPhotos(value);
    return { success: true };
  } catch (error) {
    console.error('Error updating showPhotos:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:updateCardAnnounce', async (_, competitionId: string, value: boolean) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }
    entry.server.updateCardAnnounce(value);
    return { success: true };
  } catch (error) {
    console.error('Error updating cardAnnounce:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:updateTheme', async (_, competitionId: string, theme: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }
    entry.server.updateTheme(theme as any);
    return { success: true };
  } catch (error) {
    console.error('Error updating theme:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle(
  'remote:updateArenaTheme',
  async (_, competitionId: string, arenaId: string, theme: string, customTheme?: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
      }
      entry.server.updateArenaTheme(arenaId, theme as any, customTheme);
      return { success: true };
    } catch (error) {
      console.error('Error updating arena theme:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:clearArenaThemeOverride',
  async (_, competitionId: string, arenaId: string) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
      entry.server.clearArenaThemeOverride(arenaId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateKioskViews',
  async (_, competitionId: string, views: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean }) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
      }
      entry.server.updateKioskViews(views);
      return { success: true };
    } catch (error) {
      console.error('Error updating kioskViews:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateKioskTheme',
  async (_, competitionId: string, variables: Record<string, string>) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) {
        return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
      }
      entry.server.updateKioskTheme(variables);
      return { success: true };
    } catch (error) {
      console.error('Error updating kiosk theme:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

ipcMain.handle(
  'remote:updateArenaScreenTheme',
  async (_, competitionId: string, arenaId: string, targetType: string, customTheme?: any) => {
    try {
      const entry = remoteServers.get(competitionId);
      if (!entry) return { success: false, error: 'Serveur non démarré' };
      entry.server.updateArenaScreenTheme(arenaId, targetType as any, customTheme);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }
);

// ── Bibliothèque de thèmes (persistante dans userData) ──────────────────────

function getThemesFilePath(): string {
  return path.join(app.getPath('userData'), 'themes.json');
}

function readThemesFile(): unknown[] {
  try {
    const raw = fs.readFileSync(getThemesFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeThemesFile(themes: unknown[]): void {
  fs.writeFileSync(getThemesFilePath(), JSON.stringify(themes, null, 2), 'utf-8');
}

ipcMain.handle('themes:list', () => {
  return readThemesFile();
});

ipcMain.handle('themes:save', (_, theme: unknown) => {
  try {
    const themes = readThemesFile() as any[];
    const t = theme as { id: string };
    const idx = themes.findIndex((x: any) => x.id === t.id);
    if (idx >= 0) themes[idx] = t;
    else themes.push(t);
    writeThemesFile(themes);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('themes:delete', (_, id: string) => {
  try {
    const themes = readThemesFile() as any[];
    writeThemesFile(themes.filter((x: any) => x.id !== id));
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
});

ipcMain.handle('remote:setArenaPassword', async (_, competitionId: string, arenaId: string, password: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }
    entry.server.setArenaPassword(arenaId, password);
    return { success: true };
  } catch (error) {
    console.error('Error setting arena password:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setOrgNote', async (_, competitionId: string, note: any) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }
    entry.server.setOrgNote(note);
    mainWindow?.webContents.send('kiosk:note', note);
    return { success: true };
  } catch (error) {
    console.error('Error setting org note:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:clearOrgNote', async (_event, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur distant n est pas démarré pour cette compétition' };
    }
    entry.server.clearOrgNote();
    mainWindow?.webContents.send('kiosk:note', null);
    return { success: true };
  } catch (error) {
    console.error('Error clearing org note:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:acknowledgeDTCall', async (_, competitionId: string, arenaId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.acknowledgeDTCall(arenaId);
    return { success: true };
  } catch (error) {
    console.error('Error acknowledging DT call:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setWebhookUrl', async (_, url: string | null) => {
  try {
    for (const { server } of remoteServers.values()) {
      server.setWebhookUrl(url);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:updateLogo', async (_, logo: string | null) => {
  try {
    const logoPath = path.join(app.getPath('userData'), 'logo.dat');
    if (logo) {
      await fs.promises.writeFile(logoPath, logo, 'utf-8');
    } else {
      try {
        fs.unlinkSync(logoPath);
      } catch {
        /* déjà absent */
      }
    }
    for (const { server } of remoteServers.values()) {
      server.setLogo(logo);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setWallpaper', async (_, competitionId: string, wallpaper: string | null) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false };
    entry.server.setWallpaper(wallpaper);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:changePort', async (_, competitionId: string, newPort: number) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) {
      return { success: false, error: 'Le serveur n est pas démarré pour cette compétition' };
    }
    if (usedPorts.has(newPort) && newPort !== entry.port) {
      return { success: false, error: `Le port ${newPort} est déjà utilisé` };
    }
    const { host, useHttps, certFingerprint } = entry;
    let tlsOptions: { cert: string; key: string } | undefined;
    if (useHttps && certFingerprint) {
      try {
        const bundle = await ensureCert(app.getPath('userData'));
        tlsOptions = { cert: bundle.cert, key: bundle.key };
      } catch {
        /* ignore — redémarre en HTTP si cert inaccessible */
      }
    }
    entry.server.stop();
    usedPorts.delete(entry.port);
    const server = new RemoteScoreServer(db, newPort, host, tlsOptions);
    server.start();
    remoteServers.set(competitionId, { server, port: newPort, host, useHttps: !!tlsOptions, certFingerprint });
    usedPorts.add(newPort);
    return {
      success: true,
      serverInfo: {
        url: server.getServerUrl(),
        ip: server.getLocalIPAddress(),
        port: newPort,
        useHttps: !!tlsOptions,
        certFingerprint,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setRegistrationEnabled', async (_, competitionId: string, enabled: boolean) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.setRegistrationEnabled(enabled);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:getConnectedClients', async (_, competitionId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    return { success: true, clients: entry?.server.getConnectedClients() ?? [] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue', clients: [] };
  }
});

ipcMain.handle('remote:sendClientCommand', async (_, competitionId: string, socketId: string, command: any) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.sendClientCommand(socketId, command);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:broadcastCommand', async (_, competitionId: string, command: any) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.broadcastCommand(command);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:renameClient', async (_, competitionId: string, socketId: string, label: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.renameClient(socketId, label);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:identifyClient', async (_, competitionId: string, socketId: string) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.identifyClient(socketId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setClientKioskMode', async (_, competitionId: string, socketId: string, config: any) => {
  try {
    const entry = remoteServers.get(competitionId);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    entry.server.setClientKioskMode(socketId, config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('remote:setTtsConfig', async (_, config: unknown) => {
  try {
    const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
    await fs.promises.writeFile(ttsPath, JSON.stringify(config), 'utf-8');
    for (const { server } of remoteServers.values()) {
      server.setTtsConfig(config as any);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

// Training mode handlers
const TRAINING_ID = '__training__';

ipcMain.handle('training:startServer', async (_event, port?: number, host?: string, useHttps?: boolean) => {
  try {
    if (remoteServers.has(TRAINING_ID)) {
      return { success: false, error: 'Serveur entraînement déjà démarré' };
    }
    const effectivePort = findAvailablePort(port);
    const effectiveHost = host ?? '0.0.0.0';
    let tlsOptions: { cert: string; key: string } | undefined;
    let certFingerprint: string | undefined;
    if (useHttps) {
      try {
        const bundle = await ensureCert(app.getPath('userData'));
        tlsOptions = { cert: bundle.cert, key: bundle.key };
        certFingerprint = bundle.fingerprint;
      } catch (certError) {
        return { success: false, error: 'Impossible de générer le certificat TLS' };
      }
    }
    const server = new RemoteScoreServer(db, effectivePort, effectiveHost, tlsOptions);
    try {
      await server.start();
    } catch (startError: any) {
      return { success: false, error: startError?.message ?? 'Port indisponible' };
    }
    remoteServers.set(TRAINING_ID, { server, port: effectivePort, host: effectiveHost, useHttps: !!useHttps, certFingerprint });
    usedPorts.add(effectivePort);
    try {
      const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
      server.setTtsConfig(JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8')));
    } catch { /* optionnel */ }
    (global as any).mainWindow = mainWindow;
    return {
      success: true,
      serverInfo: {
        url: server.getServerUrl(),
        ip: server.getLocalIPAddress(),
        port: effectivePort,
        useHttps: !!useHttps,
        certFingerprint,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('training:stopServer', async () => {
  try {
    const entry = remoteServers.get(TRAINING_ID);
    if (!entry) return { success: false, error: 'Serveur entraînement non démarré' };
    entry.server.stop();
    usedPorts.delete(entry.port);
    remoteServers.delete(TRAINING_ID);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('training:startSession', async (_event, strips: number, weapon: string, customRules?: any) => {
  try {
    const entry = remoteServers.get(TRAINING_ID);
    if (!entry) return { success: false, error: 'Serveur entraînement non démarré' };
    const session = await entry.server.startTrainingSession(strips, weapon, customRules);
    return { success: true, session };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('training:stopSession', async () => {
  try {
    const entry = remoteServers.get(TRAINING_ID);
    if (!entry) return { success: false, error: 'Serveur entraînement non démarré' };
    entry.server.stopTrainingSession();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('training:getHistory', async () => {
  try {
    const entry = remoteServers.get(TRAINING_ID);
    if (!entry) return { success: true, history: [] };
    return { success: true, history: entry.server.getTrainingHistory() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('training:getSession', async () => {
  try {
    const entry = remoteServers.get(TRAINING_ID);
    if (!entry) return { success: true, session: null };
    return { success: true, session: entry.server.getSession() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('training:getArenas', async () => {
  try {
    const entry = remoteServers.get(TRAINING_ID);
    if (!entry) return { success: true, arenas: [] };
    return { success: true, arenas: entry.server.getAllArenas() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('training:getServerInfo', async () => {
  try {
    const entry = remoteServers.get(TRAINING_ID);
    if (!entry) return { success: false, error: 'Serveur non démarré' };
    return {
      success: true,
      serverInfo: {
        url: entry.server.getServerUrl(),
        ip: entry.server.getLocalIPAddress(),
        port: entry.port,
        useHttps: entry.useHttps,
        certFingerprint: entry.certFingerprint,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
});

ipcMain.handle('app:getTtsConfig', async () => {
  const ttsPath = path.join(app.getPath('userData'), 'tts-config.json');
  try {
    return JSON.parse(await fs.promises.readFile(ttsPath, 'utf-8'));
  } catch {
    return null;
  }
});

ipcMain.handle('app:getLogo', async () => {
  const logoPath = path.join(app.getPath('userData'), 'logo.dat');
  try {
    return await fs.promises.readFile(logoPath, 'utf-8');
  } catch {
    return null;
  }
});

// App info handlers
ipcMain.handle('app:getVersionInfo', async () => {
  return getVersionInfo();
});

// Language change handler — rebuild native menu in the new language
ipcMain.on('app:language-changed', (_, lang: string) => {
  currentMenuLanguage = lang;
  saveLanguageToFile(lang);
  createMenu(lang);
  for (const { server } of remoteServers.values()) {
    server.setLanguage(lang);
  }
});

// AutoUpdater handlers
ipcMain.handle('updater:check', async () => {
  if (autoUpdater) {
    return await autoUpdater.checkForUpdates();
  }
  return null;
});

ipcMain.handle('updater:setSilentMode', async (_, enabled: boolean) => {
  if (autoUpdater) {
    autoUpdater.setSilentMode(enabled);
    return { success: true, silent: enabled };
  }
  return { success: false, error: 'AutoUpdater not initialized' };
});

ipcMain.handle('updater:getSilentMode', async () => {
  if (autoUpdater) {
    return { silent: autoUpdater.isSilentMode() };
  }
  return { silent: false };
});

ipcMain.handle('updater:hasPendingUpdate', async () => {
  if (autoUpdater) {
    return { hasPending: autoUpdater.hasPendingUpdate() };
  }
  return { hasPending: false };
});

ipcMain.handle('updater:getPendingUpdateInfo', async () => {
  if (autoUpdater) {
    return autoUpdater.getPendingUpdateInfo();
  }
  return null;
});

ipcMain.handle('updater:installPendingUpdate', async () => {
  if (autoUpdater) {
    autoUpdater.checkAndInstallPendingUpdate();
    return { success: true };
  }
  return { success: false, error: 'AutoUpdater not initialized' };
});

// ============================================================================
// safeStorage : chiffrement OS (Keychain/DPAPI/libsecret) pour secrets locaux
// (ex. clé de synchronisation cloud). Renvoie une chaîne base64.
// ============================================================================
ipcMain.handle('crypto:isAvailable', async () => {
  return safeStorage.isEncryptionAvailable();
});

ipcMain.handle('crypto:protect', async (_, plaintext: string) => {
  if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(plaintext).toString('base64');
});

ipcMain.handle('crypto:unprotect', async (_, ciphertextB64: string) => {
  if (typeof ciphertextB64 !== 'string') throw new Error('ciphertext must be a string');
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(ciphertextB64, 'base64'));
});

// ── Classement saisonnier Quest ───────────────────────────────────────────────

ipcMain.handle('db:addCompetitionToSeason', async (_, payload: Parameters<typeof db.addCompetitionToSeason>[0]) => {
  return db.addCompetitionToSeason(payload);
});

ipcMain.handle('db:getSeasonRanking', async () => {
  return db.getSeasonRanking();
});

ipcMain.handle('db:getSeasonCompetitions', async () => {
  return db.getSeasonCompetitions();
});

ipcMain.handle('db:removeCompetitionFromSeason', async (_, competitionId: string) => {
  return db.removeCompetitionFromSeason(competitionId);
});

ipcMain.handle('db:resetSeason', async () => {
  return db.resetSeason();
});

// ── Équipes ───────────────────────────────────────────────────────────────────

ipcMain.handle('db:createTeam', async (_, competitionId: string, name: string, club: string) => {
  return db.createTeam(competitionId, name, club);
});

ipcMain.handle('db:getTeamsByCompetition', async (_, competitionId: string) => {
  return db.getTeamsByCompetition(competitionId);
});

ipcMain.handle('db:deleteTeam', async (_, teamId: string) => {
  return db.deleteTeam(teamId);
});

ipcMain.handle('db:upsertTeamFencer', async (_, teamId: string, fencerId: string, teamOrder: number, isReserve: boolean) => {
  return db.upsertTeamFencer(teamId, fencerId, teamOrder, isReserve);
});

ipcMain.handle('db:removeTeamFencer', async (_, teamId: string, fencerId: string) => {
  return db.removeTeamFencer(teamId, fencerId);
});

ipcMain.handle('db:createTeamMatch', async (_, competitionId: string, poolNumber: number, teamAId: string, teamBId: string) => {
  return db.createTeamMatch(competitionId, poolNumber, teamAId, teamBId);
});

ipcMain.handle('db:getTeamMatchesByCompetition', async (_, competitionId: string) => {
  return db.getTeamMatchesByCompetition(competitionId);
});

ipcMain.handle('db:createTeamBout', async (_, matchId: string, boutOrder: number, fencerAId: string, fencerBId: string, maxScore: number) => {
  return db.createTeamBout(matchId, boutOrder, fencerAId, fencerBId, maxScore);
});

ipcMain.handle('db:updateTeamBout', async (_, boutId: string, scoreA: number, scoreB: number, status: string, winnerId: string | null) => {
  return db.updateTeamBout(boutId, scoreA, scoreB, status, winnerId);
});

// ============================================================================
// App Lifecycle
// ============================================================================

// Lit tous les chunks JS/CSS du renderer en arrière-plan pour les mettre dans
// le cache OS (page cache). Quand Chromium les charge ensuite via loadFile(),
// ils sont déjà en RAM → pas d'accès disque sur le chemin critique.
function prewarmRendererChunks(): void {
  if (process.env.NODE_ENV === 'development') return;
  const rendererDist = path.join(__dirname, '..', 'renderer');
  fs.readdir(rendererDist, (_err, files) => {
    if (!files) return;
    for (const f of files) {
      if (f.endsWith('.js') || f.endsWith('.css')) {
        fs.readFile(path.join(rendererDist, f), () => {});
      }
    }
  });
}

// Rendu logiciel pour VMware/ARM sans GPU — activer via BELLEPOULE_SW_RENDER=1
if (process.platform === 'linux' && process.env.BELLEPOULE_SW_RENDER === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
}

app.whenReady().then(async () => {
  // Afficher le splash immédiatement pendant que tout le reste charge
  createSplashWindow();

  // Cache V8 bytecode — skip la compilation JS aux lancements suivants
  const codeCachePath = path.join(app.getPath('userData'), 'v8-cache');
  session.defaultSession.setCodeCachePath(codeCachePath);

  prewarmRendererChunks();

  // Initialize database dans un répertoire inscriptible (userData)
  // Sur Windows, process.cwd() peut pointer vers C:\Windows\System32 (non inscriptible)
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'bellepoule.db');

  // Migration : si une BDD existe à l'ancien emplacement mais pas au nouveau, la copier
  const legacyDbPath = path.join(process.cwd(), 'bellepoule.db');
  if (legacyDbPath !== dbPath && fs.existsSync(legacyDbPath) && !fs.existsSync(dbPath)) {
    try {
      if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
      fs.copyFileSync(legacyDbPath, dbPath);
      console.log(`Migration BDD: ${legacyDbPath} -> ${dbPath}`);
    } catch (e) {
      console.error('Échec migration BDD:', e);
    }
  }

  // Attendre que l'utilisateur confirme la langue dans le splash
  const confirmedLang = await splashConfirmPromise;

  // Créer la fenêtre principale avec la langue choisie
  createWindow(confirmedLang);

  await db.open(dbPath);
  console.log('Base de données ouverte:', db.getPath());

  // Signaler au renderer que la DB est prête
  mainWindow?.webContents.send('db:ready');

  // Initialize auto updater — dialog différé après affichage de la fenêtre
  if (mainWindow) {
    autoUpdater = new AutoUpdater(mainWindow, {
      autoDownload: false,
      autoInstall: false,
      checkInterval: 12,
      betaChannel: true,
      silent: false,
      installOnQuit: false,
    });

    const win = mainWindow;
    win.once('show', async () => {
      if (!autoUpdater) return;
      if (autoUpdater.hasPendingUpdate()) {
        const pendingInfo = autoUpdater.getPendingUpdateInfo();
        console.log(`[Main] Mise à jour en attente trouvée: v${pendingInfo?.version}`);
        const result = await dialog.showMessageBox(win, {
          type: 'info',
          title: 'Mise à jour en attente',
          message: `La version ${pendingInfo?.version} est prête à être installée.`,
          detail: "Voulez-vous installer cette mise à jour maintenant ? L'application va redémarrer.",
          buttons: ['Installer maintenant', 'Plus tard'],
          defaultId: 0,
          cancelId: 1,
        });
        if (result.response === 0) {
          autoUpdater.checkAndInstallPendingUpdate();
        }
      }
    });
  }

  // Autosave every 2 minutes
  let autosaveInterval: NodeJS.Timeout | null = null;

  let autosaveInFlight = false;
  const startAutosave = () => {
    if (autosaveInterval) clearInterval(autosaveInterval);
    autosaveInterval = setInterval(
      async () => {
        if (autosaveInFlight) return; // éviter l'empilement si la sauvegarde précédente traîne
        autosaveInFlight = true;
        try {
          await db.saveAsync(); // async I/O — ne bloque pas le main thread
          console.log('Autosave completed at', new Date().toISOString());
          mainWindow?.webContents.send('autosave:completed');
        } catch (error) {
          console.error('Autosave failed:', error);
          mainWindow?.webContents.send('autosave:failed');
        } finally {
          autosaveInFlight = false;
        }
      },
      2 * 60 * 1000
    ); // 2 minutes
  };

  startAutosave();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const shutdownDb = () => {
  if (!db.isOpen()) return;
  db.saveSync();
  db.close();
};

app.on('window-all-closed', () => {
  shutdownDb();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  shutdownDb(); // no-op si déjà fermé
});

// Handle uncaught exceptions - save before crash
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  try {
    db.saveSync();
  } catch (e) {
    console.error('Failed to save on crash:', e);
  }
  dialog.showErrorBox('Erreur', `Une erreur inattendue s'est produite: ${error.message}`);
});
