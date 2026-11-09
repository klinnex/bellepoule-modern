# Primitives d'interface (renderer)

Référence des composants communs de `src/renderer/components/common/`. Issue de suivi : [klinnex/bellepoule-modern#1529](https://github.com/klinnex/bellepoule-modern/issues/1529).

## Button

Fichier : `common/Button.tsx` · styles : `styles/design.css` (variantes, tailles) et `styles/buttons.css` (icône seule, chargement).

| Prop | Valeurs | Rôle |
|---|---|---|
| `variant` | `primary` (défaut `secondary`), `secondary`, `danger`, `success`, `warning`, `ghost` | Intention de l'action |
| `size` | `sm`, `md`, `lg` | Taille (sans prop : taille par défaut) |
| `icon` | nœud React | Icône placée avant le libellé |
| `loading` | booléen | Action en cours : bouton désactivé, `aria-busy`, spinner. Le libellé reste affiché |

Icône seule : sans enfants, le bouton prend la classe `btn-icon-only` et **doit** recevoir un `aria-label` (vérifié par le type).

Le type `button` est implicite (pas de soumission de formulaire par accident).

```tsx
<Button variant="primary" loading={saving}>Enregistrer</Button>
<Button variant="ghost" icon={<X size={16} />} aria-label={t('actions.close')} />
```

## Garde-fou

`npm run check:quality` compte les `className` JSX qui écrivent la classe `btn` à la main (compteur `rawBtn`). La référence ne peut que baisser : migrer un bouton vers `<Button>` fait diminuer le compteur, le réintroduire le fait échouer.

Pour lister les occurrences restantes :

```bash
node scripts/check-quality-ratchet.js --list rawBtn
```
