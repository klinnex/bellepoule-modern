# ADR-0015 — Le plan des pistes (piste de départ, pistes indisponibles) est une donnée du moteur

- **Statut** : Acceptée (principe : 2026-11-20) ; stockage à valider en revue
- **Date** : 2026-11-20
- **Tickets** : #1501, #1878, #1958, #1979

## Contexte

Le plan des pistes d'une épreuve a deux composantes, stockées à deux endroits côté écran :

| Donnée | Stockage actuel | Lecteurs |
|---|---|---|
| Piste de départ (`remoteStripStart`) | état de session de l'écran (`session_state`, `useCompetitionSession`) | écran, feuilles de poule (QR), serveur distant |
| Pistes indisponibles | `localStorage` **du poste**, clé `bellepoule-strips-unavailable-<épreuve>` (`renderer/hooks/useStripAvailability.ts`) | écran (cartes, boutons de piste, répartition du tableau), serveur distant |

Le serveur distant reçoit le plan **de l'écran** (`useStripPlanSync` → `remote:setStripPlan` →
`main/remote/stripPlan.ts`), et seulement quand la saisie distante est active.

Cela pose quatre problèmes :

- **Perte du marquage** : une piste marquée en panne sur un poste est inconnue d'un second poste,
  d'une restauration `.bpm` et d'un redémarrage dans un autre profil.
- **Ignorée par le moteur** : le MCP, l'affectation des pistes de la journée (#1878,
  `dayStripHandlers`) et le futur planning (#1958) ne la voient pas.
- **Règle de répartition dans l'écran** : `distributeArenasRoundRobin`
  (`useTableauViewState.tsx`) lit le store de l'écran.
- **Sens inversé** : le moteur apprend le plan par l'écran, alors que c'est lui qui devrait le
  fournir.

## Décision

- Le plan des pistes d'une épreuve, `{ start, unavailable[] }`, est une **donnée du moteur**,
  enregistrée en base. Écran, tablettes, MCP, affectation des pistes de la journée et planning
  le lisent par le contrat. Aucun ne le garde comme source.
- **Stockage (proposé)** : migration **47**, autorisée par cette ADR
  ([ADR-0011](0011-migrations-schema-3-0.md)) :

  ```sql
  CREATE TABLE competition_strip_plans (
    competition_id TEXT PRIMARY KEY,
    start          INTEGER NOT NULL DEFAULT 1,
    unavailable    TEXT NOT NULL DEFAULT '[]',   -- JSON, entiers > 0, triés, sans doublon
    updated_at     TEXT NOT NULL
  );
  ```

  La table est purgée et archivée par le parcours générique de `competition_id` (RGPD, `.bpm`),
  comme `competition_events`.
- **Commandes** ([ADR-0008](0008-nommage-contrat.md)) :
  - `setStripStart({ competitionId, start })` ;
  - `setStripAvailability({ competitionId | eventDayId, strip, available, dryRun })`.
    - Avec `eventDayId`, la piste est marquée pour **toutes** les épreuves de la journée, dans
      une transaction : une piste en panne l'est pour la salle.
  - Une requête `getStripPlan({ competitionId })` et le signal `changed` de portée `strips`
    ([ADR-0010](0010-bus-evenements.md)).
- **Validation unique** : `normalizeStripPlan` (aujourd'hui dans `main/remote/stripPlan.ts`) part
  dans `shared/domain/planning/` avec `nextFreeStrip` et la répartition des pistes du tableau
  (`distributeArenasRoundRobin`).
- **Diffusion** : le moteur pousse le plan au serveur distant à chaque changement. `remote:setStripPlan`
  et `useStripPlanSync` disparaissent.
- **Reprise de l'existant** : au premier chargement d'une épreuve dont le plan est absent en
  base, l'écran envoie le contenu de son `localStorage` par `setStripAvailability`, puis efface la
  clé.
  - La piste de départ est reprise de `session_state` par la migration 47.
  - Ce code de reprise est retiré après la 3.0.

## Conséquences

- #1958 (planning) lit les pistes disponibles par le moteur dès le départ. **Ce changement est un
  prérequis de #1958.**
- L'affectation des pistes de la journée (#1878) exclut les pistes indisponibles de chaque
  épreuve.
- `useStripAvailability` devient un simple lecteur du contrat. Le cliquet `electronApiCalls`
  baisse d'autant.
- Le marquage n'est pas journalisé tant que [ADR-0007](0007-format-evenement.md) n'est pas
  appliquée et #1980 dégelé.
  - Le type `StripAvailabilityChanged` sera ajouté à ce moment-là.
  - La commande est déjà le seul chemin d'écriture ([ADR-0005](0005-journal-un-fait-un-chemin.md)).

## Alternatives écartées

- **Ranger le plan dans `competitions.settings`** : on éviterait une migration, mais on
  mêlerait un état de salle, qui change pendant la journée, aux réglages de l'épreuve, fixés
  avant. Et la piste de départ reste dans `session_state`.
- **Ajouter une règle « indisponible » à `event_day_strip_rules`** : cela ne couvre que les
  épreuves rattachées à une journée. Une épreuve seule n'aurait pas de plan.
- **Laisser `localStorage` et synchroniser le serveur** : le moteur resterait dépendant d'un
  écran ouvert. C'est la situation actuelle.
