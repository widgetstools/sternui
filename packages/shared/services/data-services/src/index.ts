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
 * `probeStomp` / `probeRest` / `inferFields` are pure main-thread
 * helpers (the design doc's `transport: 'main'` mode) consumed by
 * editors for "Test connection" and "Infer fields" flows.
 */

// Runtime surface — main-thread types + helpers.
export * from './runtime/index.js';

// One-shot probes — pure main-thread functions for editor flows
// (Test connection, Infer fields). Same vocabulary the streaming
// runtime uses; calling them in-process is the design doc's
// `transport: 'main'` mode.
export {
  probeStomp,
  probeRest,
  inferFields,
  type StompProbeResult,
  type StompProbeOpts,
  type RestProbeResult,
  type InferOptions,
} from './runtime/providers/index.js';

export {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './services/index.js';
