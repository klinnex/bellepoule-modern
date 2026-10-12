# User Manual

This comprehensive guide covers all features of BellePoule Modern for tournament organizers, referees, and competition managers.

## 📖 Table of Contents

1. [Getting Started](#getting-started)
2. [Creating a Competition](#creating-a-competition)
3. [Importing Fencers](#importing-fencers)
4. [Managing Competition Phases](#managing-competition-phases)
5. [Remote Scoring Setup](#-remote-scoring-setup)
6. [Exporting Results](#-exporting-results)
7. [Advanced Features](#-advanced-features)

## 🚀 Getting Started

### First Launch

When you first open BellePoule Modern, you'll see the main competition list screen:

```
┌─────────────────────────────────────────────────────────────┐
│ 🤺 BellePoule Modern                    ☰ Help □ □ ⊗       │
├─────────────────────────────────────────────────────────────┤
│ [+ New Competition]           [🔍 Search]        [⚙️]     │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏅 Regional Championship - Épée                      │ │
│ │ Date: 2024-03-15 | Fencers: 24 | Status: In Progress │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏅 Youth Tournament - Fleuret                          │ │
│ │ Date: 2024-03-10 | Fencers: 18 | Status: Completed    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Main Interface Elements

- **☰ Menu**: Access all application functions
- **🔍 Search**: Find competitions quickly
- **⚙️ Properties**: Configure competition settings
- **Status Indicators**: Show competition progress (Not Started, In Progress, Completed)

## 🏆 Creating a Competition

### Basic Competition Setup

1. **Click "[+] New Competition"** or use **Menu > Competition > New**

2. **Fill in Competition Information**:

```
┌─────────────────────────────────────────────────────────────┐
│ New Competition                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Competition Name: [Regional Championship        ]          │
│                                                             │
│ Weapon:           [Épée ▼]                                │
│                                                             │
│ Gender:           [Male ▼]                                │
│                                                             │
│ Date:             [2024-03-15       ]                     │
│                                                             │
│ Location:         [Fencing Club du Centre ]               │
│                                                             │
│ Description:      [Annual regional competition           ] │
│                   [for qualified fencers               ] │
│                                                             │
│           [Cancel]                   [Create Competition]   │
└─────────────────────────────────────────────────────────────┘
```

3. **Competition Properties** (after creation):

```
┌─────────────────────────────────────────────────────────────┐
│ Competition Properties                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Formula Settings:                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Pool Rounds: [1 ▼]                                    │ │
│ │ Direct Elimination: [✓] Enabled                        │ │
│ │ Max Score Pool: [21 ▼]                                │ │
│ │ Max Score Table: [15 ▼]                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Other Settings:                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Auto-save: [✓] Every 2 minutes                        │ │
│ │ Export Format: [BellePoule XML ▼]                     │ │
│ │ Language: [Français ▼]                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│               [Cancel]                   [Save Changes]     │
└─────────────────────────────────────────────────────────────┘
```

### Competition Types

| Type                | Description                       | Use Case               |
| ------------------- | --------------------------------- | ---------------------- |
| **Standard FIE**    | 1 pool round + Direct elimination | Official competitions  |
| **Pool Only**       | 1-3 pool rounds, no elimination   | Training, small events |
| **2 Pools + Table** | 2 pool rounds + elimination       | Large groups           |
| **Laser Sabre**     | Special Quest Points system       | Laser sabre events     |

## 👥 Importing Fencers

### Supported File Formats

#### 1. FFE Files (.fff, .csv)

**Standard Format**: `NOM;PRENOM;SEXE;DATE_NAISSANCE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT`

**Example**:

```
DUPONT;Jean;M;15/03/1995;FRA;Île-de-France;Paris Escrime;12345678;12
MARTIN;Marie;F;22/07/1998;FRA;Provence;Marseille Club;87654321;8
```

#### 2. Mixed Format (commas in names)

**Format**: `NOM,PRENOM,DATE,SEXE,NATION;[vide];LICENCE,RÉGION,CLUB`

**Example**:

```
DUPONT,JEAN,15/03/1995,M,FRA;;12345678,ÎLE-DE-FRANCE,PARIS ESCRIME
MARTIN,MARIE,22/07/1998,F,FRA;;87654321,PROVENCE,MARSEILLE CLUB
```

#### 3. XML BellePoule Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Competition>
  <Tireur Nom="DUPONT" Prenom="Jean" Sexe="M" Nation="FRA"
          Club="Paris Escrime" Licence="12345678" Classement="12"/>
  <Tireur Nom="MARTIN" Prenom="Marie" Sexe="F" Nation="FRA"
          Club="Marseille Club" Licence="87654321" Classement="8"/>
</Competition>
```

### Import Process

1. **Open Competition** → **Import Fencers**
2. **Select File Type**:
   - [📄 FFE File (.fff, .csv)]
   - [📄 XML BellePoule]
   - [✋ Manual Entry]

3. **Browse and Select File**
4. **Review Import Results**:

```
┌─────────────────────────────────────────────────────────────┐
│ Import Results                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ✅ Successfully imported: 24 fencers                       │
│ ⚠️  Warnings: 2                                            │
│ ❌ Errors: 0                                                │
│                                                             │
│ ┌── Warnings ─────────────────────────────────────────────┐ │
│ │ • Line 15: Date format not recognized "1995-03-15"     │ │
│ │ • Line 22: Invalid ranking "NC" (ignored)             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌── Imported Fencers ─────────────────────────────────────┐ │
│ │ ✓ DUPONT Jean - M - Paris Escrime - Ranking: 12       │ │
│ │ ✓ MARTIN Marie - F - Marseille Club - Ranking: 8       │ │
│ │ ✓ PETIT Pierre - M - Lyon Club - Ranking: 15           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│          [Cancel]                      [Import All]        │
└─────────────────────────────────────────────────────────────┘
```

### Manual Fencer Entry

1. **Click "Add Fencer"** in the Fencers tab
2. **Fill Fencer Information**:

```
┌─────────────────────────────────────────────────────────────┐
│ Add/Edit Fencer                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Last Name:   [DUPONT                         ]             │
│                                                             │
│ First Name:  [Jean                           ]             │
│                                                             │
│ Gender:      [Male ▼]                                     │
│                                                             │
│ Birth Date:  [15/03/1995                     ]             │
│                                                             │
│ Nationality: [FRA ▼]                                     │
│                                                             │
│ League:      [Île-de-France ▼]                           │
│                                                             │
│ Club:        [Paris Escrime                  ]             │
│                                                             │
│ License:     [12345678                       ]             │
│                                                             │
│ Ranking:     [12                            ]             │
│                                                             │
│            [Cancel]                   [Save Fencer]         │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Managing Competition Phases

### Phase 1: Check-in (Pointage)

1. **Open the "Check-in" tab**
2. **Process fencers**:

```
┌─────────────────────────────────────────────────────────────┐
│ Check-in - Regional Championship                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Search: [DUPONT                    ]  [🔍]                 │
│                                                             │
│ ┌── Status Summary ───────────────────────────────────────┐ │
│ │ ✅ Present: 18    ❌ Absent: 3    ⚠️ Pending: 3        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☐ 1  DUPONT Jean        Paris Escrime    M  [✓] Present │ │
│ │ ☐ 2  MARTIN Marie       Marseille Club   F  [✓] Present │ │
│ │ ☑ 3  PETIT Pierre       Lyon Club        M  [✗] Absent  │ │
│ │ ☐ 4  DURAND Sophie      Nice Club        F  [✓] Present │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Generate Pools]  [Manual Selection]  [Export List]       │
└─────────────────────────────────────────────────────────────┘
```

**Status Options**:

- ✅ **Present**: Fencer checked in and ready to compete
- ❌ **Absent**: Fencer not present, will be excluded
- ⚠️ **Pending**: Waiting for check-in
- 🏃 **Withdraw**: Voluntary withdrawal during competition
- 🚫 **Excluded**: Disqualified (black card)

### Phase 2: Pool Rounds

#### Pool Generation

1. **After check-in**, click **"Generate Pools"**
2. **Choose Pool Settings**:

```
┌─────────────────────────────────────────────────────────────┐
│ Pool Generation                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Number of fencers: 18                                       │
│                                                             │
│ Pool size: [6 ▼] fencers per pool                          │
│                                                             │
│ Number of pools: 3                                         │
│                                                             │
│ Separation rules:                                           │
│ ☑ Separate by club                                         │
│ ☑ Separate by league                                        │
│ ☐ Separate by nationality                                  │
│                                                             │
│ Seeding method: [Serpentine by ranking ▼]                 │
│                                                             │
│                [Generate]              [Cancel]           │
└─────────────────────────────────────────────────────────────┘
```

#### Pool Management Interface

```
┌─────────────────────────────────────────────────────────────┐
│ Pool Round 1 - Piste A                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Pool 1                                           [Edit Pool] │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. DUPONT Jean      (12)   FRA   Paris Escrime         │ │
│ │ 2. BERNARD Alice    (15)   FRA   Lyon Club             │ │
│ │ 3. MARTIN Marie     (8)    FRA   Marseille Club        │ │
│ │ 4. LEROY Sophie     (25)   FRA   Toulouse Club         │ │
│ │ 5. MOREAU Luc        (5)    FRA   Bordeaux Club         │ │
│ │ 6. ROBERT Thomas    (18)   FRA   Strasbourg Club        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Matches View                                  [Switch View] │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. DUPONT vs BERNARD      [Score: _-_ ]  [✓] Complete    │ │
│ │ 2. MARTIN vs LEROY        [Score: 5-3 ]  [✓] Complete    │ │
│ │ 3. MOREAU vs ROBERT       [Score: _-_ ]  [○] In Progress  │ │
│ │ 4. DUPONT vs MARTIN       [Score: _-_ ]  [○] Upcoming    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Pool Ranking]  [Next Match]  [Complete Pool]              │
└─────────────────────────────────────────────────────────────┘
```

#### Score Entry in Pools

1. **Click on a match** → **Enter Score**:

```
┌─────────────────────────────────────────────────────────────┐
│ Score Entry - Pool 1, Match 2                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Piste A - Pool 1                                           │
│                                                             │
│ MARTIN Marie          vs          LEROY Sophie             │
│ Marseille Club                     Toulouse Club           │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │         Left Fencer          |    Right Fencer         │ │
│ │ ┌─────────────────────────────┼───────────────────────┐ │ │
│ │ │ MARTIN Marie               │ LEROY Sophie           │ │ │
│ │ │ FRA                        │ FRA                    │ │ │
│ │ └─────────────────────────────┴───────────────────────┘ │ │
│ │                                                             │ │
│ │ [Score: 5]                    [Score: 3]                   │ │
│ │                                                             │ │
│ │ Status: Normal ▼               Status: Normal ▼          │ │
│ │ (Normal/Withdraw/Forfeit/Excluded)                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                     [Cancel]            [Save Score]       │
└─────────────────────────────────────────────────────────────┘
```

#### Pool Ranking

```
┌─────────────────────────────────────────────────────────────┐
│ Pool 1 Ranking                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Pos | Fencer              | V | M | TD | TR | Indice        │
│─────┼─────────────────────┼───┼───┼────┼────┼──────────────┤
│ 1   │ MOREAU Luc          │ 5 │ 0 │ 25 │ 5  │ 20.00        │
│ 2   │ MARTIN Marie        │ 4 │ 1 │ 22 │ 8  │ 14.00        │
│ 3   │ DUPONT Jean         │ 3 │ 2 │ 21 │ 12 │ 9.00         │
│ 4   │ LEROY Sophie        │ 2 │ 3 │ 18 │ 15 │ 3.00         │
│ 5   │ BERNARD Alice       │ 1 │ 4 │ 15 │ 20 │ -5.00        │
│ 6   │ ROBERT Thomas       │ 0 │ 5 │ 10 │ 25 │ -15.00       │
│                                                             │
│ V: Victories | M: Defeats | TD: Touches Given | TR: Touches │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Formula: Indice = (TD - TR) + (V × 5)                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Export Pool]  [Next Round]  [Generate Tableau]            │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Direct Elimination (Tableau)

#### Tableau Generation

1. **After pools complete**, click **"Generate Tableau"**
2. **Configure Tableau Settings**:

```
┌─────────────────────────────────────────────────────────────┐
│ Tableau Configuration                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Qualified fencers: 18                                      │
│                                                             │
│ Table format: [16 with 2 byes ▼]                         │
│                                                             │
│ Seeding:                                                   │
│ ☑ Use pool rankings for seeding                           │
│ ☑ Place pool winners in separate quarters                  │
│ ☐ Random placement                                         │
│                                                             │
│ Max score: [15 ▼]                                          │
│                                                             │
│                [Generate]              [Cancel]           │
└─────────────────────────────────────────────────────────────┘
```

#### Tableau Display

```
┌─────────────────────────────────────────────────────────────┐
│ Tableau - Round of 16                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                ┌─────────────────────────────────────┐      │
│                │ MOREAU Luc (1)                     │      │
│                │ Paris Escrime                     │      │
│                │               [Score: 15-12]        │      │
│                │ Robert Thomas (16)                │      │
│                │ Strasbourg Club                   │      │
│                └─────────────────────────────────────┘      │
│                           │                               │
│                ┌─────────────────────────────────────┐      │
│                │ MARTIN Marie (8)                    │      │
│                │ Marseille Club                     │      │
│                │               [Score: __-__ ]        │      │
│                │ LEROY Sophie (9)                   │      │
│                │ Toulouse Club                      │      │
│                └─────────────────────────────────────┘      │
│                           │                               │
│                ┌─────────────────────────────────────┐      │
│                │ DUPONT Jean (4)                    │      │
│                │ Paris Escrime                     │      │
│                │               [Bye]                │      │
│                │ Bye                               │      │
│                └─────────────────────────────────────┘      │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Current Match: Piste A - MOREAU vs ROBERT              │ │
│ │ Next Matches:                                            │ │
│ │ • Piste B: MARTIN vs LEROY                             │ │
│ │ • Piste C: DUPONT (bye)                                 │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📱 Remote Scoring Setup

Full guides (French): [REMOTE_SCORE_GUIDE.md](REMOTE_SCORE_GUIDE.md) (organiser),
[docs/ARBITRAGE.md](docs/ARBITRAGE.md) (referee tablet),
[docs/SCENARIOS_MATCH.md](docs/SCENARIOS_MATCH.md) (step-by-step match scenarios).

### Enabling Remote Scoring

1. Open the competition → **📡 Saisie distante** tab.
2. Set the number of **strips/arenas**, the **network interface** and **port** (default 8066).
3. Keep **🔒 HTTPS** checked (self-signed certificate) and click **Start**.
4. Optionally set a **password** per arena (8 characters min.) or a shared password.
5. Show the **QR code** of each arena view (referee, arena screen, pool sheet, public, overlay).

There are no per-referee access codes: access is per arena (URL + optional password).
Referees themselves are managed in the competition (check-in, assignment to pools), and
shown on the tablet when referee management is enabled.

### Referee Interface (Tablet)

URL: `https://<organiser-IP>:8066/arene{N}/arbitre`.

1. **Match list**: the arena's matches with status (to play / in progress), search box,
   active black cards.
2. **Match screen**: red fencer left, green fencer right; **+1 / +3 / +5** buttons
   (Laser Sabre zones A/B/C; only +1 for épée/foil/sabre); cards **B J R N**
   (or **P** passivity for Olympic weapons); timer (tap = start/pause, long press = reset);
   **🚪 arena exit**, **↩ undo**, **🏁 finish**; **⇄** swap colours, **👁** colour-blind
   mode, **📣** call the DT.
3. **Long press** a score or card button to remove it.
4. Tie at time → **Launch 30 s** (Laser Sabre) / **1 min** (Olympic) → coin toss if still tied.
   Laser Sabre: both fencers at 10+ points → sudden death, zone C only.
5. Finish → confirm → result sent to the application; signature screen for tableau matches
   if enabled; **POOL FINISHED** screen with signature link at the end of the pool.
6. Works offline: scores are queued and synchronised when the connection returns.

## 📤 Exporting Results

### Export Options

1. **Menu > Competition > Export Results**
2. **Choose Export Format**:

```
┌─────────────────────────────────────────────────────────────┐
│ Export Results                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Export Format:                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☑ BellePoule XML (compatible with original BellePoule) │ │
│ │ ☐ FFF Format (for FFE submission)                      │ │
│ │ ☐ CSV Format (Excel compatible)                        │ │
│ │ ☐ PDF Report (Printable results)                       │ │
│ │ ☐ HTML Report (Web view)                               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Content Selection:                                          │
│ ☑ Final ranking                                            │
│ ☑ Pool results                                             │
│ ☑ Tableau progress                                          │
│ ☑ Individual match details                                 │
│ ☐ Referee assignments                                      │
│                                                             │
│ File name: [regional_championship_eppee_results.xml]       │
│                                                             │
│ Save location: [~/Documents/BellePoule/exports/]           │
│                                                             │
│              [Preview]              [Export]                │
└─────────────────────────────────────────────────────────────┘
```

### Export Formats Examples

#### BellePoule XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Competition Nom="Regional Championship" Arme="Epee" Date="2024-03-15">
  <Phase Nom="Tableau">
    <Tireur Nom="MOREAU" Prenom="Luc" Classement="1"/>
    <Tireur Nom="MARTIN" Prenom="Marie" Classement="2"/>
    <Match Id="1">
      <Vainqueur IdTireur="1" Score="15"/>
      <Perdant IdTireur="2" Score="12"/>
    </Match>
  </Phase>
</Competition>
```

#### CSV Export

```csv
Rank;LastName;FirstName;Club;Victories;Touches Given;Touches Received;Indicator
1;MOREAU;Luc;Paris Escrime;5;25;5;20.00
2;MARTIN;Marie;Marseille Club;4;22;8;14.00
3;DUPONT;Jean;Paris Escrime;3;21;12;9.00
```

#### PDF Report

- Automatically formatted for printing
- Includes official competition stamp placeholders
- Page numbers and competition details
- Pool and tableau results separated

## 🎯 Advanced Features

### Competition Templates

1. **Create reusable templates** for regular events
2. **Save competition settings** (weapon, format, rules)
3. **Quick setup** for recurring tournaments

### Multiple Competitions

- **Manage several competitions** simultaneously
- **Share fencers** between competitions
- **Separate scoring** and rankings

### Integration Features

- **Remote scoring** synchronization
- **Live updates** to displays
- **Export to timing systems**
- **Social media integration**

### Custom Scoring Rules

#### Laser Sabre - Quest Points

| Score Difference | Quest Points |
| ---------------- | ------------ |
| ≤ 3 points       | 1 point      |
| 4-7 points       | 2 points     |
| 8-11 points      | 3 points     |
| ≥ 12 points      | 4 points     |

**Ranking Criteria (2026 rules):**

1. Victories / matches (V/M)
2. Quest Points / matches (Q/M)
3. Index (TD − TR)
4. Victories at 4, then 3, 2, 1 points

## 📚 Additional Resources

### Keyboard Shortcuts

| Shortcut | Function |
| --- | --- |
| **Ctrl/Cmd+N** | New competition |
| **Ctrl/Cmd+O** | Open |
| **Ctrl/Cmd+S** | Save |
| **Ctrl/Cmd+Shift+S** | Save as |
| **Ctrl/Cmd+,** | Settings |
| **Ctrl/Cmd+T** | Add fencer |
| **Ctrl/Cmd+→** | Next phase |
| **Ctrl/Cmd+Shift+I** | Report a bug |
| **F1** | About |

In-app help: the built-in **Wiki** and the shortcut list (`KeyboardShortcutsHelp`).

---

**🎉 Congratulations!** You're now ready to manage fencing competitions with BellePoule Modern. For technical support, see the [Troubleshooting Guide](TROUBLESHOOTING.md).
