/**
 * @starui/runtime-port — Seam #1 of the new architecture.
 *
 * Foundation-layer package: pure types + interface; no runtime imports.
 * Implementations live in `@starui/runtime-openfin` and
 * `@starui/runtime-browser`.
 */

export type {
  IdentitySnapshot,
  SurfaceHandle,
  SurfaceKind,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from './types.js';

export { LOGGED_IN_USER_ID } from './types.js';

export type { RuntimePort } from './RuntimePort.js';
