import type { WikiArticle, WikiLang } from './wiki.types';
import { ADVANCED_ARTICLES } from './wikiAdvancedArticles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ARTICLES: WikiArticle[] = [
  // ─── QUICKSTART ────────────────────────────────────────────────────────────
  {
    id: 'quickstart',
    icon: '🚀',
    category: 'start',
    title: {
      fr: 'Démarrage rapide',
      en: 'Quick Start',
      de: 'Schnellstart',
      es: 'Inicio rápido',
      'zh-HK': '快速入門',
      br: 'Kregiñ buan',
      ca: 'Inici ràpid',
    },
    content: {
      fr: [
        {
          type: 'p',
          text: "BellePoule Modern est un logiciel de gestion de tournois d'escrime. Il prend en charge les poules, les tableaux d'élimination directe et la saisie distante via tablette.",
        },
        { type: 'h2', text: 'Flux de travail standard' },
        {
          type: 'ol',
          items: [
            'Créer une compétition (arme, catégorie, genre)',
            "Ajouter les tireurs dans l'onglet Appel et les pointer",
            'Générer les poules et saisir les scores',
            'Valider le classement des poules → accès au Tableau',
            "Saisir les scores du tableau jusqu'à la finale",
            'Consulter les Résultats et exporter le classement final',
          ],
        },
        { type: 'h2', text: 'Raccourcis indispensables' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Palette de commandes (recherche rapide)' },
            { key: '?', desc: 'Aide des raccourcis clavier' },
            { key: 'Ctrl+N', desc: 'Nouvelle compétition' },
            { key: 'Échap', desc: 'Fermer une fenêtre / Annuler' },
          ],
        },
        {
          type: 'tip',
          text: 'Utilisez Ctrl+K pour naviguer rapidement entre les compétitions ouvertes, accéder aux paramètres ou créer une nouvelle compétition.',
        },
      ],
      en: [
        {
          type: 'p',
          text: 'BellePoule Modern is a fencing tournament management software. It handles pools, direct elimination brackets, and remote scoring via tablets.',
        },
        { type: 'h2', text: 'Standard Workflow' },
        {
          type: 'ol',
          items: [
            'Create a competition (weapon, category, gender)',
            'Add fencers in the Check-in tab and mark them present',
            'Generate pools and enter scores',
            'Validate pool ranking → access to the Bracket',
            'Enter bracket scores up to the final',
            'View Results and export the final ranking',
          ],
        },
        { type: 'h2', text: 'Essential Shortcuts' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Command palette (quick search)' },
            { key: '?', desc: 'Keyboard shortcuts help' },
            { key: 'Ctrl+N', desc: 'New competition' },
            { key: 'Esc', desc: 'Close window / Cancel' },
          ],
        },
        {
          type: 'tip',
          text: 'Use Ctrl+K to quickly navigate between open competitions, access settings, or create a new competition.',
        },
      ],
      de: [
        {
          type: 'p',
          text: 'BellePoule Modern ist eine Software zur Verwaltung von Fechtturnieren. Sie unterstützt Pools, direkte Ausscheidungsrunden und Fernwertung via Tablet.',
        },
        { type: 'h2', text: 'Standardablauf' },
        {
          type: 'ol',
          items: [
            'Wettkampf erstellen (Waffe, Kategorie, Geschlecht)',
            'Fechter im Reiter „Eincheck" hinzufügen und anmelden',
            'Pools generieren und Ergebnisse eintragen',
            'Pool-Rangliste bestätigen → Zugang zur Ausscheidungsrunde',
            'Ergebnisse im Tableau bis zum Finale eintragen',
            'Ergebnisse ansehen und Abschlussrangliste exportieren',
          ],
        },
        { type: 'h2', text: 'Wichtige Tastenkürzel' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Befehlspalette (Schnellsuche)' },
            { key: '?', desc: 'Tastenkürzel-Hilfe' },
            { key: 'Ctrl+N', desc: 'Neuer Wettkampf' },
            { key: 'Esc', desc: 'Fenster schließen / Abbrechen' },
          ],
        },
        {
          type: 'tip',
          text: 'Mit Ctrl+K können Sie schnell zwischen offenen Wettkämpfen wechseln, Einstellungen aufrufen oder einen neuen Wettkampf erstellen.',
        },
      ],
      es: [
        {
          type: 'p',
          text: 'BellePoule Modern es un software de gestión de torneos de esgrima. Gestiona poules, cuadros de eliminación directa y puntuación remota vía tablet.',
        },
        { type: 'h2', text: 'Flujo de trabajo estándar' },
        {
          type: 'ol',
          items: [
            'Crear una competición (arma, categoría, género)',
            'Añadir tiradores en la pestaña Inscripción y marcarlos presentes',
            'Generar poules e introducir puntuaciones',
            'Validar la clasificación de poules → acceso al Cuadro',
            'Introducir puntuaciones en el cuadro hasta la final',
            'Consultar Resultados y exportar la clasificación final',
          ],
        },
        { type: 'h2', text: 'Atajos esenciales' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Paleta de comandos (búsqueda rápida)' },
            { key: '?', desc: 'Ayuda de atajos de teclado' },
            { key: 'Ctrl+N', desc: 'Nueva competición' },
            { key: 'Esc', desc: 'Cerrar ventana / Cancelar' },
          ],
        },
        {
          type: 'tip',
          text: 'Usa Ctrl+K para navegar rápidamente entre competiciones abiertas, acceder a ajustes o crear una nueva competición.',
        },
      ],
      'zh-HK': [
        {
          type: 'p',
          text: 'BellePoule Modern 是一款擊劍錦標賽管理軟件，支援分組循環賽、直接淘汰賽及平板遠端記分。',
        },
        { type: 'h2', text: '標準流程' },
        {
          type: 'ol',
          items: [
            '建立比賽（武器、組別、性別）',
            '在「報到」分頁新增選手並標記出席',
            '生成分組並輸入成績',
            '確認分組排名 → 進入淘汰賽',
            '輸入淘汰賽成績直至決賽',
            '查看結果並匯出最終排名',
          ],
        },
        { type: 'h2', text: '常用快捷鍵' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: '命令面板（快速搜尋）' },
            { key: '?', desc: '鍵盤快捷鍵說明' },
            { key: 'Ctrl+N', desc: '新增比賽' },
            { key: 'Esc', desc: '關閉視窗 / 取消' },
          ],
        },
        { type: 'tip', text: '使用 Ctrl+K 可快速在已開啟的比賽之間切換、進入設定或建立新比賽。' },
      ],
      br: [
        {
          type: 'p',
          text: 'BellePoule Modern a zo ur meziant evit merañ kenstrivadegoù klezeouriezh. Emaog merañ poulloù, tablelloù eliminerezh direkt ha enrollañ eus-pell dre tablet.',
        },
        { type: 'h2', text: 'Rummad labour reizh' },
        {
          type: 'ol',
          items: [
            'Krouiñ ur genstrivadeg (arm, rummad, reizh)',
            "Ouzhpennañ klañvourien en ivinell Ergerout ha notal o c'hourennañ",
            'Sevel poulloù ha pourvezañ notadoù',
            'Kadarnaat renk ar poulloù → tizhet ar Daolenn',
            'Pourvezañ notadoù an daolenn betek ar final',
            "Sellet ouzh ar Disoc'hoù ha ezporzhiañ ar renk dibenn",
          ],
        },
        { type: 'h2', text: 'Berradurioù ret' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: 'Palet urzhioù (klask buan)' },
            { key: '?', desc: 'Skoazell berradurioù klavier' },
            { key: 'Ctrl+N', desc: 'Kenstrivadeg nevez' },
            { key: 'Esc', desc: 'Serriñ ur prenestr / Nullañ' },
          ],
        },
        {
          type: 'tip',
          text: 'Implij Ctrl+K evit lezel buan etre kenstrivadegoù digor, tizout ar parametroù pe krouiñ kenstrivadeg nevez.',
        },
      ],
      ca: [
        {
          type: 'p',
          text: "BellePoule Modern és un programari de gestió de tornejos d'esgrima. Gestiona poules, quadres d'eliminació directa i puntuació remota via tauleta.",
        },
        { type: 'h2', text: 'Flux de treball estàndard' },
        {
          type: 'ol',
          items: [
            'Crear una competició (arma, categoria, gènere)',
            'Afegir tiradors a la pestanya Inscripció i marcar-los com a presents',
            'Generar poules i introduir puntuacions',
            'Validar la classificació de poules → accés al Quadre',
            'Introduir puntuacions al quadre fins a la final',
            'Consultar Resultats i exportar la classificació final',
          ],
        },
        { type: 'h2', text: 'Dreceres essencials' },
        {
          type: 'kbd',
          shortcuts: [
            { key: 'Ctrl+K', desc: "Paleta d'ordres (cerca ràpida)" },
            { key: '?', desc: 'Ajuda de dreceres de teclat' },
            { key: 'Ctrl+N', desc: 'Nova competició' },
            { key: 'Esc', desc: 'Tancar finestra / Cancel·lar' },
          ],
        },
        {
          type: 'tip',
          text: 'Utilitza Ctrl+K per navegar ràpidament entre competicions obertes, accedir a la configuració o crear una nova competició.',
        },
      ],
    },
  },

  // ─── COMPETITION ───────────────────────────────────────────────────────────
  {
    id: 'competition',
    icon: '🏆',
    category: 'competition',
    title: {
      fr: 'Créer une compétition',
      en: 'Create a Competition',
      de: 'Wettkampf erstellen',
      es: 'Crear una competición',
      'zh-HK': '建立比賽',
      br: 'Krouiñ ur genstrivadeg',
      ca: 'Crear una competició',
    },
    content: {
      fr: [
        {
          type: 'p',
          text: 'Une compétition est définie par son arme, son genre et sa catégorie. Ces paramètres déterminent les règles de scoring et les formules disponibles.',
        },
        { type: 'h2', text: 'Armes disponibles' },
        {
          type: 'ul',
          items: [
            "⚔️ Épée — touche n'importe où, score max 15 par défaut",
            '🤺 Fleuret — cible limitée au torse, scoring standard',
            '🗡️ Sabre — touche au-dessus de la ceinture, scoring rapide',
            '⚡ Sabre Laser — zones A/B/C avec points variables (1/3/5)',
            '🎛️ À la carte — formule entièrement personnalisable, avec le mode spécial « Tournoi des rapières » (binômes)',
          ],
        },
        { type: 'h2', text: 'Catégories' },
        { type: 'ul', items: ['M9, M11, M13, M15', 'M17, M20, Seniors', 'Vétérans 1 à 4'] },
        { type: 'h2', text: 'Formules' },
        {
          type: 'p',
          text: "La formule se définit à la création (ou dans Propriétés) avec le Constructeur de formule : enchaînement de phases (poules → tableau → classement) et règles d'avancement. Une formule peut être enregistrée comme modèle et réutilisée.",
        },
        {
          type: 'tip',
          text: 'La couleur de compétition aide à distinguer les onglets lorsque plusieurs compétitions sont ouvertes simultanément.',
        },
      ],
      en: [
        {
          type: 'p',
          text: 'A competition is defined by its weapon, gender, and category. These parameters determine scoring rules and available formulas.',
        },
        { type: 'h2', text: 'Available Weapons' },
        {
          type: 'ul',
          items: [
            '⚔️ Epee — touch anywhere, default max score 15',
            '🤺 Foil — target limited to torso, standard scoring',
            '🗡️ Sabre — touches above the waist, fast scoring',
            '⚡ Laser Sabre — zones A/B/C with variable points (1/3/5)',
            '🎛️ Custom — fully customizable formula, including the "Rapier tournament" special mode (pairs)',
          ],
        },
        { type: 'h2', text: 'Categories' },
        {
          type: 'ul',
          items: [
            'U9, U11, U13, U15 (Youth)',
            'U17 (Cadet), U20 (Junior), Senior',
            'Veterans V1 to V4',
          ],
        },
        { type: 'h2', text: 'Formulas' },
        {
          type: 'p',
          text: 'The formula is defined at creation (or in Properties) with the Formula Builder: a chain of phases (pools → bracket → ranking) with advancement rules. A formula can be saved as a template and reused.',
        },
        {
          type: 'tip',
          text: 'The competition color helps distinguish tabs when multiple competitions are open simultaneously.',
        },
      ],
      de: [
        {
          type: 'p',
          text: 'Ein Wettkampf wird durch Waffe, Geschlecht und Kategorie definiert. Diese Parameter bestimmen die Wertungsregeln und verfügbaren Formeln.',
        },
        { type: 'h2', text: 'Verfügbare Waffen' },
        {
          type: 'ul',
          items: [
            '⚔️ Degen — Treffer überall, Standard-Höchstpunktzahl 15',
            '🤺 Florett — Trefferfläche auf den Rumpf begrenzt',
            '🗡️ Säbel — Treffer oberhalb der Taille, schnelle Wertung',
            '⚡ Lasersäbel — Zonen A/B/C mit variablen Punkten (1/3/5)',
            '🎛️ Benutzerdefiniert — vollständig anpassbare Formel, inklusive Sondermodus „Rapier-Turnier“ (Zweierteams)',
          ],
        },
        { type: 'h2', text: 'Kategorien' },
        {
          type: 'ul',
          items: [
            'U9, U11, U13, U15 (Jugend)',
            'U17 (Kadett), U20 (Junior), Senior',
            'Veteranen V1 bis V4',
          ],
        },
        { type: 'h2', text: 'Formeln' },
        {
          type: 'p',
          text: 'Die Formel wird beim Erstellen (oder in den Eigenschaften) mit dem Formel-Editor festgelegt: Abfolge von Phasen (Pools → Tableau → Rangliste) mit Aufstiegsregeln. Eine Formel kann als Vorlage gespeichert und wiederverwendet werden.',
        },
        {
          type: 'tip',
          text: 'Die Wettkampffarbe hilft, Reiter zu unterscheiden, wenn mehrere Wettkämpfe gleichzeitig geöffnet sind.',
        },
      ],
      es: [
        {
          type: 'p',
          text: 'Una competición se define por su arma, género y categoría. Estos parámetros determinan las reglas de puntuación y las fórmulas disponibles.',
        },
        { type: 'h2', text: 'Armas disponibles' },
        {
          type: 'ul',
          items: [
            '⚔️ Espada — toque en cualquier lugar, puntuación máx. 15 por defecto',
            '🤺 Florete — blanco limitado al torso, puntuación estándar',
            '🗡️ Sable — toques por encima de la cintura, puntuación rápida',
            '⚡ Sable Láser — zonas A/B/C con puntos variables (1/3/5)',
            '🎛️ Personalizado — fórmula completamente configurable, con el modo especial «Torneo de las roperas» (parejas)',
          ],
        },
        { type: 'h2', text: 'Categorías' },
        {
          type: 'ul',
          items: [
            'Sub-11, Sub-13, Sub-15 (Infantil/Benjamín)',
            'Sub-17 (Cadete), Sub-20 (Junior), Sénior',
            'Veteranos V1 a V4',
          ],
        },
        { type: 'h2', text: 'Fórmulas' },
        {
          type: 'p',
          text: 'La fórmula se define al crear la competición (o en Propiedades) con el Constructor de fórmulas: secuencia de fases (poules → cuadro → clasificación) con reglas de avance. Una fórmula puede guardarse como plantilla y reutilizarse.',
        },
        {
          type: 'tip',
          text: 'El color de competición ayuda a distinguir las pestañas cuando hay varias competiciones abiertas simultáneamente.',
        },
      ],
      'zh-HK': [
        { type: 'p', text: '比賽由武器、性別和組別定義，這些參數決定計分規則和可用賽制。' },
        { type: 'h2', text: '可用武器' },
        {
          type: 'ul',
          items: [
            '⚔️ 重劍 — 全身有效，預設最高分 15',
            '🤺 花劍 — 有效部位限軀幹，標準計分',
            '🗡️ 軍刀 — 腰以上有效，快速計分',
            '⚡ 激光軍刀 — A/B/C 區域，可變分值（1/3/5）',
            '🎛️ 自訂 — 完全可配置賽制，包括「細劍錦標賽」特別模式',
          ],
        },
        { type: 'h2', text: '組別' },
        {
          type: 'ul',
          items: ['U9、U11、U13、U15（青少年）', 'U17（少年）、U20（青年）、成年', '老將 V1 至 V4'],
        },
        { type: 'h2', text: '賽制' },
        {
          type: 'p',
          text: '賽制於建立比賽時（或在「屬性」中）以賽制編輯器設定：階段順序（分組 → 淘汰賽 → 排名）及晉級規則。賽制可儲存為範本重複使用。',
        },
        { type: 'tip', text: '比賽顏色有助於在多個比賽同時開啟時區分分頁。' },
      ],
      br: [
        {
          type: 'p',
          text: 'Un genstrivadeg a zo miret dre e arm, e reizh hag e rummad. An parametroù-se a zizoloù reolioù an notadeg hag ar formulaoù hegerz.',
        },
        { type: 'h2', text: 'Armoù hegerz' },
        {
          type: 'ul',
          items: [
            "⚔️ Klezeeg — pouez e feur-lec'h, notadenn uhelañ 15 dre ziouer",
            "🤺 Floret — tachenn rediataet d'ar c'horf",
            '🗡️ Gouriz — pouez dreist ar gouriz, notadeg buan',
            '⚡ Gouriz Laser — zonoù A/B/C gant poentoù kemmadus (1/3/5)',
            '🎛️ Diboell — formula personalizet a-bezh, gant ar mod ispisial « Tournamant ar rapierennoù » (daouadoù)',
          ],
        },
        { type: 'h2', text: 'Rummadoù' },
        {
          type: 'ul',
          items: [
            'U9, U11, U13, U15 (Yaouankiz)',
            'U17 (Kadet), U20 (Junior), Senior',
            'Veteraned V1 da V4',
          ],
        },
        { type: 'h2', text: 'Formulaoù' },
        {
          type: 'p',
          text: 'Termenet e vez ar formulenn pa vez krouet ar genstrivadeg (pe en Perzhioù) gant Saver ar formulennoù : heuliad prantadoù (poulloù → taolenn → renkadur) ha reolennoù araokaat. Gallout a reer enrollañ ur formulenn evel patrom hag adimplijout anezhi.',
        },
        {
          type: 'tip',
          text: 'Liv ur genstrivadeg a skoazell da rannañ an ivinelloù pa vez kalz kenstrivadegoù digor war un dro.',
        },
      ],
      ca: [
        {
          type: 'p',
          text: 'Una competició es defineix per la seva arma, gènere i categoria. Aquests paràmetres determinen les regles de puntuació i les fórmules disponibles.',
        },
        { type: 'h2', text: 'Armes disponibles' },
        {
          type: 'ul',
          items: [
            '⚔️ Espasa — toc a qualsevol lloc, puntuació màx. 15 per defecte',
            '🤺 Floret — blanc limitat al tors, puntuació estàndard',
            '🗡️ Sabre — tocs per sobre la cintura, puntuació ràpida',
            '⚡ Sabre Làser — zones A/B/C amb punts variables (1/3/5)',
            '🎛️ Personalitzat — fórmula completament configurable, amb el mode especial «Torneig de les roperes» (parelles)',
          ],
        },
        { type: 'h2', text: 'Categories' },
        {
          type: 'ul',
          items: [
            'U9, U11, U13, U15 (Infantil)',
            'U17 (Cadet), U20 (Junior), Sènior',
            'Veterans V1 a V4',
          ],
        },
        { type: 'h2', text: 'Fórmules' },
        {
          type: 'p',
          text: "La fórmula es defineix en crear la competició (o a Propietats) amb el Constructor de fórmules: seqüència de fases (poules → quadre → classificació) amb regles d'avançament. Una fórmula es pot desar com a plantilla i reutilitzar.",
        },
        {
          type: 'tip',
          text: 'El color de competició ajuda a distingir les pestanyes quan hi ha diverses competicions obertes simultàniament.',
        },
      ],
    },
  },

  // ─── CHECK-IN ───────────────────────────────────────────────────────────────
  {
    id: 'checkin',
    icon: '✅',
    category: 'competition',
    title: {
      fr: "Phase d'Appel",
      en: 'Check-in Phase',
      de: 'Eincheck-Phase',
      es: 'Fase de Inscripción',
      'zh-HK': '報到階段',
      br: 'Traoù Ergerout',
      ca: "Fase d'Inscripció",
    },
    content: {
      fr: [
        {
          type: 'p',
          text: "L'Appel est la première phase. Elle permet de gérer la liste des tireurs et de confirmer leur présence avant le début de la compétition.",
        },
        { type: 'h2', text: 'Gestion des tireurs' },
        {
          type: 'ul',
          items: [
            'Ajouter des tireurs manuellement ou par import (CSV, XML, FFE)',
            'Pointer chaque tireur présent (coche verte)',
            '"Tout pointer" pour marquer tous les inscrits comme présents',
            'Définir le statut : Présent, Forfait, Médical (✚ rouge)',
          ],
        },
        { type: 'h2', text: 'Import de tireurs' },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) et liste FFE (.fff, .csv, .txt)',
            'Classement (FFF, CSV ou XLSX : NOM, PRÉNOM, CLASSEMENT) et archive de tireurs .bpf (photos comprises)',
            'FFE Connect — import direct depuis la fédération ; Tournoi des rapières : import des équipes (CSV / XLSX)',
          ],
        },
        {
          type: 'warning',
          text: "Chaque poule doit compter au moins 3 tireurs pour lancer les poules (2 en Tournoi des rapières) : le bouton « Lancer les poules » reste grisé sinon. Le nombre et la taille des poules s'ajustent dans la phase de Préparation.",
        },
        { type: 'h2', text: 'Statuts des tireurs' },
        {
          type: 'ul',
          items: [
            '⚪ Non pointé — inscrit mais absent',
            '🟢 Présent — pointé, participera à la compétition',
            '🔵 Qualifié — a passé les poules avec succès',
            '🔴 Éliminé — sorti du tableau',
            '⚫ Forfait / Médical / Exclu — retiré de la compétition (DNF en poules, DNS avant le premier match)',
          ],
        },
      ],
      en: [
        {
          type: 'p',
          text: 'Check-in is the first phase. It manages the fencer list and confirms their presence before the competition starts.',
        },
        { type: 'h2', text: 'Managing Fencers' },
        {
          type: 'ul',
          items: [
            'Add fencers manually or via import (CSV, XML, FFE)',
            'Check in each present fencer (green checkmark)',
            '"Check in all" to mark all registered fencers as present',
            'Set status: Present, Forfeit, Medical',
          ],
        },
        { type: 'h2', text: 'Fencer Import' },
        {
          type: 'ul',
          items: [
            'BellePoule XML (.xml, .cotcot) and FFE list (.fff, .csv, .txt)',
            'Ranking (FFF, CSV or XLSX: LAST NAME, FIRST NAME, RANKING) and .bpf fencer archive (photos included)',
            'FFE Connect — direct import from the federation; Rapier tournament: team import (CSV / XLSX)',
          ],
        },
        {
          type: 'warning',
          text: 'Each pool needs at least 3 fencers to launch the pools (2 in the Rapier tournament): the "Launch pools" button stays disabled otherwise. The number and size of pools are adjusted in the Preparation phase.',
        },
        { type: 'h2', text: 'Fencer Statuses' },
        {
          type: 'ul',
          items: [
            '⚪ Not checked in — registered but absent',
            '🟢 Present — checked in, will compete',
            '🔵 Qualified — passed the pool phase',
            '🔴 Eliminated — knocked out of the bracket',
            '⚫ Forfeit / Medical / Excluded — removed from the competition (DNF in pools, DNS before first bout)',
          ],
        },
      ],
      de: [
        {
          type: 'p',
          text: 'Das Eincheck ist die erste Phase. Sie verwaltet die Fechterliste und bestätigt die Anwesenheit vor Wettkampfbeginn.',
        },
        { type: 'h2', text: 'Fechter verwalten' },
        {
          type: 'ul',
          items: [
            'Fechter manuell oder per Import hinzufügen (CSV, XML, FFE)',
            'Jeden anwesenden Fechter einchecken (grüner Haken)',
            '„Alle einchecken" um alle Angemeldeten als anwesend zu markieren',
            'Status festlegen: Anwesend, Aufgabe, Medizinisch',
          ],
        },
        { type: 'h2', text: 'Fechter importieren' },
        {
          type: 'ul',
          items: [
            'BellePoule-XML (.xml, .cotcot) und FFE-Liste (.fff, .csv, .txt)',
            'Rangliste (FFF, CSV oder XLSX: NAME, VORNAME, RANG) und .bpf-Fechterarchiv (inkl. Fotos)',
            'FFE Connect — Direktimport vom Verband; Rapier-Turnier: Teamimport (CSV / XLSX)',
          ],
        },
        {
          type: 'warning',
          text: 'Jeder Pool braucht mindestens 3 Fechter, um die Pools zu starten (2 beim Rapier-Turnier); sonst bleibt die Schaltfläche „Pools starten“ deaktiviert. Anzahl und Größe der Pools werden in der Vorbereitungsphase angepasst.',
        },
        { type: 'h2', text: 'Fechterstatus' },
        {
          type: 'ul',
          items: [
            '⚪ Nicht eingecheckt — angemeldet aber abwesend',
            '🟢 Anwesend — eingecheckt, nimmt teil',
            '🔵 Qualifiziert — Pool-Phase bestanden',
            '🔴 Ausgeschieden — aus dem Tableau ausgeschieden',
            '⚫ Forfait / Medizinisch / Ausgeschlossen — aus dem Wettkampf entfernt',
          ],
        },
      ],
      es: [
        {
          type: 'p',
          text: 'La inscripción es la primera fase. Gestiona la lista de tiradores y confirma su presencia antes del inicio de la competición.',
        },
        { type: 'h2', text: 'Gestión de tiradores' },
        {
          type: 'ul',
          items: [
            'Añadir tiradores manualmente o por importación (CSV, XML, FFE)',
            'Marcar como presente cada tirador (marca verde)',
            '"Marcar todos" para registrar a todos los inscritos como presentes',
            'Definir estado: Presente, Retirado, Médico',
          ],
        },
        { type: 'h2', text: 'Importar tiradores' },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) y lista FFE (.fff, .csv, .txt)',
            'Clasificación (FFF, CSV o XLSX: APELLIDO, NOMBRE, CLASIFICACIÓN) y archivo de tiradores .bpf (fotos incluidas)',
            'FFE Connect — importación directa desde la federación; Torneo de las roperas: importación de equipos (CSV / XLSX)',
          ],
        },
        {
          type: 'warning',
          text: 'Cada poule necesita al menos 3 tiradores para lanzar las poules (2 en el Torneo de las roperas); si no, el botón «Lanzar las poules» permanece desactivado. El número y el tamaño de las poules se ajustan en la fase de Preparación.',
        },
        { type: 'h2', text: 'Estados de los tiradores' },
        {
          type: 'ul',
          items: [
            '⚪ No inscrito — registrado pero ausente',
            '🟢 Presente — inscrito, participará',
            '🔵 Clasificado — superó la fase de poules',
            '🔴 Eliminado — fuera del cuadro',
            '⚫ Forfait / Médico / Excluido — retirado de la competición',
          ],
        },
      ],
      'zh-HK': [
        { type: 'p', text: '報到是第一個階段，用於管理選手名單並在比賽開始前確認出席情況。' },
        { type: 'h2', text: '管理選手' },
        {
          type: 'ul',
          items: [
            '手動新增選手或透過匯入（CSV、XML、FFE）',
            '為每位出席選手辦理報到（綠色勾選）',
            '「全部報到」可將所有已登記選手標記為出席',
            '設定狀態：出席、棄權、傷病',
          ],
        },
        { type: 'h2', text: '匯入選手' },
        {
          type: 'ul',
          items: [
            'BellePoule XML（.xml、.cotcot）及 FFE 名單（.fff、.csv、.txt）',
            '排名（FFF、CSV 或 XLSX：姓、名、排名）及 .bpf 選手封存檔（含相片）',
            'FFE Connect — 直接從總會匯入；細劍錦標賽：匯入隊伍（CSV / XLSX）',
          ],
        },
        {
          type: 'warning',
          text: '每個分組至少需要 3 名選手才能開始分組賽（細劍錦標賽為 2 名），否則「開始分組賽」按鈕會停用。分組數目及大小可於「準備」階段調整。',
        },
        { type: 'h2', text: '選手狀態' },
        {
          type: 'ul',
          items: [
            '⚪ 未報到 — 已登記但缺席',
            '🟢 出席 — 已報到，將參賽',
            '🔵 晉級 — 通過分組賽',
            '🔴 淘汰 — 已出局',
            '⚫ 棄權 / 傷病 / 取消資格 — 退出比賽',
          ],
        },
      ],
      br: [
        {
          type: 'p',
          text: "An Ergerout eo an traoù gentañ. Emaog merañ listenn ar c'hlañvourien ha kadarnaat o c'hourennañ a-raok kregiñ.",
        },
        { type: 'h2', text: 'Merañ klañvourien' },
        {
          type: 'ul',
          items: [
            'Ouzhpennañ klañvourien gant dorn pe dre ezporzhadur (CSV, XML, FFE)',
            "Notenañ pep klañvouer a zo (marc'h glas)",
            '„Notenañ an holl" evit merañ an holl skrivet evel c\'hourennant',
            "Termeniñ ar stad: C'hourennant, Enkredek, Lezel",
          ],
        },
        { type: 'h2', text: 'Ezporzhadur klañvourien' },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) ha roll FFE (.fff, .csv, .txt)',
            'Renkadur (FFF, CSV pe XLSX : ANV, ANV-BIHAN, RENK) hag diell klezeourien .bpf (gant ar poltredoù)',
            "FFE Connect — enporzhiañ war-eeun eus ar c'hevredad ; Tournamant ar rapierennoù : enporzhiañ ar skipailhoù (CSV / XLSX)",
          ],
        },
        {
          type: 'warning',
          text: "Ret eo kaout 3 klezeour d'an nebeutañ e pep poull evit loc'hañ ar poulloù (2 e Tournamant ar rapierennoù) : chom a ra ar bouton « Loc'hañ ar poulloù » dizimplijadus a-hend-all. Niver ha ment ar poulloù a vez reizhet er prantad Prientiñ.",
        },
        { type: 'h2', text: 'Stadoù klañvourien' },
        {
          type: 'ul',
          items: [
            "⚪ N'eo ket notet — skrivet met dihamet",
            "🟢 C'hourennant — notet, a vo er genstrivadeg",
            '🔵 Kualifiet — tre ar poulloù gant mad',
            '🔴 Eliminaet — diwar ar daolenn',
            "⚫ Forfed / Yec'hed / Skarzhet — tennet eus ar genstrivadeg",
          ],
        },
      ],
      ca: [
        {
          type: 'p',
          text: "La inscripció és la primera fase. Gestiona la llista de tiradors i confirma la seva presència abans de l'inici de la competició.",
        },
        { type: 'h2', text: 'Gestió de tiradors' },
        {
          type: 'ul',
          items: [
            'Afegir tiradors manualment o per importació (CSV, XML, FFE)',
            'Marcar com a present cada tirador (marca verda)',
            '„Marcar tots" per registrar tots els inscrits com a presents',
            'Definir estat: Present, Retirat, Mèdic',
          ],
        },
        { type: 'h2', text: 'Importar tiradors' },
        {
          type: 'ul',
          items: [
            'XML BellePoule (.xml, .cotcot) i llista FFE (.fff, .csv, .txt)',
            'Classificació (FFF, CSV o XLSX: COGNOM, NOM, CLASSIFICACIÓ) i arxiu de tiradors .bpf (fotos incloses)',
            "FFE Connect — importació directa des de la federació; Torneig de les roperes: importació d'equips (CSV / XLSX)",
          ],
        },
        {
          type: 'warning',
          text: "Cada poule necessita almenys 3 tiradors per llançar les poules (2 al Torneig de les roperes); si no, el botó «Llançar les poules» resta desactivat. El nombre i la mida de les poules s'ajusten a la fase de Preparació.",
        },
        { type: 'h2', text: 'Estats dels tiradors' },
        {
          type: 'ul',
          items: [
            '⚪ No inscrit — registrat però absent',
            '🟢 Present — inscrit, participarà',
            '🔵 Classificat — ha superat la fase de poules',
            '🔴 Eliminat — fora del quadre',
            '⚫ Forfet / Mèdic / Exclòs — retirat de la competició',
          ],
        },
      ],
    },
  },

  // ─── POOLS ──────────────────────────────────────────────────────────────────
  {
    id: 'pools',
    icon: '🎯',
    category: 'phases',
    title: {
      fr: 'Phase de Poules',
      en: 'Pool Phase',
      de: 'Pool-Phase',
      es: 'Fase de Poules',
      'zh-HK': '分組循環賽',
      br: 'Traoù ar Poulloù',
      ca: 'Fase de Poules',
    },
    content: {
      fr: [
        {
          type: 'p',
          text: 'Les poules sont des mini-tournois en round-robin. Chaque tireur affronte tous les autres tireurs de sa poule. Le classement final détermine qui accède au tableau.',
        },
        { type: 'h2', text: 'Génération des poules' },
        {
          type: 'p',
          text: 'BellePoule répartit automatiquement les tireurs en poules de taille optimale selon le nombre de participants. La répartition peut être ajustée manuellement dans la phase de Préparation.',
        },
        { type: 'h2', text: 'Saisie des scores' },
        {
          type: 'ul',
          items: [
            'Cliquez sur une case dans la grille pour saisir le score',
            'Format : score du tireur en ligne vs tireur en colonne',
            'V = Victoire, score max configurable (défaut : 5)',
            'Le vainqueur est noté V, le perdant son score réel',
          ],
        },
        { type: 'h2', text: 'Critères de classement' },
        {
          type: 'ol',
          items: [
            'Ratio V/M (victoires sur matchs joués)',
            'Indice (touches données − touches reçues)',
            'Touches données (TD)',
            "Confrontation directe (en cas d'égalité)",
            'Classement initial',
          ],
        },
        { type: 'h2', text: 'Tours de poules' },
        {
          type: 'p',
          text: 'Une formule peut comporter plusieurs tours de poules. Les tireurs sont redistribués entre chaque tour selon leur classement intermédiaire.',
        },
        {
          type: 'tip',
          text: 'La saisie distante (tablette arbitre) permet de saisir les scores en temps réel depuis les arènes pendant les poules.',
        },
      ],
      en: [
        {
          type: 'p',
          text: 'Pools are round-robin mini-tournaments. Each fencer faces all others in their pool. The final ranking determines who advances to the bracket.',
        },
        { type: 'h2', text: 'Pool Generation' },
        {
          type: 'p',
          text: 'BellePoule automatically distributes fencers into optimally-sized pools based on participant count. Distribution can be manually adjusted in the Preparation phase.',
        },
        { type: 'h2', text: 'Score Entry' },
        {
          type: 'ul',
          items: [
            'Click a cell in the grid to enter the score',
            "Format: row fencer's score vs column fencer",
            'V = Victory, configurable max score (default: 5)',
            'The winner is marked V, the loser gets their actual score',
          ],
        },
        { type: 'h2', text: 'Ranking Criteria' },
        {
          type: 'ol',
          items: [
            'V/M ratio (victories to bouts ratio)',
            'Index (touches scored − touches received)',
            'Touches scored (TS)',
            'Direct encounter (in case of tie)',
            'Initial seeding',
          ],
        },
        { type: 'h2', text: 'Pool Rounds' },
        {
          type: 'p',
          text: 'A formula can include multiple pool rounds. Fencers are redistributed between rounds based on their intermediate ranking.',
        },
        {
          type: 'tip',
          text: 'Remote scoring (referee tablet) allows real-time score entry from arenas during pools.',
        },
      ],
      de: [
        {
          type: 'p',
          text: 'Pools sind Round-Robin-Miniwettkämpfe. Jeder Fechter trifft alle anderen in seinem Pool. Die Endrangliste bestimmt, wer ins Tableau aufsteigt.',
        },
        { type: 'h2', text: 'Pool-Generierung' },
        {
          type: 'p',
          text: 'BellePoule verteilt Fechter automatisch in Pools optimaler Größe basierend auf der Teilnehmerzahl. Die Verteilung kann in der Vorbereitungsphase manuell angepasst werden.',
        },
        { type: 'h2', text: 'Ergebniseingabe' },
        {
          type: 'ul',
          items: [
            'Klicken Sie auf eine Zelle im Raster, um das Ergebnis einzugeben',
            'Format: Treffer Zeilenfechter vs. Spaltenfechter',
            'V = Sieg, konfigurierbares Höchstergebnis (Standard: 5)',
            'Der Sieger wird mit V markiert, der Verlierer mit seinem Ergebnis',
          ],
        },
        { type: 'h2', text: 'Ranglistenkriterien' },
        {
          type: 'ol',
          items: [
            'V/M-Verhältnis (Siege zu Gefechten)',
            'Index (gegebene − empfangene Treffer)',
            'Gegebene Treffer (GT)',
            'Direktbegegnung (bei Gleichstand)',
            'Erstrangierung',
          ],
        },
        { type: 'h2', text: 'Pool-Runden' },
        {
          type: 'p',
          text: 'Eine Formel kann mehrere Pool-Runden umfassen. Fechter werden zwischen den Runden nach ihrer Zwischenrangliste umverteilt.',
        },
        {
          type: 'tip',
          text: 'Die Fernwertung (Schiedsrichter-Tablet) ermöglicht die Echtzeiteingabe von Ergebnissen von den Pisten während der Pools.',
        },
      ],
      es: [
        {
          type: 'p',
          text: 'Las poules son mini-torneos de todos contra todos. Cada tirador se enfrenta a todos los demás de su grupo. La clasificación final determina quién pasa al cuadro.',
        },
        { type: 'h2', text: 'Generación de poules' },
        {
          type: 'p',
          text: 'BellePoule distribuye automáticamente los tiradores en grupos de tamaño óptimo según el número de participantes. La distribución puede ajustarse manualmente en la fase de Preparación.',
        },
        { type: 'h2', text: 'Introducción de puntuaciones' },
        {
          type: 'ul',
          items: [
            'Haz clic en una celda de la cuadrícula para introducir la puntuación',
            'Formato: puntuación del tirador en fila vs tirador en columna',
            'V = Victoria, puntuación máx. configurable (defecto: 5)',
            'El ganador se marca con V, el perdedor con su puntuación real',
          ],
        },
        { type: 'h2', text: 'Criterios de clasificación' },
        {
          type: 'ol',
          items: [
            'Ratio V/M (victorias sobre combates disputados)',
            'Índice (toques dados − toques recibidos)',
            'Toques dados (TD)',
            'Enfrentamiento directo (en caso de empate)',
            'Clasificación inicial',
          ],
        },
        { type: 'h2', text: 'Rondas de poules' },
        {
          type: 'p',
          text: 'Una fórmula puede tener varias rondas de poules. Los tiradores se redistribuyen entre rondas según su clasificación intermedia.',
        },
        {
          type: 'tip',
          text: 'La puntuación remota (tablet árbitro) permite introducir puntuaciones en tiempo real desde las pistas durante las poules.',
        },
      ],
      'zh-HK': [
        {
          type: 'p',
          text: '分組循環賽是小型循環賽，每位選手對陣同組所有其他選手，最終排名決定誰晉級淘汰賽。',
        },
        { type: 'h2', text: '生成分組' },
        {
          type: 'p',
          text: 'BellePoule 根據參賽人數自動將選手分配到最佳規模的分組中，也可在準備階段手動調整。',
        },
        { type: 'h2', text: '輸入成績' },
        {
          type: 'ul',
          items: [
            '點擊表格中的格子輸入成績',
            '格式：橫排選手成績 vs 縱排選手',
            'V = 勝利，最高分可配置（預設：5）',
            '勝者標記 V，敗者填入實際得分',
          ],
        },
        { type: 'h2', text: '排名標準' },
        {
          type: 'ol',
          items: [
            'V/M 比率（勝場數/出賽場數）',
            '指數（得分 − 失分）',
            '得分（TD）',
            '直接對陣（同分時）',
            '初始種子',
          ],
        },
        { type: 'h2', text: '分組輪次' },
        { type: 'p', text: '賽制可包含多輪分組賽，每輪後根據中間排名重新分配選手。' },
        { type: 'tip', text: '遠端記分（裁判平板）可在分組賽期間從賽場即時輸入成績。' },
      ],
      br: [
        {
          type: 'p',
          text: "Ar poulloù a zo kenstrivadegoù bihan round-robin. Pep klañvouer a vont erbenn an holl re all e boulloù. Ar renk dibenn a ziziolo piv a ya d'ar daolenn.",
        },
        { type: 'h2', text: 'Sevel ar poulloù' },
        {
          type: 'p',
          text: "BellePoule a rann ar c'hlañvourien ent emgefreek e poulloù eus ment reizh hervez an niver a c'hourennourien.",
        },
        { type: 'h2', text: 'Pourvezañ notadoù' },
        {
          type: 'ul',
          items: [
            'Klikit war ur vuzhug er restr evit pourvezañ an notenn',
            'Furmad: notenn an tirant en linenn vs tirant en kolonnenn',
            'V = Gounid, notenn uhelañ kustomizabl (dre ziouer: 5)',
            'An treuzour a zo notet V, an trestet e notenn wir',
          ],
        },
        { type: 'h2', text: 'Arvesterioù renk' },
        {
          type: 'ol',
          items: [
            "Rapport V/M (gounidoù war c'harioù c'hoariet)",
            'Indez (pouezioù roet − pouezioù resevet)',
            'Pouezioù roet (TD)',
            "Enebadeg resis (ma vez kenderc'hadennezh)",
            'Renk kentañ',
          ],
        },
        { type: 'h2', text: 'Taoliñoù poulloù' },
        {
          type: 'p',
          text: "Ur formula a c'hall dougañ meur a daol poulloù. Ar c'hlañvourien a zo repartiiet etre pep taol hervez o renk etre-taol.",
        },
        {
          type: 'tip',
          text: "Ar skoazell pellek (tablet arbitr) a ro teurel notadoù en amzer gwir eus ar c'haerojù e-pad ar poulloù.",
        },
      ],
      ca: [
        {
          type: 'p',
          text: "Les poules són mini-tornejos de tots contra tots. Cada tirador s'enfronta a tots els altres del seu grup. La classificació final determina qui passa al quadre.",
        },
        { type: 'h2', text: 'Generació de poules' },
        {
          type: 'p',
          text: 'BellePoule distribueix automàticament els tiradors en grups de mida òptima segons el nombre de participants. La distribució es pot ajustar manualment a la fase de Preparació.',
        },
        { type: 'h2', text: 'Introducció de puntuacions' },
        {
          type: 'ul',
          items: [
            'Feu clic en una cel·la de la graella per introduir la puntuació',
            'Format: puntuació del tirador en fila vs tirador en columna',
            'V = Victòria, puntuació màx. configurable (defecte: 5)',
            'El guanyador es marca amb V, el perdedor amb la seva puntuació real',
          ],
        },
        { type: 'h2', text: 'Criteris de classificació' },
        {
          type: 'ol',
          items: [
            'Ràtio V/M (victòries sobre combats disputats)',
            'Índex (tocs donats − tocs rebuts)',
            'Tocs donats (TD)',
            "Enfrontament directe (en cas d'empat)",
            'Classificació inicial',
          ],
        },
        { type: 'h2', text: 'Rondes de poules' },
        {
          type: 'p',
          text: 'Una fórmula pot tenir diverses rondes de poules. Els tiradors es redistribueixen entre rondes segons la seva classificació intermèdia.',
        },
        {
          type: 'tip',
          text: 'La puntuació remota (tauleta àrbitre) permet introduir puntuacions en temps real des de les pistes durant les poules.',
        },
      ],
    },
  },

  // ─── TABLEAU ────────────────────────────────────────────────────────────────
  {
    id: 'tableau',
    icon: '🏅',
    category: 'phases',
    title: {
      fr: "Tableau d'élimination",
      en: 'Elimination Bracket',
      de: 'Ausscheidungsrunde',
      es: 'Cuadro de eliminación',
      'zh-HK': '淘汰賽',
      br: 'Taolenn eliminadur',
      ca: "Quadre d'eliminació",
    },
    content: {
      fr: [
        {
          type: 'p',
          text: "Le tableau d'élimination directe (DE) place les tireurs en bracket selon leur classement de poules. Les perdants sont éliminés jusqu'à la finale.",
        },
        { type: 'h2', text: 'Types de tableaux' },
        {
          type: 'ul',
          items: [
            'Tableau classique — élimination simple, taille automatique selon le nombre de qualifiés',
            'Taille forcée — tableau de 4 à 128 choisi dans le Constructeur de formule',
            'Petite finale — match pour la 3e place (et pour la 5e place en option)',
          ],
        },
        { type: 'h2', text: 'Têtes de série' },
        {
          type: 'p',
          text: 'Le seeding est automatique selon le classement des poules. Les 4 (ou 8) premiers sont placés comme têtes de série pour éviter de se retrouver trop tôt dans le tableau.',
        },
        { type: 'h2', text: 'Saisie des scores du tableau' },
        {
          type: 'ul',
          items: [
            'Cliquez sur une MatchCard pour ouvrir la saisie',
            'Score max configurable (défaut : 15 pour épée)',
            "Mort subite : en cas d'égalité au bout du temps, tirage au sort puis score à 1 touche",
            "Cartons : jaune (+1 pt à l'adversaire), rouge (+1 pt), noir (exclusion)",
          ],
        },
        {
          type: 'warning',
          text: "Le tableau ne devient accessible qu'une fois toutes les poules terminées et le classement validé.",
        },
        {
          type: 'tip',
          text: "Le chronomètre et les cartons se gèrent sur la tablette arbitre (saisie distante), qui renvoie le score en temps réel à l'application.",
        },
      ],
      en: [
        {
          type: 'p',
          text: 'The direct elimination (DE) bracket places fencers according to their pool ranking. Losers are eliminated until the final.',
        },
        { type: 'h2', text: 'Bracket Types' },
        {
          type: 'ul',
          items: [
            'Classic bracket — single elimination, size set automatically from the number of qualifiers',
            'Forced size — bracket of 4 to 128 chosen in the Formula Builder',
            'Bronze match — match for 3rd place (and optionally for 5th place)',
          ],
        },
        { type: 'h2', text: 'Seeding' },
        {
          type: 'p',
          text: 'Seeding is automatic based on pool ranking. The top 4 (or 8) are seeded to prevent early high-profile matchups.',
        },
        { type: 'h2', text: 'Bracket Score Entry' },
        {
          type: 'ul',
          items: [
            'Click a MatchCard to open the score entry',
            'Configurable max score (default: 15 for epee)',
            'Sudden death: in case of tie at time, coin toss then 1-touch score',
            'Cards: yellow (+1 pt to opponent), red (+1 pt), black (exclusion)',
          ],
        },
        {
          type: 'warning',
          text: 'The bracket is only accessible once all pools are finished and the ranking has been validated.',
        },
        {
          type: 'tip',
          text: 'The timer and cards are handled on the referee tablet (remote scoring), which sends the score to the application in real time.',
        },
      ],
      de: [
        {
          type: 'p',
          text: 'Das direkte Ausscheidungs-Tableau (DE) ordnet Fechter entsprechend ihrer Pool-Rangliste ein. Verlierer scheiden aus, bis zum Finale.',
        },
        { type: 'h2', text: 'Tableau-Typen' },
        {
          type: 'ul',
          items: [
            'Klassisches Tableau — einfaches K.-o.-System, Größe automatisch nach Anzahl der Qualifizierten',
            'Feste Größe — Tableau von 4 bis 128 im Formel-Editor wählbar',
            'Kleines Finale — Gefecht um Platz 3 (optional auch um Platz 5)',
          ],
        },
        { type: 'h2', text: 'Setzung' },
        {
          type: 'p',
          text: 'Die Setzung erfolgt automatisch nach der Pool-Rangliste. Die besten 4 (oder 8) werden gesetzt, um frühe Top-Duelle zu vermeiden.',
        },
        { type: 'h2', text: 'Ergebniseingabe im Tableau' },
        {
          type: 'ul',
          items: [
            'Klicken Sie auf eine MatchCard, um die Ergebniseingabe zu öffnen',
            'Konfigurierbares Höchstergebnis (Standard: 15 beim Degen)',
            'Plötzlicher Tod: bei Gleichstand nach Zeit wird ausgelost, dann 1-Treffer',
            'Karten: Gelb (+1 Pt. für Gegner), Rot (+1 Pt.), Schwarz (Ausschluss)',
          ],
        },
        {
          type: 'warning',
          text: 'Das Tableau ist erst zugänglich, wenn alle Pools abgeschlossen und die Rangliste bestätigt wurde.',
        },
        {
          type: 'tip',
          text: 'Uhr und Karten werden auf dem Kampfrichter-Tablet (Fernwertung) verwaltet, das den Stand in Echtzeit an die Anwendung sendet.',
        },
      ],
      es: [
        {
          type: 'p',
          text: 'El cuadro de eliminación directa (DE) coloca a los tiradores según su clasificación de poules. Los perdedores son eliminados hasta la final.',
        },
        { type: 'h2', text: 'Tipos de cuadros' },
        {
          type: 'ul',
          items: [
            'Cuadro clásico — eliminación simple, tamaño automático según el número de clasificados',
            'Tamaño forzado — cuadro de 4 a 128 elegido en el Constructor de fórmulas',
            'Final de consolación — combate por el 3.er puesto (y opcionalmente por el 5.º)',
          ],
        },
        { type: 'h2', text: 'Cabezas de serie' },
        {
          type: 'p',
          text: 'El seeding es automático según la clasificación de poules. Los 4 (u 8) primeros se colocan como cabezas de serie para evitar enfrentamientos tempranos entre favoritos.',
        },
        { type: 'h2', text: 'Introducción de puntuaciones en el cuadro' },
        {
          type: 'ul',
          items: [
            'Haz clic en una MatchCard para abrir la introducción de puntuación',
            'Puntuación máx. configurable (defecto: 15 para espada)',
            'Muerte súbita: en caso de empate al final del tiempo, sorteo y un toque',
            'Tarjetas: amarilla (+1 pt al rival), roja (+1 pt), negra (exclusión)',
          ],
        },
        {
          type: 'warning',
          text: 'El cuadro solo es accesible una vez que todas las poules han terminado y la clasificación ha sido validada.',
        },
        {
          type: 'tip',
          text: 'El cronómetro y las tarjetas se gestionan en la tablet del árbitro (puntuación remota), que envía el marcador a la aplicación en tiempo real.',
        },
      ],
      'zh-HK': [
        { type: 'p', text: '直接淘汰賽（DE）根據分組排名安排選手對陣，敗者淘汰直至決賽。' },
        { type: 'h2', text: '賽制類型' },
        {
          type: 'ul',
          items: [
            '標準淘汰賽 — 單敗淘汰，大小按晉級人數自動決定',
            '指定大小 — 於賽制編輯器選擇 4 至 128 人的淘汰表',
            '季軍戰 — 爭奪第 3 名（可選第 5 名賽）',
          ],
        },
        { type: 'h2', text: '種子排列' },
        {
          type: 'p',
          text: '種子排列根據分組排名自動生成，前 4（或 8）名作為種子，避免強者過早相遇。',
        },
        { type: 'h2', text: '淘汰賽成績輸入' },
        {
          type: 'ul',
          items: [
            '點擊 MatchCard 開啟成績輸入',
            '最高分可配置（重劍預設：15）',
            '突然死亡：計時結束同分時抽籤，然後一分決勝',
            '牌：黃牌（對手+1分）、紅牌（對手+1分）、黑牌（取消資格）',
          ],
        },
        { type: 'warning', text: '所有分組賽完成且排名確認後，才能進入淘汰賽。' },
        {
          type: 'tip',
          text: '計時器及警告卡於裁判平板（遠端記分）上操作，比分會即時傳回應用程式。',
        },
      ],
      br: [
        {
          type: 'p',
          text: "An daolenn eliminadur resis (DE) a lak ar c'hlañvourien e bracket hervez o renk poulloù. Ar re kollet a zo eliminaet betek ar final.",
        },
        { type: 'h2', text: 'Seurtadoù daolenn' },
        {
          type: 'ul',
          items: [
            'Taolenn klasel — eliminerezh eeun, ment emgefreek hervez an niver a dud dibabet',
            'Ment rediet — taolenn eus 4 betek 128 dibabet e Saver ar formulennoù',
            'Final vihan — emgann evit an 3de plas (hag evit ar 5vet plas ma fell)',
          ],
        },
        { type: 'h2', text: 'Pennreoù rummad' },
        {
          type: 'p',
          text: 'Ar seeding a zo emgefreek hervez renk ar poulloù. Ar 4 (pe 8) kentañ a zo laket evel pennreoù rummad.',
        },
        { type: 'h2', text: 'Pourvezañ notadoù an daolenn' },
        {
          type: 'ul',
          items: [
            'Klikit war ur MatchCard evit digeriñ ar pourvezañ',
            'Notenn uhelañ kustomizabl (dre ziouer: 15 evit klezeeg)',
            "Marv soudañ: ma vez kenderc'hadennezh ec'h eus tinadurezh, kraouenn ha 1 pouez",
            "Kartelloù: melen (+1 pt d'an enebour), ruz (+1 pt), du (diviñs)",
          ],
        },
        {
          type: 'warning',
          text: "N'haller tizout an daolenn nemet goude ma vez pep poull echuet hag ar renk kadarnaaet.",
        },
        {
          type: 'tip',
          text: "Ar c'hronometr hag ar c'hartennoù a vez meret war tablet an arbitr (enrollañ eus-pell), a gas ar skor d'ar meziant war an taol.",
        },
      ],
      ca: [
        {
          type: 'p',
          text: "El quadre d'eliminació directa (DE) col·loca els tiradors segons la seva classificació de poules. Els perdedors són eliminats fins a la final.",
        },
        { type: 'h2', text: 'Tipus de quadres' },
        {
          type: 'ul',
          items: [
            'Quadre clàssic — eliminació simple, mida automàtica segons el nombre de classificats',
            'Mida forçada — quadre de 4 a 128 escollit al Constructor de fórmules',
            'Final de consolació — combat pel 3r lloc (i opcionalment pel 5è)',
          ],
        },
        { type: 'h2', text: 'Caps de sèrie' },
        {
          type: 'p',
          text: 'El seeding és automàtic segons la classificació de poules. Els 4 (o 8) primers es col·loquen com a caps de sèrie per evitar enfrontaments prematurs entre favorits.',
        },
        { type: 'h2', text: 'Introducció de puntuacions al quadre' },
        {
          type: 'ul',
          items: [
            'Feu clic en una MatchCard per obrir la introducció de puntuació',
            'Puntuació màx. configurable (defecte: 15 per a espasa)',
            "Mort sobtada: en cas d'empat al final del temps, sorteig i un toc",
            'Targetes: groga (+1 pt al rival), vermella (+1 pt), negra (exclusió)',
          ],
        },
        {
          type: 'warning',
          text: 'El quadre només és accessible un cop totes les poules han finalitzat i la classificació ha estat validada.',
        },
        {
          type: 'tip',
          text: "El cronòmetre i les targetes es gestionen a la tauleta de l'àrbitre (puntuació remota), que envia el marcador a l'aplicació en temps real.",
        },
      ],
    },
  },

  // ─── REMOTE ─────────────────────────────────────────────────────────────────
  {
    id: 'remote',
    icon: '📡',
    category: 'remote',
    title: {
      fr: 'Saisie distante',
      en: 'Remote Scoring',
      de: 'Fernwertung',
      es: 'Puntuación remota',
      'zh-HK': '遠端記分',
      br: 'Pourvezañ eus-pell',
      ca: 'Puntuació remota',
    },
    content: {
      fr: [
        {
          type: 'p',
          text: "La saisie distante permet aux arbitres de saisir les scores depuis une tablette ou un smartphone via Wi-Fi. Un serveur Express est intégré à l'application (port 8066, ou le suivant s'il est occupé ; HTTPS activable).",
        },
        { type: 'h2', text: 'Démarrer la saisie distante' },
        {
          type: 'ol',
          items: [
            "Ouvrez l'onglet « 📡 Saisie distante » de la compétition",
            'Cliquez sur « Démarrer la saisie distante » — le serveur se lance',
            "Notez l'adresse affichée (ou scannez le QR code)",
            "Sur la tablette arbitre : ouvrez un navigateur et entrez l'adresse",
            "Entrez le mot de passe de l'arène pour accéder à l'interface arbitre",
          ],
        },
        { type: 'h2', text: 'Interfaces disponibles' },
        {
          type: 'ul',
          items: [
            "Accueil (/lobby, ou /) — écran en attente, affecté à une arène depuis l'application",
            'Arbitre (/areneN/arbitre) — saisie des scores, chronomètre, cartons',
            'Arène (/areneN) — affichage des scores ; variantes /areneN/public, /areneN/matchs, /areneN/overlay (OBS), /areneN/poule (feuille de poule)',
            'Kiosque (/kiosk) — affichage en boucle pour écran public',
            'Tireurs (/tireur/ID) — parcours personnel ; résultats (/competition/ID/results)',
            'Appel (/appel) et inscription (/inscription) — pointage et inscription sur place',
            'Formateur (/formateur) — suivi des arbitres ; Sabre Laser par équipes (/equipeN, /equipeN/arbitre)',
          ],
        },
        { type: 'h2', text: 'Mode hors-ligne' },
        {
          type: 'p',
          text: "Les tablettes arbitres disposent d'un service worker qui met en cache l'interface. En cas de perte de connexion Wi-Fi, les actions sont mises en file d'attente et synchronisées automatiquement à la reconnexion.",
        },
        {
          type: 'warning',
          text: "L'ordinateur principal et les tablettes doivent être sur le même réseau Wi-Fi local. Le port affiché (8066 par défaut) ne doit pas être bloqué par le pare-feu.",
        },
      ],
      en: [
        {
          type: 'p',
          text: 'Remote scoring lets referees enter scores from a tablet or smartphone over Wi-Fi. An Express server is built into the application (port 8066, or the next free one; HTTPS can be enabled).',
        },
        { type: 'h2', text: 'Starting Remote Scoring' },
        {
          type: 'ol',
          items: [
            'Open the competition\'s "📡 Remote scoring" tab',
            'Click "Start remote scoring" — the server starts',
            'Note the displayed address (or scan the QR code)',
            'On the referee tablet: open a browser and enter the address',
            'Enter the arena password to access the referee interface',
          ],
        },
        { type: 'h2', text: 'Available Interfaces' },
        {
          type: 'ul',
          items: [
            'Home (/lobby, or /) — waiting screen, assigned to an arena from the application',
            'Referee (/areneN/arbitre) — score entry, timer, cards',
            'Arena (/areneN) — score display; variants /areneN/public, /areneN/matchs, /areneN/overlay (OBS), /areneN/poule (pool sheet)',
            'Kiosk (/kiosk) — looping display for a public screen',
            'Fencers (/tireur/ID) — personal schedule; results (/competition/ID/results)',
            'Check-in (/appel) and registration (/inscription) — on-site check-in and sign-up',
            'Trainer (/formateur) — referee monitoring; Laser Sabre teams (/equipeN, /equipeN/arbitre)',
          ],
        },
        { type: 'h2', text: 'Offline Mode' },
        {
          type: 'p',
          text: 'Referee tablets have a service worker that caches the interface. If Wi-Fi is lost, actions are queued and automatically synchronized upon reconnection.',
        },
        {
          type: 'warning',
          text: 'The main computer and the tablets must be on the same local Wi-Fi network. The displayed port (8066 by default) must not be blocked by the firewall.',
        },
      ],
      de: [
        {
          type: 'p',
          text: 'Mit der Fernwertung geben Kampfrichter die Ergebnisse per WLAN auf Tablet oder Smartphone ein. Ein Express-Server ist in die Anwendung integriert (Port 8066 oder der nächste freie; HTTPS aktivierbar).',
        },
        { type: 'h2', text: 'Fernwertung starten' },
        {
          type: 'ol',
          items: [
            'Den Reiter „📡 Fernwertung“ des Wettkampfs öffnen',
            'Auf „Fernwertung starten“ klicken — der Server startet',
            'Angezeigte Adresse notieren (oder QR-Code scannen)',
            'Auf dem Kampfrichter-Tablet: Browser öffnen und Adresse eingeben',
            'Passwort der Arena eingeben, um die Kampfrichter-Oberfläche zu öffnen',
          ],
        },
        { type: 'h2', text: 'Verfügbare Oberflächen' },
        {
          type: 'ul',
          items: [
            'Startseite (/lobby oder /) — Warteschirm, wird in der Anwendung einer Arena zugewiesen',
            'Kampfrichter (/areneN/arbitre) — Ergebniseingabe, Uhr, Karten',
            'Arena (/areneN) — Ergebnisanzeige; Varianten /areneN/public, /areneN/matchs, /areneN/overlay (OBS), /areneN/poule (Poolblatt)',
            'Kiosk (/kiosk) — Endlosanzeige für öffentliche Bildschirme',
            'Fechter (/tireur/ID) — persönlicher Ablauf; Ergebnisse (/competition/ID/results)',
            'Eincheck (/appel) und Anmeldung (/inscription) — Vor-Ort-Eincheck und -Anmeldung',
            'Ausbilder (/formateur) — Kampfrichterbetreuung; Laserschwert-Teams (/equipeN, /equipeN/arbitre)',
          ],
        },
        { type: 'h2', text: 'Offline-Modus' },
        {
          type: 'p',
          text: 'Schiedsrichter-Tablets haben einen Service Worker, der die Oberfläche zwischenspeichert. Bei WLAN-Verlust werden Aktionen in die Warteschlange gestellt und bei Wiederverbindung synchronisiert.',
        },
        {
          type: 'warning',
          text: 'Hauptrechner und Tablets müssen im selben lokalen WLAN sein. Der angezeigte Port (standardmäßig 8066) darf nicht von der Firewall blockiert werden.',
        },
      ],
      es: [
        {
          type: 'p',
          text: 'La puntuación remota permite a los árbitros introducir los marcadores desde una tablet o un smartphone por Wi-Fi. La aplicación integra un servidor Express (puerto 8066, o el siguiente libre; HTTPS activable).',
        },
        { type: 'h2', text: 'Iniciar puntuación remota' },
        {
          type: 'ol',
          items: [
            'Abra la pestaña «📡 Puntuación remota» de la competición',
            'Haga clic en «Iniciar la puntuación remota» — el servidor arranca',
            'Anote la dirección mostrada (o escanee el código QR)',
            'En la tablet del árbitro: abra un navegador e introduzca la dirección',
            'Introduzca la contraseña de la pista para acceder a la interfaz de árbitro',
          ],
        },
        { type: 'h2', text: 'Interfaces disponibles' },
        {
          type: 'ul',
          items: [
            'Inicio (/lobby, o /) — pantalla en espera, asignada a una pista desde la aplicación',
            'Árbitro (/areneN/arbitre) — introducción de marcadores, cronómetro, tarjetas',
            'Pista (/areneN) — visualización de marcadores; variantes /areneN/public, /areneN/matchs, /areneN/overlay (OBS), /areneN/poule (hoja de poule)',
            'Quiosco (/kiosk) — visualización en bucle para pantalla pública',
            'Tiradores (/tireur/ID) — recorrido personal; resultados (/competition/ID/results)',
            'Llamada (/appel) e inscripción (/inscription) — control de presencia e inscripción in situ',
            'Formador (/formateur) — seguimiento de árbitros; Sable Láser por equipos (/equipeN, /equipeN/arbitre)',
          ],
        },
        { type: 'h2', text: 'Modo sin conexión' },
        {
          type: 'p',
          text: 'Las tablets árbitro tienen un service worker que almacena la interfaz en caché. Si se pierde el Wi-Fi, las acciones se encolan y se sincronizan automáticamente al reconectarse.',
        },
        {
          type: 'warning',
          text: 'El ordenador principal y las tablets deben estar en la misma red Wi-Fi local. El puerto mostrado (8066 por defecto) no debe estar bloqueado por el cortafuegos.',
        },
      ],
      'zh-HK': [
        {
          type: 'p',
          text: '遠端記分讓裁判透過 Wi-Fi 在平板或手機輸入比分。應用程式內建 Express 伺服器（連接埠 8066，如被佔用則使用下一個；可啟用 HTTPS）。',
        },
        { type: 'h2', text: '啟動遠端記分' },
        {
          type: 'ol',
          items: [
            '開啟比賽的「📡 遠端記分」分頁',
            '按「啟動遠端記分」— 伺服器隨即啟動',
            '記下顯示的網址（或掃描 QR 碼）',
            '在裁判平板上開啟瀏覽器並輸入網址',
            '輸入劍道密碼以進入裁判介面',
          ],
        },
        { type: 'h2', text: '可用介面' },
        {
          type: 'ul',
          items: [
            '首頁（/lobby 或 /）— 等候畫面，由應用程式指派至劍道',
            '裁判（/areneN/arbitre）— 輸入比分、計時、警告卡',
            '劍道（/areneN）— 顯示比分；另有 /areneN/public、/areneN/matchs、/areneN/overlay（OBS）、/areneN/poule（分組表）',
            '資訊站（/kiosk）— 公眾螢幕循環播放',
            '選手（/tireur/ID）— 個人賽程；結果（/competition/ID/results）',
            '報到（/appel）及報名（/inscription）— 現場報到及報名',
            '導師（/formateur）— 裁判跟進；光劍團體賽（/equipeN、/equipeN/arbitre）',
          ],
        },
        { type: 'h2', text: '離線模式' },
        {
          type: 'p',
          text: '裁判平板有快取介面的 Service Worker。Wi-Fi 中斷時，操作會排入佇列，重新連線後自動同步。',
        },
        {
          type: 'warning',
          text: '主電腦與平板必須連接同一個本地 Wi-Fi 網絡。顯示的連接埠（預設 8066）不可被防火牆封鎖。',
        },
      ],
      br: [
        {
          type: 'p',
          text: "Gant an enrollañ eus-pell e c'hall an arbitred enrollañ ar skorioù diwar un tablet pe ur pellgomzer dre Wi-Fi. Ur servijer Express a zo enframmet er meziant (porzh 8066, pe an hini da heul ma'z eo implijet ; HTTPS da weredekaat).",
        },
        { type: 'h2', text: 'Kregiñ gant ar skoazell pellek' },
        {
          type: 'ol',
          items: [
            'Digorit ivinell « 📡 Enrollañ eus-pell » ar genstrivadeg',
            "Klikit war « Kregiñ gant an enrollañ eus-pell » — loc'hañ a ra ar servijer",
            "Notennit ar chomlec'h diskouezet (pe skanit ar c'hod QR)",
            "War tablet an arbitr : digorit ur merdeer ha skrivit ar chomlec'h",
            'Skrivit ger-tremen an dachenn evit tizhout etrefas an arbitr',
          ],
        },
        { type: 'h2', text: 'Etrewebezhioù hegerz' },
        {
          type: 'ul',
          items: [
            "Degemer (/lobby, pe /) — skramm o c'hortoz, staget ouzh un dachenn diwar ar meziant",
            'Arbitr (/areneN/arbitre) — enrollañ ar skorioù, kronometr, kartennoù',
            'Tachenn (/areneN) — diskouez ar skorioù ; stummoù /areneN/public, /areneN/matchs, /areneN/overlay (OBS), /areneN/poule (follenn poull)',
            "Kiosk (/kiosk) — diskouez e kelc'h evit ur skramm foran",
            "Klezeourien (/tireur/ID) — hent personel ; disoc'hoù (/competition/ID/results)",
            "Galv (/appel) hag enskrivadur (/inscription) — merkañ ha enskrivañ war al lec'h",
            'Stummer (/formateur) — heuliañ an arbitred ; Klezeour laser a skipailh (/equipeN, /equipeN/arbitre)',
          ],
        },
        { type: 'h2', text: 'Mod hep kevreadenn' },
        {
          type: 'p',
          text: 'Tablettennoù arbitr a zo gant ur service worker a ro ar etrewezhenn en tamm-tamm. Ma vez kollet ar Wi-Fi, an oberiadoù a zo lakaet e rummad-gortozadeg hag asanvet en emgefreek pa vez adkevreaet.',
        },
        {
          type: 'warning',
          text: "An urzhiataer pennañ hag an tabletoù a rank bezañ war ar memes rouedad Wi-Fi lec'hel. Ar porzh diskouezet (8066 dre ziouer) ne rank ket bezañ stanket gant ar maogan.",
        },
      ],
      ca: [
        {
          type: 'p',
          text: "La puntuació remota permet als àrbitres introduir els marcadors des d'una tauleta o un telèfon via Wi-Fi. L'aplicació integra un servidor Express (port 8066, o el següent lliure; HTTPS activable).",
        },
        { type: 'h2', text: 'Iniciar puntuació remota' },
        {
          type: 'ol',
          items: [
            'Obriu la pestanya «📡 Puntuació remota» de la competició',
            "Feu clic a «Iniciar la puntuació remota» — el servidor s'inicia",
            "Anoteu l'adreça mostrada (o escanegeu el codi QR)",
            "A la tauleta de l'àrbitre: obriu un navegador i introduïu l'adreça",
            "Introduïu la contrasenya de la pista per accedir a la interfície d'àrbitre",
          ],
        },
        { type: 'h2', text: 'Interfícies disponibles' },
        {
          type: 'ul',
          items: [
            "Inici (/lobby, o /) — pantalla en espera, assignada a una pista des de l'aplicació",
            'Àrbitre (/areneN/arbitre) — introducció de marcadors, cronòmetre, targetes',
            'Pista (/areneN) — visualització de marcadors; variants /areneN/public, /areneN/matchs, /areneN/overlay (OBS), /areneN/poule (full de poule)',
            'Quiosc (/kiosk) — visualització en bucle per a pantalla pública',
            'Tiradors (/tireur/ID) — recorregut personal; resultats (/competition/ID/results)',
            'Crida (/appel) i inscripció (/inscription) — control de presència i inscripció in situ',
            'Formador (/formateur) — seguiment dels àrbitres; Sabre Làser per equips (/equipeN, /equipeN/arbitre)',
          ],
        },
        { type: 'h2', text: 'Mode sense connexió' },
        {
          type: 'p',
          text: "Les tauletes àrbitre tenen un service worker que emmagatzema la interfície en memòria cau. Si es perd el Wi-Fi, les accions s'encuen i es sincronitzen automàticament en reconnectar-se.",
        },
        {
          type: 'warning',
          text: "L'ordinador principal i les tauletes han d'estar a la mateixa xarxa Wi-Fi local. El port mostrat (8066 per defecte) no ha d'estar bloquejat pel tallafoc.",
        },
      ],
    },
  },

  // ─── FORMULA ────────────────────────────────────────────────────────────────
  {
    id: 'formula',
    icon: '🔧',
    category: 'advanced',
    title: {
      fr: 'Formule personnalisée',
      en: 'Custom Formula',
      de: 'Benutzerdefinierte Formel',
      es: 'Fórmula personalizada',
      'zh-HK': '自訂賽制',
      br: 'Formula personalizet',
      ca: 'Fórmula personalitzada',
    },
    content: {
      fr: [
        {
          type: 'p',
          text: 'Le Constructeur de formule permet de créer des enchaînements de phases sur mesure pour des formats de tournoi non standards.',
        },
        { type: 'h2', text: 'Types de phases' },
        {
          type: 'ul',
          items: [
            "Tour de poules — round-robin avec règles d'avancement",
            'Élimination directe — tableau simple (taille automatique ou forcée, matchs pour la 3e / 5e place)',
            'Classement — phase finale de classement sans élimination',
          ],
        },
        { type: 'h2', text: "Règles d'avancement" },
        {
          type: 'ul',
          items: [
            "Tous avancent — pas d'élimination à cette phase",
            'Top % — ex. 80% des tireurs avancent',
            'Nombre fixe — ex. les 32 premiers',
            'Tableau suivant — nombre de places du tableau suivant',
            'Vainqueur de poule — seuls les premiers de poule avancent',
          ],
        },
        { type: 'h2', text: 'Critères de classement personnalisés' },
        {
          type: 'p',
          text: "Pour chaque phase de poules, vous pouvez choisir l'ordre des critères de classement : V/M, Indice, TD, TR, Confrontation directe, Classement initial, Points personnalisés.",
        },
        { type: 'h2', text: 'Modèles de formule' },
        {
          type: 'p',
          text: "Enregistrez vos formules comme modèles réutilisables. Les modèles s'exportent et s'importent en JSON pour les partager entre ordinateurs.",
        },
        {
          type: 'tip',
          text: 'La simulation dans le Constructeur permet de visualiser comment les tireurs seraient répartis avec la formule actuelle, avant de la valider.',
        },
      ],
      en: [
        {
          type: 'p',
          text: 'The Formula Builder allows you to create custom phase sequences for non-standard tournament formats.',
        },
        { type: 'h2', text: 'Phase Types' },
        {
          type: 'ul',
          items: [
            'Pool round — round-robin with advancement rules',
            'Direct elimination — single bracket (automatic or forced size, 3rd / 5th place matches)',
            'Classification — final ranking phase without elimination',
          ],
        },
        { type: 'h2', text: 'Advancement Rules' },
        {
          type: 'ul',
          items: [
            'All advance — no elimination at this phase',
            'Top % — e.g. 80% of fencers advance',
            'Fixed number — e.g. the top 32',
            'Next bracket — number of places in the next bracket',
            'Pool winner — only pool winners advance',
          ],
        },
        { type: 'h2', text: 'Custom Ranking Criteria' },
        {
          type: 'p',
          text: 'For each pool phase, you can choose the order of ranking criteria: W/M, Index, TS, TR, Head-to-head, Initial ranking, Custom points.',
        },
        { type: 'h2', text: 'Formula Templates' },
        {
          type: 'p',
          text: 'Save your formulas as reusable templates. Templates can be exported and imported as JSON to share them between computers.',
        },
        {
          type: 'tip',
          text: 'The simulation in the Formula Builder lets you visualize how fencers would be distributed with the current formula before committing.',
        },
      ],
      de: [
        {
          type: 'p',
          text: 'Der Formel-Builder ermöglicht die Erstellung benutzerdefinierter Phasenabfolgen für nicht-standardmäßige Turnierformate.',
        },
        { type: 'h2', text: 'Phasentypen' },
        {
          type: 'ul',
          items: [
            'Pool-Runde — Round-Robin mit Aufstiegsregeln',
            'Direktausscheidung — einfaches Tableau (automatische oder feste Größe, Gefechte um Platz 3 / 5)',
            'Klassifizierung — abschließende Ranglistenphase ohne Ausscheidung',
          ],
        },
        { type: 'h2', text: 'Aufstiegsregeln' },
        {
          type: 'ul',
          items: [
            'Alle steigen auf — keine Ausscheidung in dieser Phase',
            'Top % — z. B. 80 % der Fechter steigen auf',
            'Feste Anzahl — z. B. die besten 32',
            'Nächstes Tableau — Anzahl der Plätze im nächsten Tableau',
            'Poolsieger — nur die Poolsieger steigen auf',
          ],
        },
        { type: 'h2', text: 'Benutzerdefinierte Ranglistenkriterien' },
        {
          type: 'p',
          text: 'Für jede Poolphase lässt sich die Reihenfolge der Ranglistenkriterien wählen: S/G, Index, GT, ET, Direktvergleich, Ausgangsrangliste, Eigene Punkte.',
        },
        { type: 'h2', text: 'Formelvorlagen' },
        {
          type: 'p',
          text: 'Speichern Sie Ihre Formeln als wiederverwendbare Vorlagen. Vorlagen lassen sich als JSON exportieren und importieren, um sie zwischen Rechnern zu teilen.',
        },
        {
          type: 'tip',
          text: 'Die Simulation im Formel-Builder zeigt, wie Fechter mit der aktuellen Formel verteilt würden, bevor Sie bestätigen.',
        },
      ],
      es: [
        {
          type: 'p',
          text: 'El Constructor de fórmulas permite crear secuencias de fases personalizadas para formatos de torneo no estándar.',
        },
        { type: 'h2', text: 'Tipos de fases' },
        {
          type: 'ul',
          items: [
            'Ronda de poules — todos contra todos con reglas de avance',
            'Eliminación directa — cuadro simple (tamaño automático o forzado, combates por el 3.er / 5.º puesto)',
            'Clasificación — fase de clasificación final sin eliminación',
          ],
        },
        { type: 'h2', text: 'Reglas de avance' },
        {
          type: 'ul',
          items: [
            'Todos avanzan — sin eliminación en esta fase',
            'Top % — p. ej. avanza el 80% de los tiradores',
            'Número fijo — p. ej. los 32 primeros',
            'Cuadro siguiente — número de plazas del cuadro siguiente',
            'Ganador de poule — solo avanzan los primeros de poule',
          ],
        },
        { type: 'h2', text: 'Criterios de clasificación personalizados' },
        {
          type: 'p',
          text: 'Para cada fase de poules puede elegir el orden de los criterios de clasificación: V/C, Índice, TD, TR, Enfrentamiento directo, Clasificación inicial, Puntos personalizados.',
        },
        { type: 'h2', text: 'Plantillas de fórmula' },
        {
          type: 'p',
          text: 'Guarde sus fórmulas como plantillas reutilizables. Las plantillas se exportan e importan en JSON para compartirlas entre ordenadores.',
        },
        {
          type: 'tip',
          text: 'La simulación en el Constructor de fórmulas te permite visualizar cómo se distribuirían los tiradores con la fórmula actual antes de confirmar.',
        },
      ],
      'zh-HK': [
        { type: 'p', text: '賽制生成器可為非標準賽事格式建立自訂賽段序列。' },
        { type: 'h2', text: '賽段類型' },
        {
          type: 'ul',
          items: [
            '分組輪次 — 循環賽加晉級規則',
            '直接淘汰 — 單敗淘汰表（自動或指定大小，第 3 / 5 名賽）',
            '排名賽 — 無淘汰的最終排名賽段',
          ],
        },
        { type: 'h2', text: '晉級規則' },
        {
          type: 'ul',
          items: [
            '全部晉級 — 此階段不淘汰',
            '前 % — 例如 80% 選手晉級',
            '固定人數 — 例如前 32 名',
            '下一淘汰表 — 下一淘汰表的名額',
            '分組首名 — 只有各組首名晉級',
          ],
        },
        { type: 'h2', text: '自訂排名標準' },
        {
          type: 'p',
          text: '每個分組階段可自訂排名準則次序：勝率、淨得分、得分、失分、直接對賽、初始排名、自訂積分。',
        },
        { type: 'h2', text: '賽制模板' },
        {
          type: 'p',
          text: '可將賽制儲存為範本重複使用。範本可匯出及匯入為 JSON，方便在不同電腦間共用。',
        },
        { type: 'tip', text: '賽制生成器中的模擬功能可在確認前預覽選手如何依當前賽制分配。' },
      ],
      br: [
        {
          type: 'p',
          text: "Ar Savour Formula a ro krouiñ rummadoù fazioù personalizet evit furmadoù torneoù n'int ket reizh.",
        },
        { type: 'h2', text: 'Seurtadoù fazioù' },
        {
          type: 'ul',
          items: [
            'Taol poulloù — round-robin gant reolioù ironed',
            'Eliminerezh war-eeun — taolenn eeun (ment emgefreek pe rediet, emgannoù evit an 3de / 5vet plas)',
            'Renk — faz renk dibenn hep eliminadur',
          ],
        },
        { type: 'h2', text: 'Reolioù ironed' },
        {
          type: 'ul',
          items: [
            'An holl a ya war-raok — eliminerezh ebet er prantad-mañ',
            'Top % — sk. 80% eus ar glezeourien a ya war-raok',
            'Niver start — sk. an 32 kentañ',
            'Taolenn da heul — niver a blasoù en daolenn da heul',
            'Gounezer ar poull — ar re gentañ hepken a ya war-raok',
          ],
        },
        { type: 'h2', text: 'Arvesterioù renk personalizet' },
        {
          type: 'p',
          text: "Evit pep prantad poulloù e c'hallit dibab urzh an dezverkoù renkañ : T/E, Meneg, TR, TB, Emgann war-eeun, Renkadur kentañ, Poentoù personelaet.",
        },
        { type: 'h2', text: 'Patromoù formula' },
        {
          type: 'p',
          text: 'Enrollit ho formulennoù evel patromoù adimplijadus. Ar patromoù a vez ezporzhiet hag enporzhiet e JSON evit o rannañ etre urzhiataerioù.',
        },
        {
          type: 'tip',
          text: "Ar simulerezh er Savour a ro gwelout penaos e vefe ranneet ar c'hlañvourien gant ar formula a-vremañ, a-raok kadarnaat.",
        },
      ],
      ca: [
        {
          type: 'p',
          text: 'El Constructor de fórmules permet crear seqüències de fases personalitzades per a formats de torneig no estàndard.',
        },
        { type: 'h2', text: 'Tipus de fases' },
        {
          type: 'ul',
          items: [
            "Ronda de poules — tots contra tots amb regles d'avanç",
            'Eliminació directa — quadre simple (mida automàtica o forçada, combats pel 3r / 5è lloc)',
            'Classificació — fase de classificació final sense eliminació',
          ],
        },
        { type: 'h2', text: "Regles d'avanç" },
        {
          type: 'ul',
          items: [
            'Tots avancen — sense eliminació en aquesta fase',
            'Top % — p. ex. avança el 80% dels tiradors',
            'Nombre fix — p. ex. els 32 primers',
            'Quadre següent — nombre de places del quadre següent',
            'Guanyador de poule — només avancen els primers de poule',
          ],
        },
        { type: 'h2', text: 'Criteris de classificació personalitzats' },
        {
          type: 'p',
          text: "Per a cada fase de poules podeu triar l'ordre dels criteris de classificació: V/C, Índex, TD, TR, Enfrontament directe, Classificació inicial, Punts personalitzats.",
        },
        { type: 'h2', text: 'Plantilles de fórmula' },
        {
          type: 'p',
          text: "Deseu les vostres fórmules com a plantilles reutilitzables. Les plantilles s'exporten i s'importen en JSON per compartir-les entre ordinadors.",
        },
        {
          type: 'tip',
          text: 'La simulació al Constructor de fórmules us permet visualitzar com es distribuirien els tiradors amb la fórmula actual abans de confirmar.',
        },
      ],
    },
  },
  ...ADVANCED_ARTICLES,
];

// ─── Category labels ─────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, Record<WikiLang, string> & { icon: string }> = {
  start: {
    fr: 'Démarrage',
    en: 'Getting Started',
    de: 'Einstieg',
    es: 'Inicio',
    'zh-HK': '入門',
    br: 'Kregiñ',
    ca: 'Inici',
    icon: '🚀',
  },
  competition: {
    fr: 'Compétition',
    en: 'Competition',
    de: 'Wettkampf',
    es: 'Competición',
    'zh-HK': '比賽',
    br: 'Kenstrivadeg',
    ca: 'Competició',
    icon: '🏆',
  },
  phases: {
    fr: 'Phases',
    en: 'Phases',
    de: 'Phasen',
    es: 'Fases',
    'zh-HK': '賽制',
    br: 'Traoùioù',
    ca: 'Fases',
    icon: '📋',
  },
  remote: {
    fr: 'Saisie',
    en: 'Remote',
    de: 'Fernwertung',
    es: 'Remoto',
    'zh-HK': '遠端',
    br: 'Pellek',
    ca: 'Remot',
    icon: '📡',
  },
  advanced: {
    fr: 'Avancé',
    en: 'Advanced',
    de: 'Erweitert',
    es: 'Avanzado',
    'zh-HK': '進階',
    br: 'Araoket',
    ca: 'Avançat',
    icon: '🔧',
  },
};

export const VALID_LANGS: WikiLang[] = ['fr', 'en', 'de', 'es', 'zh-HK', 'br', 'ca'];

export function getLang(language: string): WikiLang {
  return VALID_LANGS.includes(language as WikiLang) ? (language as WikiLang) : 'en';
}

export function getTitle(article: WikiArticle, lang: WikiLang): string {
  return article.title[lang] ?? article.title['en'];
}

export function getContent(article: WikiArticle, lang: WikiLang) {
  return article.content[lang] ?? article.content['en'];
}

export const SEARCH_PLACEHOLDER: Record<WikiLang, string> = {
  fr: 'Rechercher…',
  en: 'Search…',
  de: 'Suchen…',
  es: 'Buscar…',
  'zh-HK': '搜尋…',
  br: 'Klask…',
  ca: 'Cercar…',
};

export const NO_RESULTS_LABEL: Record<WikiLang, string> = {
  fr: 'Aucun résultat',
  en: 'No results',
  de: 'Keine Ergebnisse',
  es: 'Sin resultados',
  'zh-HK': '無結果',
  br: "Disoc'h ebet",
  ca: 'Cap resultat',
};
