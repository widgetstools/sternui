import type { fin as FinApi } from "@openfin/core";

declare global {
  /** Full OpenFin runtime — overrides the minimal `fin` stub from `@starui/grid`. */
  // eslint-disable-next-line no-var
  var fin: FinApi | undefined;
}

export {};
