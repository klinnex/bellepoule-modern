/**
 * Wiki intégré : articles avancés (Sabre Laser, import / export, raccourcis).
 * Séparés de wikiData.ts pour rester sous le plafond de taille des fichiers (#1155).
 */
import type { WikiArticle } from './wiki.types';

export const ADVANCED_ARTICLES: WikiArticle[] = [
  // ─── LASER SABRE ────────────────────────────────────────────────────────────
  {
    id: 'laser',
    icon: '⚡',
    category: 'advanced',
    title: {
      fr: 'Sabre Laser',
      en: 'Laser Sabre',
      de: 'Lasersäbel',
      es: 'Sable Láser',
      'zh-HK': '激光軍刀',
      br: 'Gouriz Laser',
      ca: 'Sabre Làser',
    },
    content: {
      fr: [
        {
          type: 'p',
          text: "Le mode Sabre Laser est une variante de l'escrime sportive avec un système de zones de touches à points variables et un système de cartons spécifique.",
        },
        { type: 'h2', text: 'Zones de touches' },
        {
          type: 'ul',
          items: [
            '🟢 Zone A — touche standard : 1 point',
            '🟡 Zone B — touche zone intermédiaire : 3 points',
            '🔴 Zone C — touche zone cible : 5 points',
          ],
        },
        { type: 'h2', text: 'Quest Points' },
        {
          type: 'p',
          text: "Le classement des poules en Sabre Laser trie par V/M, puis par Points Quest par match (1 à 4 points par victoire selon l'écart : moins de 4, 4-7, 8-11, 12 et plus), puis par Indice, puis par victoires de la cotation la plus élevée (V4 → V1).",
        },
        { type: 'h2', text: 'Système de cartons' },
        { type: 'p', text: 'Les cartons sont regroupés en 4 groupes de fautes progressives :' },
        {
          type: 'ul',
          items: [
            'Groupe 1 — Blanc → Jaune → Jaune (fautes légères)',
            'Groupe 2 — Jaune → Rouge → Rouge (fautes moyennes)',
            'Groupe 3 — Rouge → Exclusion (fautes graves)',
            'Groupe 4 — Exclusion immédiate (brutalité, tricherie)',
          ],
        },
        {
          type: 'tip',
          text: 'Les statistiques par zone (A/B/C) sont disponibles dans Analytics (menu ⋯ de la compétition).',
        },
      ],
      en: [
        {
          type: 'p',
          text: 'Laser Sabre mode is a variant of sport fencing with a variable-point touch zone system and a specific card system.',
        },
        { type: 'h2', text: 'Touch Zones' },
        {
          type: 'ul',
          items: [
            '🟢 Zone A — standard touch: 1 point',
            '🟡 Zone B — mid zone touch: 3 points',
            '🔴 Zone C — target zone touch: 5 points',
          ],
        },
        { type: 'h2', text: 'Quest Points' },
        {
          type: 'p',
          text: 'Laser Sabre pool ranking sorts by W/M, then Quest Points per match (1 to 4 points per victory depending on the margin: under 4, 4-7, 8-11, 12 or more), then Index, then victories of the highest rating (V4 → V1).',
        },
        { type: 'h2', text: 'Card System' },
        { type: 'p', text: 'Cards are grouped into 4 progressive fault groups:' },
        {
          type: 'ul',
          items: [
            'Group 1 — White → Yellow → Yellow (minor faults)',
            'Group 2 — Yellow → Red → Red (moderate faults)',
            'Group 3 — Red → Exclusion (serious faults)',
            'Group 4 — Immediate exclusion (brutality, cheating)',
          ],
        },
        {
          type: 'tip',
          text: 'Per-zone statistics (A/B/C) are available in Analytics (competition ⋯ menu).',
        },
      ],
      de: [
        {
          type: 'p',
          text: 'Der Lasersäbel-Modus ist eine Fechtvariante mit variablen Trefferzonen-Punkten und einem spezifischen Kartensystem.',
        },
        { type: 'h2', text: 'Trefferzonen' },
        {
          type: 'ul',
          items: [
            '🟢 Zone A — Standardtreffer: 1 Punkt',
            '🟡 Zone B — Mitteltreffer: 3 Punkte',
            '🔴 Zone C — Zieltreffer: 5 Punkte',
          ],
        },
        { type: 'h2', text: 'Quest Points' },
        {
          type: 'p',
          text: 'Die Pool-Rangliste beim Laserschwert sortiert nach S/G, dann Quest-Punkten pro Gefecht (1 bis 4 Punkte pro Sieg je nach Abstand: unter 4, 4-7, 8-11, 12 und mehr), dann Index, dann Siegen der höchsten Wertung (V4 → V1).',
        },
        { type: 'h2', text: 'Kartensystem' },
        { type: 'p', text: 'Karten sind in 4 progressive Fehlergruppen unterteilt:' },
        {
          type: 'ul',
          items: [
            'Gruppe 1 — Weiß → Gelb → Gelb (leichte Fehler)',
            'Gruppe 2 — Gelb → Rot → Rot (mittlere Fehler)',
            'Gruppe 3 — Rot → Ausschluss (schwere Fehler)',
            'Gruppe 4 — Sofortiger Ausschluss (Brutalität, Betrug)',
          ],
        },
        {
          type: 'tip',
          text: 'Statistiken pro Zone (A/B/C) gibt es unter Analytics (⋯-Menü des Wettkampfs).',
        },
      ],
      es: [
        {
          type: 'p',
          text: 'El modo Sable Láser es una variante de la esgrima deportiva con un sistema de zonas de toque con puntos variables y un sistema de tarjetas específico.',
        },
        { type: 'h2', text: 'Zonas de toque' },
        {
          type: 'ul',
          items: [
            '🟢 Zona A — toque estándar: 1 punto',
            '🟡 Zona B — toque de zona intermedia: 3 puntos',
            '🔴 Zona C — toque de zona objetivo: 5 puntos',
          ],
        },
        { type: 'h2', text: 'Quest Points' },
        {
          type: 'p',
          text: 'La clasificación de poules en Sable Láser ordena por V/C, luego por Puntos Quest por combate (1 a 4 puntos por victoria según la diferencia: menos de 4, 4-7, 8-11, 12 o más), luego por Índice y luego por victorias de la cotización más alta (V4 → V1).',
        },
        { type: 'h2', text: 'Sistema de tarjetas' },
        { type: 'p', text: 'Las tarjetas se agrupan en 4 grupos de faltas progresivas:' },
        {
          type: 'ul',
          items: [
            'Grupo 1 — Blanca → Amarilla → Amarilla (faltas leves)',
            'Grupo 2 — Amarilla → Roja → Roja (faltas medias)',
            'Grupo 3 — Roja → Exclusión (faltas graves)',
            'Grupo 4 — Exclusión inmediata (brutalidad, trampa)',
          ],
        },
        {
          type: 'tip',
          text: 'Las estadísticas por zona (A/B/C) están disponibles en Analytics (menú ⋯ de la competición).',
        },
      ],
      'zh-HK': [
        {
          type: 'p',
          text: '激光軍刀模式是擊劍運動的變體，採用可變分值觸碰區域系統和特定牌罰系統。',
        },
        { type: 'h2', text: '觸碰區域' },
        {
          type: 'ul',
          items: [
            '🟢 A 區 — 標準觸碰：1 分',
            '🟡 B 區 — 中間區域觸碰：3 分',
            '🔴 C 區 — 目標區域觸碰：5 分',
          ],
        },
        { type: 'h2', text: 'Quest Points' },
        {
          type: 'p',
          text: '光劍分組排名依次按勝率、每場 Quest 積分（每場勝仗按分差得 1 至 4 分：少於 4、4-7、8-11、12 或以上）、淨得分，再按最高評級勝場（V4 → V1）排序。',
        },
        { type: 'h2', text: '牌罰系統' },
        { type: 'p', text: '牌罰分為 4 個遞進違規組：' },
        {
          type: 'ul',
          items: [
            '第 1 組 — 白→黃→黃（輕微違規）',
            '第 2 組 — 黃→紅→紅（中度違規）',
            '第 3 組 — 紅→取消資格（嚴重違規）',
            '第 4 組 — 立即取消資格（暴力、作弊）',
          ],
        },
        { type: 'tip', text: '各區（A/B/C）統計可於 Analytics 查看（比賽的 ⋯ 選單）。' },
      ],
      br: [
        {
          type: 'p',
          text: 'Ar mod Gouriz Laser a zo ur variant eus ar klezeourezh sportif gant ur sistem zonoù pouezioù kemmadus ha ur sistem kartelloù spesifik.',
        },
        { type: 'h2', text: 'Zonoù pouezioù' },
        {
          type: 'ul',
          items: [
            '🟢 Zon A — pouez reizh: 1 poent',
            '🟡 Zon B — pouez zon etre-daou: 3 poent',
            '🔴 Zon C — pouez tachenn: 5 poent',
          ],
        },
        { type: 'h2', text: 'Quest Points' },
        {
          type: 'p',
          text: "Renkadur ar poulloù e Klezeour laser a renk dre T/E, goude dre Boentoù Quest dre emgann (1 betek 4 foent dre drec'h hervez an diforc'h : nebeutoc'h eget 4, 4-7, 8-11, 12 ha muioc'h), goude dre Veneg, ha goude dre drec'hioù ar briziadur uhelañ (V4 → V1).",
        },
        { type: 'h2', text: 'Sistem kartelloù' },
        { type: 'p', text: 'Ar kartelloù a zo rummet e 4 strollad fazioù irennant:' },
        {
          type: 'ul',
          items: [
            'Strollad 1 — Gwenn → Melen → Melen (fazioù bihan)',
            'Strollad 2 — Melen → Ruz → Ruz (fazioù etre-daou)',
            'Strollad 3 — Ruz → Diviñs (fazioù bras)',
            'Strollad 4 — Diviñs emgefreek (gwallvezer, tricher)',
          ],
        },
        {
          type: 'tip',
          text: 'Ar stadegoù dre takad (A/B/C) a zo da gaout en Analytics (lañser ⋯ ar genstrivadeg).',
        },
      ],
      ca: [
        {
          type: 'p',
          text: "El mode Sabre Làser és una variant de l'esgrima esportiva amb un sistema de zones de toc amb punts variables i un sistema de targetes específic.",
        },
        { type: 'h2', text: 'Zones de toc' },
        {
          type: 'ul',
          items: [
            '🟢 Zona A — toc estàndard: 1 punt',
            '🟡 Zona B — toc de zona intermèdia: 3 punts',
            '🔴 Zona C — toc de zona objectiu: 5 punts',
          ],
        },
        { type: 'h2', text: 'Quest Points' },
        {
          type: 'p',
          text: 'La classificació de poules en Sabre Làser ordena per V/C, després per Punts Quest per combat (1 a 4 punts per victòria segons la diferència: menys de 4, 4-7, 8-11, 12 o més), després per Índex i després per victòries de la cotització més alta (V4 → V1).',
        },
        { type: 'h2', text: 'Sistema de targetes' },
        { type: 'p', text: "Les targetes s'agrupen en 4 grups de faltes progressives:" },
        {
          type: 'ul',
          items: [
            'Grup 1 — Blanca → Groga → Groga (faltes lleus)',
            'Grup 2 — Groga → Vermella → Vermella (faltes mitjanes)',
            'Grup 3 — Vermella → Exclusió (faltes greus)',
            'Grup 4 — Exclusió immediata (brutalitat, trampa)',
          ],
        },
        {
          type: 'tip',
          text: 'Les estadístiques per zona (A/B/C) estan disponibles a Analytics (menú ⋯ de la competició).',
        },
      ],
    },
  },

  // ─── EXPORT ─────────────────────────────────────────────────────────────────
  {
    id: 'export',
    icon: '📤',
    category: 'advanced',
    title: {
      fr: 'Import & Export',
      en: 'Import & Export',
      de: 'Import & Export',
      es: 'Importar y Exportar',
      'zh-HK': '匯入與匯出',
      br: 'Ezporzhadur & Enporzhadur',
      ca: 'Importar i Exportar',
    },
    content: {
      fr: [
        { type: 'h2', text: "Formats d'export" },
        {
          type: 'ul',
          items: [
            'PDF — poules, tableau, classement, résultats (personnalisable via Paramètres → PDF)',
            'CSV — classement et statistiques pour tableur',
            'XML FFE — résultats au format fédéral',
            'TXT / FFF — liste des tireurs ; .bpf — archive des tireurs (photos comprises)',
            '.BPM — format natif BellePoule Modern (Fichier › Enregistrer sous)',
          ],
        },
        { type: 'h2', text: 'Export PDF personnalisé' },
        {
          type: 'p',
          text: 'Dans Paramètres → Personnaliser les PDF, vous pouvez configurer : couleurs, logo du club, sections à inclure, titre personnalisé. Les templates sont exportables/importables en JSON.',
        },
        { type: 'h2', text: "Formats d'import" },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) et liste FFE (.fff, .csv, .txt)',
            'Classement (FFF, CSV ou XLSX) et archive de tireurs .bpf',
            'FFE Connect — import direct depuis la fédération',
            ".BPM / .cotcot — ouverture d'une compétition (fusionnée dans la base)",
          ],
        },
        { type: 'h2', text: 'Sauvegarde' },
        {
          type: 'p',
          text: "Les données sont enregistrées automatiquement toutes les 2 minutes et à la fermeture. Il n'y a pas de synchronisation cloud intégrée : pour une copie de sécurité, enregistrez un .BPM sur un support externe ou dans un dossier synchronisé.",
        },
        {
          type: 'warning',
          text: "Le format .BPM est le seul format qui préserve l'intégralité de la compétition (scores, cartons, historique des matchs). Utilisez-le pour les sauvegardes.",
        },
      ],
      en: [
        { type: 'h2', text: 'Export Formats' },
        {
          type: 'ul',
          items: [
            'PDF — pools, bracket, ranking, results (customisable via Settings → PDF)',
            'CSV — ranking and statistics for spreadsheets',
            'FFE XML — results in the federation format',
            'TXT / FFF — fencer list; .bpf — fencer archive (photos included)',
            '.BPM — BellePoule Modern native format (File › Save as)',
          ],
        },
        { type: 'h2', text: 'Custom PDF Export' },
        {
          type: 'p',
          text: 'In Settings → Customize PDFs, you can configure: colors, club logo, included sections, custom title. Templates are exportable/importable as JSON.',
        },
        { type: 'h2', text: 'Import Formats' },
        {
          type: 'ul',
          items: [
            'BellePoule XML (.xml, .cotcot) and FFE list (.fff, .csv, .txt)',
            'Ranking (FFF, CSV or XLSX) and .bpf fencer archive',
            'FFE Connect — direct import from the federation',
            '.BPM / .cotcot — open a competition (merged into the database)',
          ],
        },
        { type: 'h2', text: 'Saving' },
        {
          type: 'p',
          text: 'Data is saved automatically every 2 minutes and on exit. There is no built-in cloud sync: for a backup, save a .BPM to external storage or a synced folder.',
        },
        {
          type: 'warning',
          text: 'The .BPM format is the only format that preserves the entire competition (scores, cards, match history). Use it for backups.',
        },
      ],
      de: [
        { type: 'h2', text: 'Exportformate' },
        {
          type: 'ul',
          items: [
            'PDF — Pools, Tableau, Rangliste, Ergebnisse (anpassbar unter Einstellungen → PDF)',
            'CSV — Rangliste und Statistiken für Tabellenkalkulation',
            'FFE-XML — Ergebnisse im Verbandsformat',
            'TXT / FFF — Fechterliste; .bpf — Fechterarchiv (inkl. Fotos)',
            '.BPM — natives Format von BellePoule Modern (Datei › Speichern unter)',
          ],
        },
        { type: 'h2', text: 'Benutzerdefinierter PDF-Export' },
        {
          type: 'p',
          text: 'In Einstellungen → PDFs anpassen können Sie konfigurieren: Farben, Vereinslogo, enthaltene Abschnitte, benutzerdefinierten Titel. Vorlagen sind als JSON ex-/importierbar.',
        },
        { type: 'h2', text: 'Importformate' },
        {
          type: 'ul',
          items: [
            'BellePoule-XML (.xml, .cotcot) und FFE-Liste (.fff, .csv, .txt)',
            'Rangliste (FFF, CSV oder XLSX) und .bpf-Fechterarchiv',
            'FFE Connect — Direktimport vom Verband',
            '.BPM / .cotcot — Wettkampf öffnen (in die Datenbank übernommen)',
          ],
        },
        { type: 'h2', text: 'Speichern' },
        {
          type: 'p',
          text: 'Die Daten werden alle 2 Minuten und beim Beenden automatisch gespeichert. Eine integrierte Cloud-Synchronisierung gibt es nicht: Für eine Sicherung eine .BPM auf einem externen Datenträger oder in einem synchronisierten Ordner speichern.',
        },
        {
          type: 'warning',
          text: 'Das .BPM-Format ist das einzige Format, das den gesamten Wettkampf (Ergebnisse, Karten, Kampfhistorie) bewahrt. Für Sicherungen verwenden.',
        },
      ],
      es: [
        { type: 'h2', text: 'Formatos de exportación' },
        {
          type: 'ul',
          items: [
            'PDF — poules, cuadro, clasificación, resultados (personalizable en Ajustes → PDF)',
            'CSV — clasificación y estadísticas para hoja de cálculo',
            'XML FFE — resultados en formato federativo',
            'TXT / FFF — lista de tiradores; .bpf — archivo de tiradores (fotos incluidas)',
            '.BPM — formato nativo de BellePoule Modern (Archivo › Guardar como)',
          ],
        },
        { type: 'h2', text: 'Exportación PDF personalizada' },
        {
          type: 'p',
          text: 'En Ajustes → Personalizar PDFs puedes configurar: colores, logo del club, secciones incluidas, título personalizado. Las plantillas son exportables/importables en JSON.',
        },
        { type: 'h2', text: 'Formatos de importación' },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) y lista FFE (.fff, .csv, .txt)',
            'Clasificación (FFF, CSV o XLSX) y archivo de tiradores .bpf',
            'FFE Connect — importación directa desde la federación',
            '.BPM / .cotcot — abrir una competición (fusionada en la base de datos)',
          ],
        },
        { type: 'h2', text: 'Guardado' },
        {
          type: 'p',
          text: 'Los datos se guardan automáticamente cada 2 minutos y al cerrar. No hay sincronización en la nube integrada: para una copia de seguridad, guarde un .BPM en un soporte externo o en una carpeta sincronizada.',
        },
        {
          type: 'warning',
          text: 'El formato .BPM es el único que preserva toda la competición (puntuaciones, tarjetas, historial de combates). Úsalo para las copias de seguridad.',
        },
      ],
      'zh-HK': [
        { type: 'h2', text: '匯出格式' },
        {
          type: 'ul',
          items: [
            'PDF — 分組、淘汰表、排名、結果（可於 設定 → PDF 自訂）',
            'CSV — 排名及統計，供試算表使用',
            'FFE XML — 總會格式的結果',
            'TXT / FFF — 選手名單；.bpf — 選手封存檔（含相片）',
            '.BPM — BellePoule Modern 原生格式（檔案 › 另存新檔）',
          ],
        },
        { type: 'h2', text: '自訂 PDF 匯出' },
        {
          type: 'p',
          text: '在設定→自訂 PDF 中可配置：顏色、俱樂部標誌、包含章節、自訂標題。模板可以 JSON 格式匯出/匯入。',
        },
        { type: 'h2', text: '匯入格式' },
        {
          type: 'ul',
          items: [
            'BellePoule XML（.xml、.cotcot）及 FFE 名單（.fff、.csv、.txt）',
            '排名（FFF、CSV 或 XLSX）及 .bpf 選手封存檔',
            'FFE Connect — 直接從總會匯入',
            '.BPM / .cotcot — 開啟比賽（合併至資料庫）',
          ],
        },
        { type: 'h2', text: '儲存' },
        {
          type: 'p',
          text: '資料每 2 分鐘及關閉時自動儲存。程式沒有內建雲端同步：如需備份，請將 .BPM 儲存至外置裝置或同步資料夾。',
        },
        {
          type: 'warning',
          text: '.BPM 格式是唯一完整保留比賽資料（成績、牌罰、賽事歷史）的格式，請用於備份。',
        },
      ],
      br: [
        { type: 'h2', text: 'Furmadoù ezporzhadur' },
        {
          type: 'ul',
          items: [
            "PDF — poulloù, taolenn, renkadur, disoc'hoù (da bersonelaat dre Arventennoù → PDF)",
            'CSV — renkadur ha stadegoù evit ur follenn-jediñ',
            "XML FFE — disoc'hoù er furmad kevredel",
            'TXT / FFF — roll ar glezeourien ; .bpf — diell ar glezeourien (gant ar poltredoù)',
            '.BPM — furmad genidik BellePoule Modern (Restr › Enrollañ evel)',
          ],
        },
        { type: 'h2', text: 'Ezporzhadur PDF personalizet' },
        {
          type: 'p',
          text: "E Parametroù → Personaliziñ ar PDFoù e c'hallit kefluniañ: livioù, logo ar klub, rannioù da bignañ, titl personalizet. Ar patromoù a zo ezporzhiadus/enporzhiadus e JSON.",
        },
        { type: 'h2', text: 'Furmadoù enporzhadur' },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) ha roll FFE (.fff, .csv, .txt)',
            'Renkadur (FFF, CSV pe XLSX) hag diell klezeourien .bpf',
            "FFE Connect — enporzhiañ war-eeun eus ar c'hevredad",
            '.BPM / .cotcot — digeriñ ur genstrivadeg (kendeuzet en diaz)',
          ],
        },
        { type: 'h2', text: 'Enrollañ' },
        {
          type: 'p',
          text: "Enrollet e vez ar roadennoù ent emgefreek bep 2 vunutenn ha pa vez serret. N'eus ket a goubredañ kumulenn enframmet : evit ur gopienn surentez, enrollit ur .BPM war ur skor diavaez pe en un teuliad koubredet.",
        },
        {
          type: 'warning',
          text: "Ar furmad .BPM eo an hini nemetañ a ra gant an hollad ar genstrivadeg (notadoù, kartelloù, istor ar matchoù). Implij anezhañ evit ar marc'hadurioù.",
        },
      ],
      ca: [
        { type: 'h2', text: "Formats d'exportació" },
        {
          type: 'ul',
          items: [
            'PDF — poules, quadre, classificació, resultats (personalitzable a Configuració → PDF)',
            'CSV — classificació i estadístiques per a full de càlcul',
            'XML FFE — resultats en format federatiu',
            'TXT / FFF — llista de tiradors; .bpf — arxiu de tiradors (fotos incloses)',
            '.BPM — format natiu de BellePoule Modern (Fitxer › Desa com a)',
          ],
        },
        { type: 'h2', text: 'Exportació PDF personalitzada' },
        {
          type: 'p',
          text: 'A Configuració → Personalitzar PDFs podeu configurar: colors, logotip del club, seccions incloses, títol personalitzat. Les plantilles són exportables/importables en JSON.',
        },
        { type: 'h2', text: "Formats d'importació" },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) i llista FFE (.fff, .csv, .txt)',
            'Classificació (FFF, CSV o XLSX) i arxiu de tiradors .bpf',
            'FFE Connect — importació directa des de la federació',
            '.BPM / .cotcot — obrir una competició (fusionada a la base de dades)',
          ],
        },
        { type: 'h2', text: 'Desament' },
        {
          type: 'p',
          text: 'Les dades es desen automàticament cada 2 minuts i en tancar. No hi ha sincronització al núvol integrada: per a una còpia de seguretat, deseu un .BPM en un suport extern o en una carpeta sincronitzada.',
        },
        {
          type: 'warning',
          text: "El format .BPM és l'únic que preserva tota la competició (puntuacions, targetes, historial de combats). Useu-lo per a les còpies de seguretat.",
        },
      ],
    },
  },

  // ─── SHORTCUTS ──────────────────────────────────────────────────────────────
  {
    id: 'shortcuts',
    icon: '⌨️',
    category: 'advanced',
    title: {
      fr: 'Raccourcis clavier',
      en: 'Keyboard Shortcuts',
      de: 'Tastenkürzel',
      es: 'Atajos de teclado',
      'zh-HK': '鍵盤快捷鍵',
      br: 'Berradurioù klavier',
      ca: 'Dreceres de teclat',
    },
    content: {
      fr: [
        { type: 'h2', text: 'Globaux' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Palette de commandes' },
            { key: '?', desc: 'Aide raccourcis clavier' },
            { key: 'Ctrl+N', desc: 'Nouvelle compétition' },
            { key: 'Ctrl+O', desc: 'Ouvrir' },
            { key: 'Ctrl+S', desc: 'Sauvegarder' },
            { key: 'Ctrl+Maj+S', desc: 'Enregistrer sous' },
            { key: 'Échap', desc: 'Fermer / Annuler' },
            { key: 'F1', desc: 'À propos' },
          ],
        },
        { type: 'h2', text: 'Navigation' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Tab', desc: 'Navigation entre champs' },
            { key: 'Entrée', desc: 'Valider / Ouvrir' },
            { key: 'Ctrl+→', desc: 'Phase suivante' },
            { key: 'Ctrl+T', desc: 'Ajouter un tireur' },
            { key: 'Ctrl+,', desc: 'Paramètres' },
          ],
        },
        { type: 'h2', text: 'Compétition' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'N', desc: 'Poules : saisir le prochain match' },
            { key: 'Ctrl+Z / Ctrl+Y', desc: 'Poules : annuler / rétablir une saisie' },
            { key: 'Ctrl+P', desc: 'Imprimer les feuilles de poule / le tableau' },
          ],
        },
      ],
      en: [
        { type: 'h2', text: 'Global' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Command palette' },
            { key: '?', desc: 'Keyboard shortcuts help' },
            { key: 'Ctrl+N', desc: 'New competition' },
            { key: 'Ctrl+O', desc: 'Open' },
            { key: 'Ctrl+S', desc: 'Save' },
            { key: 'Ctrl+Shift+S', desc: 'Save as' },
            { key: 'Esc', desc: 'Close / Cancel' },
            { key: 'F1', desc: 'About' },
          ],
        },
        { type: 'h2', text: 'Navigation' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Tab', desc: 'Move between fields' },
            { key: 'Enter', desc: 'Confirm / Open' },
            { key: 'Ctrl+→', desc: 'Next phase' },
            { key: 'Ctrl+T', desc: 'Add a fencer' },
            { key: 'Ctrl+,', desc: 'Settings' },
          ],
        },
        { type: 'h2', text: 'Competition' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'N', desc: 'Pools: enter the next bout' },
            { key: 'Ctrl+Z / Ctrl+Y', desc: 'Pools: undo / redo a score' },
            { key: 'Ctrl+P', desc: 'Print pool sheets / bracket' },
          ],
        },
      ],
      de: [
        { type: 'h2', text: 'Global' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Befehlspalette' },
            { key: '?', desc: 'Tastenkürzel-Hilfe' },
            { key: 'Ctrl+N', desc: 'Neuer Wettkampf' },
            { key: 'Ctrl+O', desc: 'Öffnen' },
            { key: 'Ctrl+S', desc: 'Speichern' },
            { key: 'Ctrl+Umschalt+S', desc: 'Speichern unter' },
            { key: 'Esc', desc: 'Schließen / Abbrechen' },
            { key: 'F1', desc: 'Über' },
          ],
        },
        { type: 'h2', text: 'Navigation' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Tab', desc: 'Zwischen Feldern wechseln' },
            { key: 'Enter', desc: 'Bestätigen / Öffnen' },
            { key: 'Ctrl+→', desc: 'Nächste Phase' },
            { key: 'Ctrl+T', desc: 'Fechter hinzufügen' },
            { key: 'Ctrl+,', desc: 'Einstellungen' },
          ],
        },
        { type: 'h2', text: 'Wettkampf' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'N', desc: 'Pools: nächstes Gefecht eingeben' },
            { key: 'Ctrl+Z / Ctrl+Y', desc: 'Pools: Eingabe rückgängig / wiederholen' },
            { key: 'Ctrl+P', desc: 'Poolblätter / Tableau drucken' },
          ],
        },
      ],
      es: [
        { type: 'h2', text: 'Globales' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Paleta de comandos' },
            { key: '?', desc: 'Ayuda de atajos de teclado' },
            { key: 'Ctrl+N', desc: 'Nueva competición' },
            { key: 'Ctrl+O', desc: 'Abrir' },
            { key: 'Ctrl+S', desc: 'Guardar' },
            { key: 'Ctrl+Mayús+S', desc: 'Guardar como' },
            { key: 'Esc', desc: 'Cerrar / Cancelar' },
            { key: 'F1', desc: 'Acerca de' },
          ],
        },
        { type: 'h2', text: 'Navegación' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Tab', desc: 'Navegar entre campos' },
            { key: 'Intro', desc: 'Validar / Abrir' },
            { key: 'Ctrl+→', desc: 'Fase siguiente' },
            { key: 'Ctrl+T', desc: 'Añadir un tirador' },
            { key: 'Ctrl+,', desc: 'Ajustes' },
          ],
        },
        { type: 'h2', text: 'Competición' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'N', desc: 'Poules: introducir el siguiente combate' },
            { key: 'Ctrl+Z / Ctrl+Y', desc: 'Poules: deshacer / rehacer un marcador' },
            { key: 'Ctrl+P', desc: 'Imprimir hojas de poule / cuadro' },
          ],
        },
      ],
      'zh-HK': [
        { type: 'h2', text: '全局' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: '命令面板' },
            { key: '?', desc: '鍵盤快捷鍵說明' },
            { key: 'Ctrl+N', desc: '新增比賽' },
            { key: 'Ctrl+O', desc: '開啟' },
            { key: 'Ctrl+S', desc: '儲存' },
            { key: 'Ctrl+Shift+S', desc: '另存新檔' },
            { key: 'Esc', desc: '關閉 / 取消' },
            { key: 'F1', desc: '關於' },
          ],
        },
        { type: 'h2', text: '導航' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Tab', desc: '在欄位間移動' },
            { key: 'Enter', desc: '確認 / 開啟' },
            { key: 'Ctrl+→', desc: '下一階段' },
            { key: 'Ctrl+T', desc: '新增選手' },
            { key: 'Ctrl+,', desc: '設定' },
          ],
        },
        { type: 'h2', text: '比賽' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'N', desc: '分組：輸入下一場' },
            { key: 'Ctrl+Z / Ctrl+Y', desc: '分組：復原 / 重做比分' },
            { key: 'Ctrl+P', desc: '列印分組表 / 淘汰表' },
          ],
        },
      ],
      br: [
        { type: 'h2', text: 'Hollek' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Palet urzhioù' },
            { key: '?', desc: 'Skoazell berradurioù klavier' },
            { key: 'Ctrl+N', desc: 'Kenstrivadeg nevez' },
            { key: 'Ctrl+O', desc: 'Digeriñ' },
            { key: 'Ctrl+S', desc: 'Enrollañ' },
            { key: 'Ctrl+Pennlizherenn+S', desc: 'Enrollañ evel' },
            { key: 'Esc', desc: 'Serriñ / Nullañ' },
            { key: 'F1', desc: 'Diwar-benn' },
          ],
        },
        { type: 'h2', text: 'Levezon' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Tab', desc: 'Mont etre ar maeziennoù' },
            { key: 'Enter', desc: 'Kadarnaat / Digeriñ' },
            { key: 'Ctrl+→', desc: 'Prantad da heul' },
            { key: 'Ctrl+T', desc: "Ouzhpennañ ur c'hlezeour" },
            { key: 'Ctrl+,', desc: 'Arventennoù' },
          ],
        },
        { type: 'h2', text: 'Kenstrivadeg' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'N', desc: 'Poulloù : enrollañ an emgann da heul' },
            { key: 'Ctrl+Z / Ctrl+Y', desc: 'Poulloù : dizober / adober ur skor' },
            { key: 'Ctrl+P', desc: 'Moullañ follennoù poull / an daolenn' },
          ],
        },
      ],
      ca: [
        { type: 'h2', text: 'Globals' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: "Paleta d'ordres" },
            { key: '?', desc: 'Ajuda de dreceres de teclat' },
            { key: 'Ctrl+N', desc: 'Nova competició' },
            { key: 'Ctrl+O', desc: 'Obrir' },
            { key: 'Ctrl+S', desc: 'Desar' },
            { key: 'Ctrl+Maj+S', desc: 'Desa com a' },
            { key: 'Esc', desc: 'Tancar / Cancel·lar' },
            { key: 'F1', desc: 'Quant a' },
          ],
        },
        { type: 'h2', text: 'Navegació' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Tab', desc: 'Navegar entre camps' },
            { key: 'Retorn', desc: 'Validar / Obrir' },
            { key: 'Ctrl+→', desc: 'Fase següent' },
            { key: 'Ctrl+T', desc: 'Afegir un tirador' },
            { key: 'Ctrl+,', desc: 'Configuració' },
          ],
        },
        { type: 'h2', text: 'Competició' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'N', desc: 'Poules: introduir el següent combat' },
            { key: 'Ctrl+Z / Ctrl+Y', desc: 'Poules: desfer / refer un marcador' },
            { key: 'Ctrl+P', desc: 'Imprimir fulls de poule / quadre' },
          ],
        },
      ],
    },
  },
];
