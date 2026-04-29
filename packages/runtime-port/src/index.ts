/**
 * @marketsui/runtime-port — Seam #1 of the new architecture.
 *
 * Foundation-layer package: pure types + interface; no runtime imports.
 * Implementations live in `@marketsui/runtime-openfin` and
 * `@marketsui/runtime-browser`.
 */

export type {
  IdentitySnapshot,
  SurfaceHandle,
  SurfaceKind,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from './types.js';

export type { RuntimePort } from './RuntimePort.js';
