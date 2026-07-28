/**
 * `@starui/host-data/runtime/perspective` — the pull-path data plane.
 *
 * A worker entry composes these three: `createPerspectiveHost` owns the engine
 * and the named Tables, `createPerspectiveTableFeed` fills a Table from a
 * provider's emit stream, and `perspectiveSchema` decides the column types.
 * Windows never import any of it — they open a Table by name and read views.
 *
 * Kept off the default worker entry on purpose: the Perspective module is
 * injected, so only an entry that actually opens a blotter pays for its wasm.
 */
export {
  createPerspectiveHost,
  installCustomElementsShim,
  type PerspectiveHost,
  type PerspectiveHostOpts,
  type PerspectiveModuleLike,
  type HostClientLike,
  type HostTableLike,
  type ProxySessionLike,
  type FramePortLike,
} from './perspectiveHost.js';

export {
  createPerspectiveTableFeed,
  type PerspectiveTableFeed,
  type PerspectiveTableFeedOpts,
  type FeedTable,
  type FeedDiagnostic,
} from './perspectiveTableFeed.js';

export {
  observeRows,
  toPerspectiveSchema,
  validateIndexColumn,
  type PerspectiveSchema,
  type PerspectiveColumnType,
  type ColumnObservation,
  type SchemaOptions,
  type DerivedSchema,
} from './perspectiveSchema.js';
