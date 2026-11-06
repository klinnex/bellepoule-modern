// Vitest 5 : Assertion<R, T> (R = type de retour). L'augmentation livrée par
// @testing-library/jest-dom 7 cible l'ancienne signature Assertion<T> et ne s'applique plus.
import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends TestingLibraryMatchers<any, R> {}
}
