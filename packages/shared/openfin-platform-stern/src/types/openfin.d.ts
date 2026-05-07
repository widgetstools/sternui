/**
 * OpenFin global types
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
