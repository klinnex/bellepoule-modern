/**
 * BellePoule Modern - Groupe d'états locaux liés dans un seul reducer (#1241)
 * Généralisation de useModalFlags à des valeurs de tout type : un seul état,
 * setters stables `setXxx` compatibles React.Dispatch<SetStateAction<T>> (valeur ou fonction).
 * Licensed under GPL-3.0
 */
import { useMemo, useReducer, type Dispatch, type SetStateAction } from 'react';

export type StateGroup<S extends object> = S & {
  [P in keyof S & string as `set${Capitalize<P>}`]: Dispatch<SetStateAction<S[P]>>;
};

type Action = { key: string; value: unknown };

function reducer(state: Record<string, unknown>, { key, value }: Action) {
  const next = typeof value === 'function' ? (value as (p: unknown) => unknown)(state[key]) : value;
  return Object.is(next, state[key]) ? state : { ...state, [key]: next };
}

/** `initial` n'est lu qu'au premier rendu ; les clés doivent rester constantes. */
export function useStateGroup<S extends object>(initial: S): StateGroup<S> {
  const [state, dispatch] = useReducer(reducer, initial as Record<string, unknown>);
  const setters = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(initial).map(k => [
          `set${k[0].toUpperCase()}${k.slice(1)}`,
          (value: unknown) => dispatch({ key: k, value }),
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return { ...state, ...setters } as StateGroup<S>;
}
