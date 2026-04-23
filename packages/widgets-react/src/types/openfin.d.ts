/**
 * OpenFin global types — parallel to the declaration in
 * @marketsui/openfin-platform-stern. Duplicated here so widgets-react
 * doesn't pull openfin-platform-stern in purely for a type-side-effect.
 */

/// <reference types="@openfin/core" />

import type * as OpenFin from '@openfin/core';

declare global {
  const fin: typeof OpenFin.fin;

  interface Window {
    fin: typeof OpenFin.fin;
  }
}

export {};
