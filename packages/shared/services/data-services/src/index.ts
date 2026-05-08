/**
 * @starui/data-services — public entry.
 *
 * The runtime is the live surface. The root entry re-exports runtime
 * types so `@starui/data-services` continues to give consumers a
 * usable barrel. For specific entry points use the subpath exports:
 *
 *   `@starui/data-services/runtime`               — protocol types + main-thread helpers
 *   `@starui/data-services/runtime/client`        — the SharedWorkerDataServicesClient
 *   `@starui/data-services/runtime/sharedWorker`  — installSharedWorkerHub + SharedWorkerDataServicesHub
 *
 * `StompProbe` and `DataProviderConfigService` survive at the root for
 * `@starui/widgets-angular`, which still uses the one-shot probe path
 * for "Test connection" and field inference. They migrate to the
 * unified runtime surface when Angular gets its `transport: 'main'`
 * cutover.
 */

// Runtime surface — main-thread types + helpers.
export * from './runtime/index.js';

// Probes — one-shot snapshot fetchers consumed by editors.
export {
  StompProbe,
  StreamProviderBase,
  ProviderBase,
  type StompConnectionConfig,
  type StompConnectionResult,
  type ProviderEmitter,
  type Unsubscribe as ProviderUnsubscribe,
  type StreamProviderListener,
  type StreamStatistics,
} from './probes/index.js';

export {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './services/index.js';
