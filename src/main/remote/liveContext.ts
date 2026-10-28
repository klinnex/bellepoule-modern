/**
 * BellePoule Modern - Contexte d'accesseurs générique (#1240)
 * Construit un contexte dont chaque propriété lit/écrit directement le serveur (valeurs toujours
 * à jour) ; les méthodes sont liées à l'instance. Le typage vient de l'interface de contexte du module.
 * Licensed under GPL-3.0
 */

/**
 * @param self instance du serveur
 * @param state noms des propriétés d'état (lecture + écriture)
 * @param methods noms des méthodes (appel délégué à l'instance)
 */
export function liveContext<C extends object>(
  self: object,
  state: readonly string[],
  methods: readonly string[] = []
): C {
  const target = self as Record<string, unknown> & Record<string, (...a: unknown[]) => unknown>;
  const ctx: Record<string, unknown> = {};
  for (const name of state) {
    Object.defineProperty(ctx, name, {
      get: () => target[name],
      set: v => {
        target[name] = v;
      },
      enumerable: true,
    });
  }
  for (const name of methods) {
    ctx[name] = (...a: unknown[]) => target[name](...a);
  }
  return ctx as C;
}
