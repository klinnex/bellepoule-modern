# Contribuer à BellePoule Modern

Merci de votre intérêt pour le projet !

## Signaler un bug

1. Vérifier que le bug n'est pas déjà signalé dans les [Issues GitHub](https://github.com/BellePoule-Modern/bellepoule-modern/issues).
2. Ouvrir une nouvelle issue en précisant :
   - Version du logiciel (menu **Aide > À propos**)
   - Système d'exploitation et version
   - Étapes pour reproduire le problème
   - Comportement attendu vs. observé
   - Captures d'écran si pertinent

## Proposer une fonctionnalité

- Ouvrir une issue avec le label `enhancement` ou une discussion dans [GitHub Discussions](https://github.com/BellePoule-Modern/bellepoule-modern/discussions).
- Décrire le besoin concret (pas uniquement la solution technique).
- Les fonctionnalités liées à la gestion de compétitions d'escrime sont prioritaires.

## Soumettre une Pull Request

1. Forker le dépôt et créer une branche descriptive :
   ```bash
   git checkout -b fix/nom-du-bug
   # ou
   git checkout -b feat/nom-de-la-fonctionnalite
   ```
2. Implémenter les changements en suivant les conventions ci-dessous.
3. S'assurer que les tests passent : `npm run test:run`
4. Vérifier le linting : `npm run lint`
5. Vérifier le formatage : `npm run format:check`
6. Ouvrir la PR vers la branche `main` avec une description claire :
   - Problème résolu ou fonctionnalité ajoutée
   - Solution choisie
   - Tests effectués

## Conventions de code

- **TypeScript strict** — `"strict": true` dans `tsconfig.json`, pas de `any` implicite.
- **Composants React fonctionnels** avec hooks uniquement, pas de composants classe.
- **État global via Zustand** — ne pas créer de contextes React ad hoc pour l'état partagé.
- **CSS plain** — fichiers `.css` uniquement. Ne pas introduire Tailwind CSS ni d'autres frameworks CSS.
- **Nommage** — camelCase pour les variables/fonctions, PascalCase pour les composants et types.
- **Tests** — toute nouvelle logique métier doit être couverte par des tests Vitest (`src/shared/utils/*.test.ts`).
- **Commits** — messages en anglais, au présent (`Fix crash when…`, `Add export for…`).

## Licence

En soumettant une contribution, vous acceptez que votre code soit distribué sous la licence **GPL-3.0** du projet.
Voir [LICENSE](LICENSE) pour le texte complet.
