/**
 * BellePoule Modern - Drapeaux booléens groupés (modales, menus) dans un seul état (#1241)
 * Remplace une série de useState<boolean>(false) : un seul reducer, setters stables
 * compatibles React.Dispatch<SetStateAction<boolean>> (valeur ou fonction).
 * Licensed under GPL-3.0
 */
import { useMemo, useReducer, type Dispatch, type SetStateAction } from 'react';

export type ModalFlags<K extends string> = { [P in K]: boolean } & {
  [P in K as `set${Capitalize<P>}`]: Dispatch<SetStateAction<boolean>>;
};

type Action<K extends string> = { key: K; value: SetStateAction<boolean> };

function reducer<K extends string>(state: Record<K, boolean>, { key, value }: Action<K>) {
  const next = typeof value === 'function' ? value(state[key]) : value;
  return next === state[key] ? state : { ...state, [key]: next };
}

/** `keys` doit être constant (tableau littéral `as const` hors du composant). */
export function useModalFlags<K extends string>(keys: readonly K[]): ModalFlags<K> {
  const [state, dispatch] = useReducer(
    reducer<K>,
    keys,
    ks => Object.fromEntries(ks.map(k => [k, false])) as Record<K, boolean>
  );
  const setters = useMemo(
    () =>
      Object.fromEntries(
        keys.map(k => [
          `set${k[0].toUpperCase()}${k.slice(1)}`,
          (value: SetStateAction<boolean>) => dispatch({ key: k, value }),
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return { ...state, ...setters } as ModalFlags<K>;
}
