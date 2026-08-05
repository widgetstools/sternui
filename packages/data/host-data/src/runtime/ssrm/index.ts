/**
 * SSRM book hosting for the data-services worker.
 *
 * A worker entry composes the two: `createSsrmHost` owns the engine and the
 * named books, `createSsrmBookFeed` fills one from a provider's emit stream.
 * The engine module is INJECTED by that entry, so `@starui/host-data` carries
 * no dependency on it and a worker that never opens a blotter never loads it.
 */
export { createSsrmBookFeed, inferSsrmSchema } from './ssrmBookFeed.js';
export type {
  SsrmBookFeed,
  SsrmBookFeedOpts,
  SsrmBookSink,
  SsrmFeedDiagnostic,
  SsrmFieldLike,
  SsrmSchemaLike,
} from './ssrmBookFeed.js';
export { createSsrmHost } from './ssrmHost.js';
export type {
  SsrmDeltaLike,
  SsrmEngineLike,
  SsrmEngineModuleLike,
  SsrmHost,
  SsrmHostOpts,
  SsrmWorkerHostLike,
} from './ssrmHost.js';
