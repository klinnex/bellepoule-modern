## Quoi et pourquoi

<!-- Ticket : #… — ce qui change, pour qui. -->

## Vérifications

- [ ] Les règles métier ajoutées ou modifiées sont dans `src/shared/domain` (pas dans un composant, un hook ou `src/main`) — [ADR-0002](../docs/adr/0002-couches-et-dependances.md)
- [ ] Une écriture nouvelle passe par une commande du contrat (`src/shared/api/contract.ts`), pas par `window.electronAPI` — [ADR-0005](../docs/adr/0005-journal-un-fait-un-chemin.md), [ADR-0008](../docs/adr/0008-nommage-contrat.md)
- [ ] Décision de couche, de schéma SQL, de format d'événement ou de nommage du contrat : ADR jointe ou citée (`docs/adr/`) — [ADR-0001](../docs/adr/0001-processus-adr.md)
- [ ] Textes d'interface traduits (`npm run check:i18n`), `docs/TESTS.md` non commité
- [ ] PR `refactor` ou épique #1978 : draft, **sans auto-merge**
